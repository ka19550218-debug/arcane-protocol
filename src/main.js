import './styles.css'
import { startCamera, stopCamera } from './camera.js'
import { GestureEngine } from './gesture-engine.js'
import { startHandTracking } from './hand-tracker.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="app-shell" aria-labelledby="app-title">
    <h1 id="app-title">ARCANE PROTOCOL</h1>
    <div class="camera-frame">
      <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
      <canvas class="hand-overlay" aria-hidden="true"></canvas>
      <p class="gesture-display" aria-live="polite">GESTURE: NONE</p>
      <p class="gesture-debug">HAND: NO · LANDMARKS: 0 · RAW: NONE</p>
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
}

window.addEventListener('beforeunload', () => {
  stopHandTracking?.()
  stopCamera(cameraStream)
})
