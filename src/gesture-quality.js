import { FINGER_STATE_THRESHOLDS, getFingerStates, getFistTipExtension, getVSignSeparation } from './finger-state.js'
import { GESTURES } from './gesture-engine.js'

export const GESTURE_QUALITY_THRESHOLDS = Object.freeze({
  EXPECTED_LANDMARK_COUNT: 21,
  STABILITY_HISTORY_MS: 300,
  STABILITY_STEADY_MOVEMENT: 0.15,
  STABILITY_UNSTEADY_MOVEMENT: 0.6,
  OPEN_PALM_MIN_SEPARATION: 0.35,
  OPEN_PALM_IDEAL_SEPARATION: 0.65,
  PALM_FACING_MIN_SCORE: 0.5,
  PALM_FACING_IDEAL_SCORE: 0.8,
  PARTIAL_FINGER_SCORE: 0.5,
  ATTEMPT_MIN_QUALITY: 35,
  SUCCESS_MIN_QUALITY: 80,
})

const MAIN_FINGERS = ['INDEX', 'MIDDLE', 'RING', 'PINKY']
const STATIC_GESTURES = [GESTURES.OPEN_PALM, GESTURES.FIST, GESTURES.POINT, GESTURES.V_SIGN]

export class GestureQualityEvaluator {
  constructor() {
    this.positionHistory = []
  }

  update(landmarks, timestamp, classifiedGesture, stableGesture) {
    const hand = landmarks?.[0]
    if (!hand || hand.length !== GESTURE_QUALITY_THRESHOLDS.EXPECTED_LANDMARK_COUNT) {
      this.positionHistory = []
      return { state: 'neutral', fingerStates: null, components: [] }
    }

    const fingerStates = getFingerStates(hand)
    const stability = this.getStability(hand, timestamp)
    if (classifiedGesture === GESTURES.SWIPE_LEFT || classifiedGesture === GESTURES.SWIPE_RIGHT) {
      return { state: 'neutral', fingerStates, components: [] }
    }

    const evaluations = {
      [GESTURES.OPEN_PALM]: evaluateOpenPalm(hand, fingerStates, stability),
      [GESTURES.FIST]: evaluateFist(hand, fingerStates, stability),
      [GESTURES.POINT]: evaluatePoint(fingerStates, stability),
      [GESTURES.V_SIGN]: evaluateVSign(hand, fingerStates, stability),
    }
    const attemptedGesture = STATIC_GESTURES.includes(classifiedGesture)
      ? classifiedGesture
      : identifyAttempt(fingerStates, evaluations)
    const evaluation = evaluations[attemptedGesture]

    if (classifiedGesture === GESTURES.NONE && evaluation.quality < GESTURE_QUALITY_THRESHOLDS.ATTEMPT_MIN_QUALITY) {
      return { state: 'neutral', fingerStates, components: [] }
    }

    const qualityPasses = evaluation.quality >= GESTURE_QUALITY_THRESHOLDS.SUCCESS_MIN_QUALITY
    const state = classifiedGesture === attemptedGesture && qualityPasses
      ? stableGesture === attemptedGesture ? 'success' : 'pending'
      : 'correcting'
    return {
      state,
      gesture: attemptedGesture,
      attemptedGesture,
      quality: evaluation.quality,
      correction: state === 'correcting' ? evaluation.correction : null,
      fingerStates,
      components: evaluation.components,
    }
  }

  getStability(hand, timestamp) {
    const palmWidth = Math.max(distance(hand[5], hand[17]), 0.001)
    this.positionHistory.push({ x: hand[0].x, y: hand[0].y, timestamp, palmWidth })
    this.positionHistory = this.positionHistory.filter(
      (position) => timestamp - position.timestamp <= GESTURE_QUALITY_THRESHOLDS.STABILITY_HISTORY_MS,
    )
    if (this.positionHistory.length < 2) return 1

    const first = this.positionHistory[0]
    const latest = this.positionHistory[this.positionHistory.length - 1]
    const movement = Math.hypot(latest.x - first.x, latest.y - first.y) / first.palmWidth
    return scoreAtMost(
      movement,
      GESTURE_QUALITY_THRESHOLDS.STABILITY_STEADY_MOVEMENT,
      GESTURE_QUALITY_THRESHOLDS.STABILITY_UNSTEADY_MOVEMENT,
    )
  }
}

