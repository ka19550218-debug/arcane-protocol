import { GESTURES } from './gesture-engine.js'

const DEFAULT_DWELL_DURATION = 800
const SMOOTHING_PER_FRAME = 0.28

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
    this.dwellStartedAt = 0
    this.selectionLocked = false
    this.lockedUntilPointRelease = false
    this.smoothedPosition = null
    this.lastTimestamp = 0

    this.menu.addEventListener('click', (event) => {
      const button = event.target.closest('[data-navigation-value]')
      if (button && !button.disabled) this.activate(button)
    })
  }

  update({ gesture, indexTip, timestamp, videoElement }) {
    if (gesture !== GESTURES.POINT || !indexTip) {
      this.lockedUntilPointRelease = false
      this.hideCursor()
      this.resetDwell()
      this.smoothedPosition = null
      return
    }

    const target = mapMirroredPoint(indexTip, videoElement, this.container)
    const position = this.smoothPosition(target, timestamp)
    this.showCursor(position)

    if (this.lockedUntilPointRelease) return

    const hoveredButton = this.getHoveredButton(position)
    this.cursor.classList.toggle('is-hovering', Boolean(hoveredButton))
    if (!hoveredButton || this.selectionLocked) {
      if (!hoveredButton) this.resetDwell()
      return
    }

    if (hoveredButton !== this.activeButton) {
      this.resetDwell()
      this.activeButton = hoveredButton
      this.dwellStartedAt = timestamp
      hoveredButton.classList.add('is-dwelling')
    }

    const progress = Math.min((timestamp - this.dwellStartedAt) / this.dwellDuration, 1)
    this.setProgress(hoveredButton, progress)
    if (progress === 1) {
      this.activate(hoveredButton)
      this.selectionLocked = true
    }
  }

  smoothPosition(target, timestamp) {
    if (!this.smoothedPosition) {
      this.smoothedPosition = target
      this.lastTimestamp = timestamp
      return target
    }

    const elapsed = Math.max(timestamp - this.lastTimestamp, 0)
    const alpha = 1 - Math.pow(1 - SMOOTHING_PER_FRAME, elapsed / (1000 / 60))
    this.smoothedPosition = {
      x: this.smoothedPosition.x + (target.x - this.smoothedPosition.x) * alpha,
      y: this.smoothedPosition.y + (target.y - this.smoothedPosition.y) * alpha,
    }
    this.lastTimestamp = timestamp
    return this.smoothedPosition
  }

  showCursor(position) {
    this.cursor.style.transform = `translate(${position.x}px, ${position.y}px)`
    this.cursor.classList.add('is-visible')
  }

  hideCursor() {
    this.cursor.classList.remove('is-visible')
    this.cursor.classList.remove('is-hovering')
  }

  getHoveredButton(position) {
    const containerRect = this.container.getBoundingClientRect()
    const clientX = containerRect.left + position.x
    const clientY = containerRect.top + position.y
    return [...this.menu.querySelectorAll('[data-navigation-value]')].find((button) => {
      if (button.disabled) return false
      const rect = button.getBoundingClientRect()
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
    })
  }

  setProgress(button, progress) {
    button.style.setProperty('--dwell-progress', progress)
    this.cursor.style.setProperty('--cursor-dwell', progress)
  }

  resetDwell() {
    if (this.activeButton) {
      this.activeButton.classList.remove('is-dwelling')
      this.setProgress(this.activeButton, 0)
    }
    this.cursor.style.setProperty('--cursor-dwell', 0)
    this.activeButton = null
    this.dwellStartedAt = 0
    this.selectionLocked = false
  }

  lockUntilPointRelease() {
    this.resetDwell()
    this.selectionLocked = true
    this.lockedUntilPointRelease = true
    this.cursor.classList.remove('is-hovering')
  }

  activate(button) {
    this.resetDwell()
    this.menu.querySelectorAll('.is-selected').forEach((selectedButton) => {
      selectedButton.classList.remove('is-selected')
    })
    button.classList.add('is-selected')
    this.lockUntilPointRelease()
    this.onSelect?.(button.dataset.navigationValue)
  }
}

function mapMirroredPoint(point, videoElement, container) {
  const bounds = container.getBoundingClientRect()
  const videoWidth = videoElement.videoWidth || bounds.width
  const videoHeight = videoElement.videoHeight || bounds.height
  const scale = Math.max(bounds.width / videoWidth, bounds.height / videoHeight)
  const displayWidth = videoWidth * scale
  const displayHeight = videoHeight * scale
  const offsetX = (bounds.width - displayWidth) / 2
  const offsetY = (bounds.height - displayHeight) / 2
  const unmirroredX = offsetX + point.x * displayWidth
  const y = offsetY + point.y * displayHeight

  return {
    x: clamp(bounds.width - unmirroredX, 0, bounds.width),
    y: clamp(y, 0, bounds.height),
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}
