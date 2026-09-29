import { FINGER_STATE_THRESHOLDS, getFingerStates, getFistTipExtension } from './finger-state.js'

export const GESTURES = Object.freeze({
  NONE: 'NONE',
  POINT: 'POINT',
  OPEN_PALM: 'OPEN_PALM',
  FIST: 'FIST',
  SWIPE_LEFT: 'SWIPE_LEFT',
  SWIPE_RIGHT: 'SWIPE_RIGHT',
})

// Swipe distances are normalized MediaPipe landmark coordinates.
export const GESTURE_THRESHOLDS = Object.freeze({
  STATIC_GESTURE_FRAMES: 3,
  SWIPE_HISTORY_MS: 400,
  SWIPE_MIN_DISTANCE: 0.18,
  SWIPE_MAX_VERTICAL_DISTANCE: 0.12,
  SWIPE_COOLDOWN_MS: 700,
})

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
    const { INDEX, MIDDLE, RING, PINKY } = getFingerStates(landmarks)

    if ([INDEX, MIDDLE, RING, PINKY].every((state) => state === 'EXTENDED')) return GESTURES.OPEN_PALM
    if (INDEX === 'EXTENDED' && [MIDDLE, RING, PINKY].every((state) => state !== 'EXTENDED')) return GESTURES.POINT
    if (
      [INDEX, MIDDLE, RING, PINKY].every((state) => state === 'CURLED') &&
      getFistTipExtension(landmarks) <= FINGER_STATE_THRESHOLDS.FIST_MAX_TIP_EXTENSION_PALM_RATIO
    ) return GESTURES.FIST

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