function identifyAttempt(states, evaluations) {
  if (states.INDEX !== 'CURLED' && states.MIDDLE !== 'CURLED' &&
    (states.INDEX === 'EXTENDED' || states.MIDDLE === 'EXTENDED') &&
    (states.RING !== 'EXTENDED' || states.PINKY !== 'EXTENDED')) return GESTURES.V_SIGN
  if (states.INDEX === 'EXTENDED' && states.MIDDLE === 'EXTENDED') return GESTURES.OPEN_PALM
  if (states.INDEX === 'EXTENDED') return GESTURES.POINT
  // No extended main finger and at least one bend signals an attempted fist.
  // This does not affect the base classifier's hard FIST validity rule.
  if (MAIN_FINGERS.every((name) => states[name] !== 'EXTENDED')) return GESTURES.FIST
  if (MAIN_FINGERS.filter((name) => states[name] === 'CURLED').length >= 3) return GESTURES.FIST
  return STATIC_GESTURES.reduce((best, gesture) => (
    evaluations[gesture].quality > evaluations[best].quality ? gesture : best
  ), GESTURES.OPEN_PALM)
}

function evaluateVSign(hand, states, stability) {
  const extended = average(['INDEX', 'MIDDLE'].map((name) => stateScore(states[name], 'EXTENDED')))
  const folded = average(['RING', 'PINKY'].map((name) => states[name] !== 'EXTENDED' ? 1 : 0))
  const spread = Math.min(1, getVSignSeparation(hand) / FINGER_STATE_THRESHOLDS.V_SIGN_MIN_SEPARATION_PALM_RATIO)
  const required = extended < 1 ? 'EXTENSION' : folded < 1 ? 'FOLD' : spread < 1 ? 'SPREAD' : null
  return summarize([
    component('EXTENSION', extended, 0.3, 'Extend your index and middle fingers'),
    component('FOLD', folded, 0.25, 'Fold your ring and pinky fingers'),
    component('SPREAD', spread, 0.2, 'Separate your index and middle fingers'),
    component('STABILITY', stability, 0.25, 'Keep your hand steadier'),
  ], required)
}

function evaluateOpenPalm(hand, states, stability) {
  const missing = MAIN_FINGERS.filter((name) => states[name] !== 'EXTENDED')
  const fingerExtension = (MAIN_FINGERS.length - missing.length) / MAIN_FINGERS.length
  const separation = openPalmSeparation(hand)
  const facing = palmFacingScore(hand)
  return summarize([
    component('FINGERS', fingerExtension, 0.75, `Extend your ${fingerNames(missing)} more`),
    component('SPREAD', separation, 0.10, 'Open your fingers wider'),
    component('FACING', facing, 0.08, 'Turn your palm more toward the camera'),
    component('STABILITY', stability, 0.07, 'Keep your hand steadier'),
  ], missing.length ? 'FINGERS' : null)
}

function evaluateFist(hand, states, stability) {
  const uncurled = MAIN_FINGERS.filter((name) => states[name] !== 'CURLED')
  const curl = average(MAIN_FINGERS.map((name) => stateScore(states[name], 'CURLED')))
  const tipExtension = getFistTipExtension(hand)
  const tipPosition = scoreAtMost(
    tipExtension,
    FINGER_STATE_THRESHOLDS.FIST_IDEAL_TIP_EXTENSION_PALM_RATIO,
    FINGER_STATE_THRESHOLDS.FIST_LOW_QUALITY_TIP_EXTENSION_PALM_RATIO,
  )
  const required = uncurled.length
    ? 'CURL'
    : tipExtension > FINGER_STATE_THRESHOLDS.FIST_MAX_TIP_EXTENSION_PALM_RATIO ? 'TIP_POSITION' : null
  return summarize([
    component('CURL', curl, 0.65, uncurled.length === MAIN_FINGERS.length
      ? 'Curl your fingers further'
      : `Curl your ${fingerNames(uncurled)} further`),
    component('TIP_POSITION', tipPosition, 0.15, 'Bring your fingertips toward your palm'),
    component('STABILITY', stability, 0.20, 'Keep your hand steadier'),
  ], required)
}

