export const GESTURES = Object.freeze({
  NONE: 'NONE',
  POINT: 'POINT',
  OPEN_PALM: 'OPEN_PALM',
  FIST: 'FIST',
  SWIPE_LEFT: 'SWIPE_LEFT',
  SWIPE_RIGHT: 'SWIPE_RIGHT',
})

// All distances are normalized MediaPipe landmark coordinates.
export const GESTURE_THRESHOLDS = Object.freeze({
  EXTENDED_PIP_ANGLE: 155,
  EXTENDED_DIP_ANGLE: 150,
  EXTENDED_TIP_REACH: 1.1,
  FOLDED_JOINT_ANGLE: 135,
  FOLDED_TIP_REACH: 1.05,
  STATIC_GESTURE_FRAMES: 3,
  SWIPE_HISTORY_MS: 400,
  SWIPE_MIN_DISTANCE: 0.18,
  SWIPE_MAX_VERTICAL_DISTANCE: 0.12,
  SWIPE_COOLDOWN_MS: 700,
})

const FINGER_TIPS = [8, 12, 16, 20]
const FINGER_BASES = [5, 9, 13, 17]
const FINGER_PIPS = [6, 10, 14, 18]
const FINGER_DIPS = [7, 11, 15, 19]
const EXPECTED_LANDMARK_COUNT = 21

export class GestureEngine {
  constructor() {
    this.reset()
  }

  update(landmarks, timestamp) {
    const hand = landmarks?.[0]
    this.handDetected = Boolean(hand?.length)
    this.landmarkCount = hand?.length ?? 0
    this.rawGesture = GESTURES.NONE

    if (this.landmarkCount !== EXPECTED_LANDMARK_COUNT) {
      this.resetRecognition()
      return GESTURES.NONE
    }

    const staticGesture = this.detectStaticGesture(hand)
    const swipe = this.detectSwipe(hand[0], timestamp)
    if (swipe) {
      this.rawGesture = swipe
      this.stableGesture = swipe
      this.candidateGesture = GESTURES.NONE
      this.candidateFrames = 0
      return swipe
    }

    this.rawGesture = staticGesture
    this.stabilize(staticGesture)
    return this.stableGesture
  }

  reset() {
    this.handDetected = false
    this.landmarkCount = 0
    this.rawGesture = GESTURES.NONE
    this.resetRecognition()
  }

  resetRecognition() {
    this.stableGesture = GESTURES.NONE
    this.candidateGesture = GESTURES.NONE
    this.candidateFrames = 0
    this.positionHistory = []
    this.swipeCooldownUntil = 0
  }

  getDebugInfo() {
    return {
      handDetected: this.handDetected,
      landmarkCount: this.landmarkCount,
      rawGesture: this.rawGesture,
    }
  }

  detectStaticGesture(landmarks) {
    const fingerStates = FINGER_TIPS.map((tipIndex, fingerIndex) => getFingerState(
      landmarks,
      FINGER_BASES[fingerIndex],
      FINGER_PIPS[fingerIndex],
      FINGER_DIPS[fingerIndex],
      tipIndex,
    ))
    const extended = fingerStates.map((finger) => finger.extended)
    const folded = fingerStates.map((finger) => finger.folded)

    if (extended.every(Boolean)) return GESTURES.OPEN_PALM
    if (extended[0] && folded.slice(1).every(Boolean)) return GESTURES.POINT
    if (folded.every(Boolean)) return GESTURES.FIST

    return GESTURES.NONE
  }

  detectSwipe(wrist, timestamp) {
    this.positionHistory.push({ x: wrist.x, y: wrist.y, timestamp })
    this.positionHistory = this.positionHistory.filter(
      (position) => timestamp - position.timestamp <= GESTURE_THRESHOLDS.SWIPE_HISTORY_MS,
    )

    if (timestamp < this.swipeCooldownUntil) {
      this.positionHistory = [{ x: wrist.x, y: wrist.y, timestamp }]
      return null
    }

    if (this.positionHistory.length < 2) return null

    const start = this.positionHistory[0]
    const horizontalDistance = wrist.x - start.x
    const verticalDistance = Math.abs(wrist.y - start.y)

    if (
      Math.abs(horizontalDistance) < GESTURE_THRESHOLDS.SWIPE_MIN_DISTANCE ||
      verticalDistance > GESTURE_THRESHOLDS.SWIPE_MAX_VERTICAL_DISTANCE
    ) {
      return null
    }

    this.swipeCooldownUntil = timestamp + GESTURE_THRESHOLDS.SWIPE_COOLDOWN_MS
    this.positionHistory = []

    // The preview is mirrored, so MediaPipe's coordinate direction is reversed on screen.
    return horizontalDistance > 0 ? GESTURES.SWIPE_LEFT : GESTURES.SWIPE_RIGHT
  }

  stabilize(candidate) {
    if (candidate === this.candidateGesture) {
      this.candidateFrames += 1
    } else {
      this.candidateGesture = candidate
      this.candidateFrames = 1
    }

    if (this.candidateFrames >= GESTURE_THRESHOLDS.STATIC_GESTURE_FRAMES) {
      this.stableGesture = candidate
    }
  }
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y)
}

function getFingerState(landmarks, baseIndex, pipIndex, dipIndex, tipIndex) {
  const wrist = landmarks[0]
  const base = landmarks[baseIndex]
  const pip = landmarks[pipIndex]
  const dip = landmarks[dipIndex]
  const tip = landmarks[tipIndex]
  const pipAngle = angleDegrees(base, pip, dip)
  const dipAngle = angleDegrees(pip, dip, tip)
  const pipReach = distance(wrist, pip)
  const tipReach = pipReach === 0 ? 0 : distance(wrist, tip) / pipReach

  return {
    extended:
      pipAngle >= GESTURE_THRESHOLDS.EXTENDED_PIP_ANGLE &&
      dipAngle >= GESTURE_THRESHOLDS.EXTENDED_DIP_ANGLE &&
      tipReach >= GESTURE_THRESHOLDS.EXTENDED_TIP_REACH,
    folded:
      pipAngle <= GESTURE_THRESHOLDS.FOLDED_JOINT_ANGLE ||
      dipAngle <= GESTURE_THRESHOLDS.FOLDED_JOINT_ANGLE ||
      tipReach <= GESTURE_THRESHOLDS.FOLDED_TIP_REACH,
  }
}

function angleDegrees(first, vertex, last) {
  const firstVector = { x: first.x - vertex.x, y: first.y - vertex.y }
  const lastVector = { x: last.x - vertex.x, y: last.y - vertex.y }
  const magnitude = Math.hypot(firstVector.x, firstVector.y) * Math.hypot(lastVector.x, lastVector.y)
  if (magnitude === 0) return 0

  const cosine = (firstVector.x * lastVector.x + firstVector.y * lastVector.y) / magnitude
  return Math.acos(Math.min(1, Math.max(-1, cosine))) * (180 / Math.PI)
}
