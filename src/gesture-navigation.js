import { GESTURES } from './gesture-engine.js'

const DEFAULT_DWELL_DURATION = 800
// MediaPipe coordinates are unmirrored; the camera preview is flipped once in CSS.
const CAMERA_X_MIN = 0.10
const CAMERA_X_MAX = 0.90
const CAMERA_Y_MIN = 0.10
const CAMERA_Y_MAX = 0.90
const CURSOR_ALPHA_MIN = 0.20
const CURSOR_ALPHA_MAX = 0.62
const CURSOR_FAST_DISTANCE = 90
const CURSOR_DEADZONE_PX = 3
const CURSOR_REACQUIRE_STEP_PX = 90
const POINT_LOSS_GRACE_MS = 180
const DWELL_MOVE_SPEED_PX_PER_SECOND = 650
const HIT_TOLERANCE_PX = 8
const HIT_EXIT_TOLERANCE_PX = 12
export const NAVIGATION_MIN_QUALITY = 65

export function createGestureButton({ label, value }) {
  const button = document.createElement('button')
  button.className = 'gesture-button'
  button.type = 'button'
  button.dataset.navigationValue = value
  button.innerHTML = `<span>${label}</span><span class="gesture-button-progress" aria-hidden="true"></span>`
  return button
}

export class GestureNavigation {
  constructor({ container, menu, onSelect, dwellDuration = DEFAULT_DWELL_DURATION }) {
    this.container = container
    this.menu = menu
    this.onSelect = onSelect
    this.dwellDuration = dwellDuration
    this.cursor = document.createElement('div')
    this.cursor.className = 'virtual-cursor'
    this.cursor.setAttribute('aria-hidden', 'true')
    this.cursor.innerHTML = '<span class="virtual-cursor-dot"></span>'
    this.container.append(this.cursor)

    this.activeButton = null
    this.dwellElapsed = 0
    this.lastDwellTimestamp = null
    this.selectionLocked = false
    this.lockedUntilPointRelease = false
    this.smoothedPosition = null
    this.acceptedTarget = null
    this.lastTimestamp = 0
    this.pointLostAt = null
    this.reacquiring = false
    this.hoveredHeroCard = null

    this.menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-navigation-value]')
      if (button && !button.disabled) this.activate(button)
    })
  }

  update({ gesture, rawGesture = gesture, quality = 100, indexTip, timestamp }) {
    const pointActive = gesture === GESTURES.POINT && rawGesture === GESTURES.POINT &&
      quality >= NAVIGATION_MIN_QUALITY && Number.isFinite(indexTip?.x) && Number.isFinite(indexTip?.y)
    if (!pointActive) {
      if (this.lockedUntilPointRelease && gesture !== GESTURES.POINT && rawGesture !== GESTURES.POINT) {
        this.lockedUntilPointRelease = false
        this.resetDwell()
      }
      if (this.pointLostAt === null) this.pointLostAt = timestamp
      this.lastDwellTimestamp = null
      if (timestamp - this.pointLostAt >= POINT_LOSS_GRACE_MS) {
        this.hideCursor()
        this.updateHeroHover(null)
        this.resetDwell()
        this.acceptedTarget = null
      }
      return
    }

    const reacquired = this.pointLostAt !== null
    if (reacquired && timestamp - this.pointLostAt >= POINT_LOSS_GRACE_MS) this.resetDwell()
    this.pointLostAt = null
    if (reacquired) this.reacquiring = true
    const target = mapMirroredPoint(indexTip, this.container)
    const { position, speed } = this.smoothPosition(target, timestamp)
    this.showCursor(position)

    if (this.lockedUntilPointRelease) {
      this.updateHeroHover(null)
      return
    }

    const hoveredButton = this.getHoveredButton(position)
    this.updateHeroHover(position, hoveredButton)
    this.cursor.classList.toggle('is-hovering', Boolean(hoveredButton))
    if (!hoveredButton || this.selectionLocked) {
      if (!hoveredButton) this.resetDwell()
      return
    }

    if (speed > DWELL_MOVE_SPEED_PX_PER_SECOND) {
      this.resetDwell()
      return
    }

    if (hoveredButton !== this.activeButton) {
      this.resetDwell()
      this.activeButton = hoveredButton
      hoveredButton.classList.add('is-dwelling')
    }

    if (this.lastDwellTimestamp !== null) this.dwellElapsed += Math.max(0, timestamp - this.lastDwellTimestamp)
    this.lastDwellTimestamp = timestamp
    const progress = Math.min(this.dwellElapsed / this.dwellDuration, 1)
    this.setProgress(hoveredButton, progress)
    if (progress === 1) {
      this.activate(hoveredButton)
      this.selectionLocked = true
    }
  }

  smoothPosition(target, timestamp) {
    if (!this.smoothedPosition) {
      this.smoothedPosition = target
      this.acceptedTarget = target
      this.lastTimestamp = timestamp
      this.reacquiring = false
      return { position: target, speed: 0 }
    }

    const elapsed = Math.max(timestamp - this.lastTimestamp, 1)
    if (!this.acceptedTarget) this.acceptedTarget = target
    const rawMovement = Math.hypot(target.x - this.acceptedTarget.x, target.y - this.acceptedTarget.y)
    if (rawMovement >= CURSOR_DEADZONE_PX) this.acceptedTarget = target
    const distance = Math.hypot(
      this.acceptedTarget.x - this.smoothedPosition.x,
      this.acceptedTarget.y - this.smoothedPosition.y,
    )
    const frameAlpha = CURSOR_ALPHA_MIN + (CURSOR_ALPHA_MAX - CURSOR_ALPHA_MIN) *
      Math.min(distance / CURSOR_FAST_DISTANCE, 1)
    const alpha = 1 - Math.pow(1 - frameAlpha, Math.min(elapsed, 50) / (1000 / 60))
    const oldPosition = this.smoothedPosition
    const step = this.reacquiring ? Math.min(alpha, CURSOR_REACQUIRE_STEP_PX / Math.max(distance, 1)) : alpha
    this.smoothedPosition = {
      x: oldPosition.x + (this.acceptedTarget.x - oldPosition.x) * step,
      y: oldPosition.y + (this.acceptedTarget.y - oldPosition.y) * step,
    }
    if (this.reacquiring && distance * (1 - step) <= CURSOR_REACQUIRE_STEP_PX) this.reacquiring = false
    this.lastTimestamp = timestamp
    return {
      position: this.smoothedPosition,
      speed: Math.max(rawMovement, Math.hypot(
        this.smoothedPosition.x - oldPosition.x,
        this.smoothedPosition.y - oldPosition.y,
      )) * 1000 / Math.min(elapsed, 50),
    }
  }

  showCursor(position) {
    this.cursor.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
    this.cursor.classList.add('is-visible')
  }

  hideCursor() {
    this.cursor.classList.remove('is-visible')
    this.cursor.classList.remove('is-hovering')
  }

  updateHeroHover(position, hoveredButton = null) {
    let card = null
    if (position && this.menu.querySelector?.('.hero-screen') && document.elementFromPoint) {
      const bounds = this.container.getBoundingClientRect()
      card = hoveredButton?.closest?.('.hero-card') ??
        document.elementFromPoint(bounds.left + position.x, bounds.top + position.y)?.closest('.hero-card')
    }
    if (card === this.hoveredHeroCard) return
    this.hoveredHeroCard?.classList.remove('is-point-hovered')
    card?.classList.add('is-point-hovered')
    this.hoveredHeroCard = card
  }

  getHoveredButton(position) {
    const containerRect = this.container.getBoundingClientRect()
    const clientX = containerRect.left + position.x
    const clientY = containerRect.top + position.y
    const buttons = [...this.menu.querySelectorAll('[data-navigation-value]')].filter((button) => !button.disabled)
    const hitAreas = buttons.map((button) => ({ button, rect: button.getBoundingClientRect() }))
    const inside = hitAreas.find(({ rect }) => distanceToRect(clientX, clientY, rect) === 0)
    if (inside) return inside.button
    const current = hitAreas.find(({ button, rect }) => button === this.activeButton &&
      distanceToRect(clientX, clientY, rect) <= HIT_EXIT_TOLERANCE_PX)
    if (current) return current.button
    const nearby = hitAreas.map(({ button, rect }) => ({ button, distance: distanceToRect(clientX, clientY, rect) }))
      .filter(({ distance }) => distance <= HIT_TOLERANCE_PX)
      .sort((a, b) => a.distance - b.distance)
    return nearby[0]?.button ?? null
  }

  setProgress(button, progress) {
    button.style.setProperty('--dwell-progress', progress)
    button.closest?.('.hero-card')?.style.setProperty('--card-dwell-progress', progress)
    this.cursor.style.setProperty('--cursor-dwell', progress)
  }

  resetDwell() {
    if (this.activeButton) {
      this.activeButton.classList.remove('is-dwelling')
      this.setProgress(this.activeButton, 0)
    }
    this.cursor.style.setProperty('--cursor-dwell', 0)
    this.activeButton = null
    this.dwellElapsed = 0
    this.lastDwellTimestamp = null
    this.selectionLocked = false
  }

  lockUntilPointRelease() {
    this.resetDwell()
    this.selectionLocked = true
    this.lockedUntilPointRelease = true
    this.cursor.classList.remove('is-hovering')
    this.updateHeroHover(null)
  }

  activate(button) {
    this.resetDwell()
    this.cursor.classList.remove('is-activated')
    void this.cursor.offsetWidth
    this.cursor.classList.add('is-activated')
    setTimeout(() => this.cursor.classList.remove('is-activated'), 350)
    this.menu.querySelectorAll('.is-selected').forEach((selectedButton) => {
      selectedButton.classList.remove('is-selected')
    })
    button.classList.add('is-selected')
    this.lockUntilPointRelease()
    this.onSelect?.(button.dataset.navigationValue)
  }
}

function mapMirroredPoint(point, container) {
  const bounds = container.getBoundingClientRect()
  return {
    x: clamp((1 - point.x - CAMERA_X_MIN) / (CAMERA_X_MAX - CAMERA_X_MIN), 0, 1) * bounds.width,
    y: clamp((point.y - CAMERA_Y_MIN) / (CAMERA_Y_MAX - CAMERA_Y_MIN), 0, 1) * bounds.height,
  }
}

function distanceToRect(x, y, rect) {
  return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom))
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
