import './styles.css'
import { startCamera, stopCamera } from './camera.js'
import { GestureEngine } from './gesture-engine.js'
import { GestureQualityEvaluator } from './gesture-quality.js'
import { startHandTracking } from './hand-tracker.js'
import { createGestureButton, GestureNavigation } from './gesture-navigation.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="app-shell" aria-labelledby="app-title">
    <h1 id="app-title">ARCANE PROTOCOL</h1>
    <div class="camera-frame">
      <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
      <canvas class="hand-overlay" aria-hidden="true"></canvas>
      <p class="gesture-display" aria-live="polite">GESTURE: NONE</p>
      <p class="gesture-debug">HAND: NO · LANDMARKS: 0 · RAW: NONE</p>
      <section class="gesture-quality is-neutral" aria-live="polite" aria-label="Gesture quality feedback">
        <p class="gesture-quality-title">AWAITING HAND</p>
        <div class="gesture-quality-meter" aria-hidden="true"><span></span></div>
        <p class="gesture-quality-message">Show a gesture to receive guidance</p>
        <p class="gesture-quality-debug" aria-hidden="true"></p>
      </section>
      <section class="navigation-menu" aria-label="Temporary game menu">
        <p class="navigation-label">POINT TO SELECT</p>
        <div class="navigation-buttons"></div>
        <p class="navigation-feedback" aria-live="polite">AWAITING PROTOCOL</p>
      </section>
      <p class="camera-status" role="status">Starting camera…</p>
    </div>
  </section>
`

const videoElement = document.querySelector('.camera-feed')
const overlayElement = document.querySelector('.hand-overlay')
const statusElement = document.querySelector('.camera-status')
const gestureDisplayElement = document.querySelector('.gesture-display')
const gestureDebugElement = document.querySelector('.gesture-debug')
const gestureEngine = new GestureEngine()
const gestureQualityEvaluator = new GestureQualityEvaluator()
const gestureQualityElement = document.querySelector('.gesture-quality')
const gestureQualityTitleElement = document.querySelector('.gesture-quality-title')
const gestureQualityMeterElement = document.querySelector('.gesture-quality-meter > span')
const gestureQualityMessageElement = document.querySelector('.gesture-quality-message')
const gestureQualityDebugElement = document.querySelector('.gesture-quality-debug')
const SHOW_GESTURE_DEBUG = true // Set false after tuning; no other UI changes needed.
gestureQualityDebugElement.hidden = !SHOW_GESTURE_DEBUG
const navigationMenuElement = document.querySelector('.navigation-menu')
const navigationButtonsElement = document.querySelector('.navigation-buttons')
const navigationFeedbackElement = document.querySelector('.navigation-feedback')
const navigationOptions = [
  { label: 'STORY', value: 'STORY' },
  { label: 'BOSS RUSH', value: 'BOSS RUSH' },
  { label: 'TRAINING', value: 'TRAINING' },
]

navigationOptions.forEach((option) => navigationButtonsElement.append(createGestureButton(option)))

const gestureNavigation = new GestureNavigation({
  container: document.querySelector('.camera-frame'),
  menu: navigationMenuElement,
  onSelect: (selection) => {
    navigationFeedbackElement.textContent = `SELECTED: ${selection}`
  },
})

let cameraStream
let stopHandTracking

initializeCamera()

async function initializeCamera() {
  try {
    cameraStream = await startCamera(videoElement)
    statusElement.textContent = 'Camera ready'
    statusElement.classList.add('is-ready')
    stopHandTracking = await startHandTracking(videoElement, overlayElement, updateGestureDisplay)
  } catch (error) {
    if (!cameraStream) {
      statusElement.textContent = error.message
      statusElement.classList.add('is-error')
      return
    }

    console.error('Hand tracking could not be started.', error)
    statusElement.textContent = 'Camera ready. Hand tracking could not be started.'
  }
}

function updateGestureDisplay(landmarks, timestamp) {
  const gesture = gestureEngine.update(landmarks, timestamp)
  const debugInfo = gestureEngine.getDebugInfo()
  gestureDisplayElement.textContent = `GESTURE: ${gesture}`
  gestureDebugElement.textContent = [
    `HAND: ${debugInfo.handDetected ? 'YES' : 'NO'}`,
    `LANDMARKS: ${debugInfo.landmarkCount}`,
    `RAW: ${debugInfo.rawGesture}`,
  ].join(' · ')
  updateGestureQuality(landmarks, timestamp, debugInfo.rawGesture, gesture)
  gestureNavigation.update({
    gesture,
    indexTip: landmarks?.[0]?.[8],
    timestamp,
    videoElement,
  })
}

function updateGestureQuality(landmarks, timestamp, rawGesture, stableGesture) {
  const feedback = gestureQualityEvaluator.update(landmarks, timestamp, rawGesture, stableGesture)
  if (SHOW_GESTURE_DEBUG) {
    const fingerDebug = feedback.fingerStates
      ? Object.entries(feedback.fingerStates).map(([name, state]) => `${name}: ${state}`).join(' · ')
      : ''
    const componentDebug = feedback.components
      .map(({ name, score }) => `${name}: ${Math.round(score * 100)}%`).join(' · ')
    const classificationDebug = [
      `ATTEMPT: ${feedback.attemptedGesture ?? 'NONE'}`,
      `BASE: ${rawGesture}`,
      `QUALITY: ${feedback.quality ?? 0}%`,
    ].join(' · ')
    gestureQualityDebugElement.textContent = [fingerDebug, classificationDebug, componentDebug]
      .filter(Boolean).join(' | ')
  }
  if (feedback.state === 'neutral') {
    gestureQualityElement.className = 'gesture-quality is-neutral'
    gestureQualityTitleElement.textContent = feedback.fingerStates ? 'NO STATIC GESTURE' : 'AWAITING HAND'
    gestureQualityMeterElement.style.width = '0%'
    gestureQualityMessageElement.textContent = feedback.fingerStates
      ? 'Show a static gesture to receive guidance'
      : 'Show a hand to receive guidance'
    return
  }

  gestureQualityElement.className = `gesture-quality is-${feedback.state}`
  const label = feedback.state === 'success' ? formatGesture(feedback.gesture) : `ATTEMPTING ${formatGesture(feedback.gesture)}`
  gestureQualityTitleElement.textContent = `${label} · QUALITY: ${feedback.quality}%`
  gestureQualityMeterElement.style.width = `${feedback.quality}%`
  gestureQualityMessageElement.textContent = feedback.state === 'success'
    ? 'Gesture recognized'
    : feedback.state === 'pending' ? 'Confirming gesture…' : feedback.correction
}

function formatGesture(gesture) {
  return gesture.replace('_', ' ')
}

window.addEventListener('beforeunload', () => {
  stopHandTracking?.()
  stopCamera(cameraStream)
})
