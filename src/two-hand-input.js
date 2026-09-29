import { GestureEngine } from './gesture-engine.js'
import { GestureQualityEvaluator } from './gesture-quality.js'

export const HANDS = Object.freeze({ LEFT: 'LEFT', RIGHT: 'RIGHT' })

export class TwoHandInput {
  constructor() {
    this.engines = { LEFT: new GestureEngine(), RIGHT: new GestureEngine() }
    this.quality = { LEFT: new GestureQualityEvaluator(), RIGHT: new GestureQualityEvaluator() }
  }

  update(landmarks = [], handedness = [], timestamp) {
    const assigned = assignHands(landmarks, handedness)
    return Object.fromEntries(Object.values(HANDS).map((side) => {
      const hand = assigned[side]
      const gesture = this.engines[side].update(hand ? [hand] : [], timestamp)
      const debug = this.engines[side].getDebugInfo()
      const feedback = this.quality[side].update(hand ? [hand] : [], timestamp, debug.rawGesture, gesture)
      return [side, { gesture, landmarks: hand, debug, feedback }]
    }))
  }
}

export function assignHands(landmarks = [], handedness = []) {
  const assigned = { LEFT: null, RIGHT: null }
  const labels = landmarks.map((_, index) => {
    const label = handedness[index]?.[0]?.categoryName
    // MediaPipe assumes mirrored input. The raw video is not flipped; only its CSS preview is.
    return label === 'Left' ? HANDS.RIGHT : label === 'Right' ? HANDS.LEFT : null
  })

  if (landmarks.length === 2 && labels[0] && labels[1] && labels[0] !== labels[1]) {
    assigned[labels[0]] = landmarks[0]
    assigned[labels[1]] = landmarks[1]
  } else if (landmarks.length === 2 && Boolean(labels[0]) !== Boolean(labels[1])) {
    const knownIndex = labels[0] ? 0 : 1
    const knownSide = labels[knownIndex]
    assigned[knownSide] = landmarks[knownIndex]
    assigned[knownSide === HANDS.LEFT ? HANDS.RIGHT : HANDS.LEFT] = landmarks[1 - knownIndex]
  } else if (landmarks.length === 2) {
    // Fall back to positions in the mirrored preview when labels are absent or conflict.
    const [left, right] = landmarks[0][0].x > landmarks[1][0].x ? landmarks : [landmarks[1], landmarks[0]]
    assigned.LEFT = left
    assigned.RIGHT = right
  } else if (landmarks.length === 1) {
    assigned[labels[0] ?? (landmarks[0][0].x > 0.5 ? HANDS.LEFT : HANDS.RIGHT)] = landmarks[0]
  }

  return assigned
}
