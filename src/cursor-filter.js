// CURSOR TUNING — laptop webcam defaults (30–60 fps).
// Alpha values are gains at 60 Hz; larger values follow the finger more closely.
export const CURSOR_ALPHA_MIN = 0.24
export const CURSOR_ALPHA_MAX = 0.97
export const CURSOR_DEADZONE = 3 // CSS pixels; radial micro-jitter radius.
// Normalized camera coordinates AFTER horizontal mirroring.
export const CURSOR_X_MIN = 0.20
export const CURSOR_X_MAX = 0.80
export const CURSOR_Y_MIN = 0.18
export const CURSOR_Y_MAX = 0.78
export const POINT_LOST_GRACE_MS = 220
export const DWELL_MAX_MOVEMENT_SPEED = 650 // CSS pixels / second.
export const CURSOR_DEBUG = false // Enable locally for raw/mapped/smoothed telemetry.
const CURSOR_SLOW_SPEED = 35 // CSS pixels / second; precision gain below this.
const CURSOR_FAST_SPEED = 480 // CSS pixels / second; maximum gain above this.
const CURSOR_VELOCITY_TAU_MS = 20
const CURSOR_RECOVERY_MS = 180
export const CURSOR_DEBUG_INTERVAL_MS = 100

// Only cursor coordinates are filtered; landmarks and gesture recognition stay raw.
export class CursorFilter {
  constructor() {
    this.position = null
    this.target = null
    this.lastRaw = null
    this.lastTimestamp = null
    this.velocity = { x: 0, y: 0 }
    this.speed = 0
    this.alpha = CURSOR_ALPHA_MIN
    this.recovery = null
  }

  update(point, bounds, timestamp, resume = false) {
    // Keep the unclamped mapping for velocity, including motion beyond an edge.
    const raw = {
      x: (1 - point.x - CURSOR_X_MIN) / (CURSOR_X_MAX - CURSOR_X_MIN) * bounds.width,
      y: (point.y - CURSOR_Y_MIN) / (CURSOR_Y_MAX - CURSOR_Y_MIN) * bounds.height,
    }
    const mapped = { x: clamp(raw.x, 0, bounds.width), y: clamp(raw.y, 0, bounds.height) }
    this.raw = { x: point.x, y: point.y }
    this.mapped = mapped

    if (!this.position) {
      this.position = { ...mapped }
      this.target = { ...mapped }
      this.rebase(raw, timestamp)
      return this.result(0)
    }

    const elapsed = timestamp - this.lastTimestamp
    if (resume || elapsed > POINT_LOST_GRACE_MS) {
      this.rebase(raw, timestamp)
      // Preserve the visible position on the first recovered sample. Never treat
      // displacement while unseen (or between hands) as measured finger velocity.
      this.recovery = distance(mapped, this.position) > CURSOR_DEADZONE * 2
        ? { origin: { ...this.position }, startedAt: timestamp }
        : null
      return this.result(0)
    }
    if (elapsed <= 0) return this.result(0)

    const dt = elapsed / 1000
    const instantVelocity = { x: (raw.x - this.lastRaw.x) / dt, y: (raw.y - this.lastRaw.y) / dt }
    const rawSpeed = Math.hypot(instantVelocity.x, instantVelocity.y)
    const intentionalSpeed = Math.max(0, rawSpeed - CURSOR_DEADZONE / dt)
    const velocityAlpha = 1 - Math.exp(-elapsed / CURSOR_VELOCITY_TAU_MS)
    this.velocity.x += (instantVelocity.x - this.velocity.x) * velocityAlpha
    this.velocity.y += (instantVelocity.y - this.velocity.y) * velocityAlpha
    this.speed = Math.hypot(this.velocity.x, this.velocity.y)
    // The noise-gated instantaneous speed also opens the filter immediately on
    // fast starts/reversals; the short vector average rejects stationary jitter.
    const adaptiveSpeed = Math.max(this.speed, intentionalSpeed)
    const motion = clamp((adaptiveSpeed - CURSOR_SLOW_SPEED) / (CURSOR_FAST_SPEED - CURSOR_SLOW_SPEED), 0, 1)
    const gain = CURSOR_ALPHA_MIN + (CURSOR_ALPHA_MAX - CURSOR_ALPHA_MIN) * motion
    this.alpha = 1 - Math.pow(1 - gain, elapsed / (1000 / 60))

    // A continuous radial deadband: tiny motion holds the target; slow intentional
    // motion accumulates and moves it by only the amount outside the deadzone.
    const delta = distance(mapped, this.target)
    const deadzone = CURSOR_DEADZONE * (1 - motion * 0.75)
    if (delta > deadzone) this.target = mix(this.target, mapped, 1 - deadzone / delta)
    // The deadband must not leave an unreachable strip at the four screen edges.
    if (mapped.x === 0 || mapped.x === bounds.width) this.target.x = mapped.x
    if (mapped.y === 0 || mapped.y === bounds.height) this.target.y = mapped.y

    const previous = this.position
    if (this.recovery) {
      const progress = clamp((timestamp - this.recovery.startedAt) / CURSOR_RECOVERY_MS, 0, 1)
      const eased = progress * progress * (3 - 2 * progress)
      this.position = mix(this.recovery.origin, this.target, eased)
      if (progress === 1) this.recovery = null
    } else {
      this.position = mix(previous, this.target, this.alpha)
    }
    // Finish subpixel settling instead of leaving an endless exponential tail.
    if (!this.recovery && distance(this.position, this.target) < 0.1) this.position = { ...this.target }
    this.lastRaw = raw
    this.lastTimestamp = timestamp
    const renderedSpeed = distance(this.position, previous) / dt
    // Unsmooth velocity cancels a sweep on its very first frame. Discard motion
    // within the noise floor, but never divide by a capped/fictitious interval.
    return this.result(Math.max(intentionalSpeed, this.speed, renderedSpeed))
  }

  rebase(raw, timestamp) {
    this.lastRaw = raw
    this.lastTimestamp = timestamp
    this.velocity = { x: 0, y: 0 }
    this.speed = 0
  }

  result(movementSpeed) {
    return { position: this.position, speed: movementSpeed, recovering: Boolean(this.recovery) }
  }
}

function mix(from, to, amount) {
  return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