function evaluatePoint(states, stability) {
  const indexExtension = stateScore(states.INDEX, 'EXTENDED')
  const otherCurl = average(MAIN_FINGERS.slice(1).map((name) => stateScore(states[name], 'CURLED')))
  const required = states.INDEX !== 'EXTENDED' ? 'INDEX' : otherCurl < 1 ? 'OTHER_FINGERS' : null
  return summarize([
    component('INDEX', indexExtension, 0.45, 'Extend your index finger more'),
    component('OTHER_FINGERS', otherCurl, 0.38, 'Keep only your index finger extended'),
    component('STABILITY', stability, 0.17, 'Keep your hand steadier'),
  ], required)
}

function component(name, score, weight, correction) {
  return { name, score, weight, correction }
}

function summarize(components, requiredComponent) {
  const quality = Math.round(100 * components.reduce((total, item) => total + item.score * item.weight, 0))
  const priority = requiredComponent
    ? components.find((item) => item.name === requiredComponent)
    : components.reduce((worst, item) => (
      item.weight * (1 - item.score) > worst.weight * (1 - worst.score) ? item : worst
    ), components[0])
  return { quality, correction: priority.correction, components }
}

function fingerNames(names) {
  if (names.length === 0) return 'fingers'
  if (names.length === 1) return `${names[0].toLowerCase()} finger`
  return `${names.map((name) => name.toLowerCase()).join(' and ')} fingers`
}

function stateScore(state, target) {
  if (state === target) return 1
  if (state === 'PARTIAL') return GESTURE_QUALITY_THRESHOLDS.PARTIAL_FINGER_SCORE
  return 0
}

function openPalmSeparation(hand) {
  const palmWidth = Math.max(distance(hand[5], hand[17]), 0.001)
  const tipDistances = [[8, 12], [12, 16], [16, 20]].map(([first, second]) => (
    distance(hand[first], hand[second]) / palmWidth
  ))
  return scoreAtLeast(
    average(tipDistances),
    GESTURE_QUALITY_THRESHOLDS.OPEN_PALM_MIN_SEPARATION,
    GESTURE_QUALITY_THRESHOLDS.OPEN_PALM_IDEAL_SEPARATION,
  )
}

function palmFacingScore(hand) {
  const indexVector = vectorBetween(hand[0], hand[5])
  const pinkyVector = vectorBetween(hand[0], hand[17])
  const normalZ = Math.abs(indexVector.x * pinkyVector.y - indexVector.y * pinkyVector.x)
  const normalLength = Math.hypot(
    indexVector.y * pinkyVector.z - indexVector.z * pinkyVector.y,
    indexVector.z * pinkyVector.x - indexVector.x * pinkyVector.z,
    normalZ,
  )
  return scoreAtLeast(
    normalLength === 0 ? 0 : normalZ / normalLength,
    GESTURE_QUALITY_THRESHOLDS.PALM_FACING_MIN_SCORE,
    GESTURE_QUALITY_THRESHOLDS.PALM_FACING_IDEAL_SCORE,
  )
}

function scoreAtLeast(value, minimum, ideal) {
  return clamp((value - minimum) / (ideal - minimum))
}

function scoreAtMost(value, ideal, maximum) {
  return clamp((maximum - value) / (maximum - ideal))
}

function clamp(value) {
  return Math.min(1, Math.max(0, value))
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length
}

function vectorBetween(first, second) {
  return { x: second.x - first.x, y: second.y - first.y, z: (second.z ?? 0) - (first.z ?? 0) }
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, (first.z ?? 0) - (second.z ?? 0))
}
