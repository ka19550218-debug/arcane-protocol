import { GESTURES } from './gesture-engine.js'

export const TRAINING_MODULES = Object.freeze([
  { id: 'POINT', name: 'POINT', category: 'PRECISION', description: 'Acquire five targets across the interface.', instruction: 'Extend your index finger. Guide the cursor into each target and hold for 0.8s.' },
  { id: 'FIST', name: 'FIST', category: 'ATTACK', description: 'Build a reliable attack command.', instruction: 'Curl all four fingers toward your palm. Hold the pose, then open your hand between repetitions.' },
  { id: 'OPEN_PALM', name: 'OPEN PALM', category: 'DEFENSE', description: 'Lock in your defensive posture.', instruction: 'Extend and spread your fingers toward the camera. Hold, then relax between repetitions.' },
  { id: 'V_SIGN', name: 'V SIGN', category: 'SUPER', description: 'Master the Super activation signal.', instruction: 'Extend and separate index + middle. Fold ring + pinky. Hold, then relax between repetitions.' },
  { id: 'SWIPE_LEFT', name: 'SWIPE LEFT', category: 'EVASION', description: 'Practice a deliberate leftward dodge.', instruction: 'Move your hand quickly to your physical left. Pause, return slowly to center, then repeat.' },
  { id: 'SWIPE_RIGHT', name: 'SWIPE RIGHT', category: 'EVASION', description: 'Practice a deliberate rightward dodge.', instruction: 'Move your hand quickly to your physical right. Pause, return slowly to center, then repeat.' },
])
export const TRAINING_TIMING = Object.freeze({ HOLD_MS: 650, RELEASE_MS: 240, MAX_GAP_MS: 250, SWIPE_REPEAT_MS: 800 })
export const POINT_TARGETS = Object.freeze([
  { x: 50, y: 50, name: 'CENTER' }, { x: 13, y: 50, name: 'LEFT' },
  { x: 87, y: 50, name: 'RIGHT' }, { x: 50, y: 17, name: 'TOP' }, { x: 50, y: 83, name: 'BOTTOM' },
])

// Consumes existing recognizer results. No landmarks are reclassified here.
export class TrainingSession {
  constructor(id) {
    this.id = id
    this.count = 0
    this.progress = 0
    this.side = null
    this.holdAt = null
    this.lastAt = null
    this.releaseAt = null
    this.needsRelease = false
    this.lastVerifiedAt = -Infinity
    this.qualityTotal = 0
    this.qualitySamples = 0
    this.holdQuality = []
  }

  get total() { return this.id === 'POINT' ? POINT_TARGETS.length : 3 }
  get complete() { return this.count >= this.total }
  get averageQuality() { return this.qualitySamples ? Math.round(this.qualityTotal / this.qualitySamples) : null }
  get isSwipe() { return this.id.startsWith('SWIPE_') }

  update(hands, now) {
    if (this.complete) return false
    const matches = (hand) => hand?.landmarks && hand.gesture === this.id && hand.debug.rawGesture === this.id
    const side = matches(hands[this.side]) ? this.side : ['LEFT', 'RIGHT'].find((key) => matches(hands[key]))
    const gap = this.lastAt !== null && now - this.lastAt > TRAINING_TIMING.MAX_GAP_MS
    this.lastAt = now
    if (this.id === GESTURES.POINT) return false // Navigation alone verifies targets.
    if (this.needsRelease) {
      // A dropout cannot stand in for a deliberate, visible release.
      const released = ['LEFT', 'RIGHT'].some((key) => hands[key]?.landmarks) &&
        !Object.values(hands).some((hand) => hand?.landmarks &&
          (hand.gesture === this.id || hand.debug.rawGesture === this.id))
      if (!released || gap) this.releaseAt = null
      if (released) this.releaseAt ??= now
      if (this.releaseAt !== null && now - this.releaseAt >= TRAINING_TIMING.RELEASE_MS) this.needsRelease = false
      return false
    }
    if (!side) {
      this.resetHold()
      return false
    }
    if (this.isSwipe) {
      // Swipes are motion events already validated over the engine's history,
      // not static poses: never demand that a one-frame event be held.
      if (now - this.lastVerifiedAt < TRAINING_TIMING.SWIPE_REPEAT_MS) return false
      return this.verify(now)
    }
    if (this.holdAt === null || side !== this.side || gap) {
      this.resetHold()
      this.holdAt = now
    }
    this.side = side
    const quality = hands[side].feedback?.quality
    if (Number.isFinite(quality) && hands[side].feedback.gesture === this.id) this.holdQuality.push(quality)
    this.progress = Math.min(1, (now - this.holdAt) / TRAINING_TIMING.HOLD_MS)
    if (this.progress < 1) return false
    for (const value of this.holdQuality) { this.qualityTotal += value; this.qualitySamples += 1 }
    return this.verify(now)
  }

  acquireTarget(index, source) {
    if (this.id !== 'POINT' || this.complete || source !== 'dwell' || index !== this.count) return false
    this.count += 1
    return true
  }

  verify(now) {
    this.count += 1
    this.lastVerifiedAt = now
    this.needsRelease = true
    this.releaseAt = null
    this.resetHold()
    return true
  }

  resetHold() { this.holdAt = null; this.side = null; this.progress = 0; this.holdQuality = [] }
}
