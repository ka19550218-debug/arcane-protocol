import { GESTURES } from './gesture-engine.js'
import {
  CursorFilter, CURSOR_DEBUG, CURSOR_DEBUG_INTERVAL_MS,
  POINT_LOST_GRACE_MS, DWELL_MAX_MOVEMENT_SPEED,
} from './cursor-filter.js'

const DEFAULT_DWELL_DURATION = 800
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
  constructor({ container, menu, onSelect, debugElement, dwellDuration = DEFAULT_DWELL_DURATION }) {
    this.container = container
    this.menu = menu
    this.onSelect = onSelect
    this.dwellDuration = dwellDuration
    this.debugElement = debugElement
    if (debugElement) debugElement.hidden = !CURSOR_DEBUG
    this.lastDebugTimestamp = -Infinity
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
    this.filter = new CursorFilter()
    this.cursorHandSide = null
    this.lastPointTimestamp = null
    this.pointLostAt = null
    this.pointActive = false
    this.hoveredHeroCard = null

    this.menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-navigation-value]')
      if (button && !button.disabled) this.activate(button, 'click')
    })
  }

  updateHands(hands, timestamp) {
    const inputFor = (side) => ({
      gesture: hands[side].gesture,
      rawGesture: hands[side].debug.rawGesture,
      quality: hands[side].feedback.quality,
      indexTip: hands[side].landmarks?.[8],
      handSide: side,
      timestamp,
    })
    let side = this.cursorHandSide ?? 'LEFT'
    if (!isNavigationPoint(inputFor(side))) {
      const other = side === 'LEFT' ? 'RIGHT' : 'LEFT'
      // A single missing/low-quality frame must not transfer cursor ownership.
      const canSwitch = this.cursorHandSide === null ||
        (this.pointLostAt !== null && timestamp - this.pointLostAt >= POINT_LOST_GRACE_MS)
      if (canSwitch && isNavigationPoint(inputFor(other))) side = other
    }
    this.update(inputFor(side))
  }

  update(input) {
    this.updatePoint(input)
    this.renderDebug(input.timestamp)
  }

  updatePoint({ gesture, rawGesture = gesture, quality = 100, indexTip, timestamp, handSide = 'LEFT' }) {
    this.pointActive = isNavigationPoint({ gesture, rawGesture, quality, indexTip })
    if (!this.pointActive) {
      if (this.pointLostAt === null) this.pointLostAt = timestamp
      const handVisible = Number.isFinite(indexTip?.x) && Number.isFinite(indexTip?.y)
      const lossExpired = timestamp - this.pointLostAt >= POINT_LOST_GRACE_MS
      // A missing camera sample is not a deliberate POINT release. Keep the
      // selection lock through brief dropouts just like the visible cursor.
      if (this.lockedUntilPointRelease && gesture !== GESTURES.POINT && rawGesture !== GESTURES.POINT &&
        (handVisible || lossExpired)) {
        this.lockedUntilPointRelease = false
        this.resetDwell()
      }
      this.lastDwellTimestamp = null
      this.cursor.classList.add('is-recovering')
      if (lossExpired) {
        this.hideCursor()
        this.updateHeroHover(null)
        this.resetDwell()
      }
      return
    }

    const handChanged = this.cursorHandSide !== null && handSide !== this.cursorHandSide
    const stale = this.lastPointTimestamp !== null && timestamp - this.lastPointTimestamp > POINT_LOST_GRACE_MS
    const reacquired = this.pointLostAt !== null || handChanged || stale
    if (handChanged || stale || (this.pointLostAt !== null && timestamp - this.pointLostAt >= POINT_LOST_GRACE_MS)) {
      this.resetDwell()
    }
    if (reacquired) this.lastDwellTimestamp = null
    this.pointLostAt = null
    this.lastPointTimestamp = timestamp
    this.cursorHandSide = handSide
    const bounds = this.getBounds()
    const { position, speed, recovering } = this.filter.update(indexTip, bounds, timestamp, reacquired)
    // Read hit geometry before cursor/progress writes, using this exact position.
    const hoveredButton = this.lockedUntilPointRelease ? null : this.getHoveredButton(position, bounds)
    this.updateHeroHover(this.lockedUntilPointRelease ? null : position, hoveredButton, bounds)
    this.showCursor(position)
    this.cursor.classList.toggle('is-recovering', recovering)
    this.cursor.classList.toggle('is-locked', this.lockedUntilPointRelease)

    if (this.lockedUntilPointRelease) {
      this.updateHeroHover(null)
      return
    }

    this.cursor.classList.toggle('is-hovering', Boolean(hoveredButton))
    if (!hoveredButton || this.selectionLocked) {
      if (!hoveredButton) this.resetDwell()
      return
    }

    if (speed > DWELL_MAX_MOVEMENT_SPEED) {
      this.resetDwell()
      return
    }
    if (recovering) {
      // Pause a same-target dwell through recovery; never count bridge motion as
      // an intentional hold or carry progress onto a different target.
      this.lastDwellTimestamp = null
      if (hoveredButton !== this.activeButton) this.resetDwell()
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
      this.activate(hoveredButton, 'dwell')
    }
  }

  tick(timestamp) {
    // A stalled video produces no missing-hand callback. Expire that stale UI
    // from the existing render loop, without extrapolating or moving the cursor.
    if (this.lastPointTimestamp === null || !this.cursor.classList.contains('is-visible') ||
      timestamp - (this.pointLostAt ?? this.lastPointTimestamp) < POINT_LOST_GRACE_MS) return
    this.pointLostAt ??= this.lastPointTimestamp
    this.pointActive = false
    this.hideCursor()
    this.updateHeroHover(null)
    this.resetDwell()
  }

  getBounds() {
    const rect = this.container.getBoundingClientRect()
    // Absolute cursor transforms originate inside the stage's border.
    return {
      left: rect.left + (this.container.clientLeft ?? 0),
      top: rect.top + (this.container.clientTop ?? 0),
      width: this.container.clientWidth ?? rect.width,
      height: this.container.clientHeight ?? rect.height,
    }
  }

  renderDebug(timestamp) {
    if (!CURSOR_DEBUG || !this.debugElement || timestamp - this.lastDebugTimestamp < CURSOR_DEBUG_INTERVAL_MS) return
    this.lastDebugTimestamp = timestamp
    const pair = (position, digits) => position ? `${position.x.toFixed(digits)}, ${position.y.toFixed(digits)}` : '—'
    const tracking = this.pointActive ? this.cursorHandSide
      : this.pointLostAt !== null && timestamp - this.pointLostAt < POINT_LOST_GRACE_MS
        ? `NONE (HOLD ${this.cursorHandSide ?? '—'})` : 'NONE (LOST)'
    this.debugElement.textContent = [
      `POINT HAND: ${tracking}`,
      `RAW CAMERA: ${pair(this.filter.raw, 3)}`,
      `MAPPED px: ${pair(this.filter.mapped, 1)}`,
      `SMOOTHED px: ${pair(this.filter.position, 1)}`,
      `VELOCITY: ${this.filter.speed.toFixed(0)} px/s · α ${this.filter.alpha.toFixed(2)}`,
      `DWELL TARGET: ${this.activeButton?.dataset.navigationValue ?? 'NONE'}`,
      `DWELL: ${Math.round(Math.min(this.dwellElapsed / this.dwellDuration, 1) * 100)}%`,
    ].join('\n')
  }

  showCursor(position) {
    this.cursor.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
    this.cursor.classList.add('is-visible')
  }

  hideCursor() {
    this.cursor.classList.remove('is-visible')
    this.cursor.classList.remove('is-hovering')
  }

  updateHeroHover(position, hoveredButton = null, bounds) {
    let card = null
    if (position && this.menu.querySelector?.('.hero-screen') && document.elementFromPoint) {
      bounds ??= this.getBounds()
      card = hoveredButton?.closest?.('.hero-card') ??
        document.elementFromPoint(bounds.left + position.x, bounds.top + position.y)?.closest('.hero-card')
    }
    if (card === this.hoveredHeroCard) return
    this.hoveredHeroCard?.classList.remove('is-point-hovered')
    card?.classList.add('is-point-hovered')
    this.hoveredHeroCard = card
  }

  getHoveredButton(position, containerRect = this.getBounds()) {
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

  activate(button, source = 'dwell') {
    this.resetDwell()
    this.cursor.classList.remove('is-activated')
    void this.cursor.offsetWidth
    this.cursor.classList.add('is-activated')
    setTimeout(() => this.cursor.classList.remove('is-activated'), 350)
    this.menu.querySelectorAll('.is-selected').forEach((selectedButton) => {
      selectedButton.classList.remove('is-selected')
    })
    button.classList.add('is-selected')
    // Sequential training targets are distinct, disabled after acquisition, and
    // intentionally allow continuous POINT. All screen choices require release.
    if (button.dataset.continuousDwell !== 'true' || source !== 'dwell') this.lockUntilPointRelease()
    this.onSelect?.(button.dataset.navigationValue, source)
  }
}

function isNavigationPoint({ gesture, rawGesture = gesture, quality = 100, indexTip }) {
  return gesture === GESTURES.POINT && rawGesture === GESTURES.POINT &&
    quality >= NAVIGATION_MIN_QUALITY && Number.isFinite(indexTip?.x) && Number.isFinite(indexTip?.y)
}

function distanceToRect(x, y, rect) {
  return Math.hypot(Math.max(rect.left - x, 0, x - rect.right), Math.max(rect.top - y, 0, y - rect.bottom))
}
