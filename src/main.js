import './styles.css'
import { startCamera, stopCamera } from './camera.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="app-shell" aria-labelledby="app-title">
    <h1 id="app-title">ARCANE PROTOCOL</h1>
    <div class="camera-frame">
      <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
      <p class="camera-status" role="status">Starting camera…</p>
    </div>
  </section>
`

const videoElement = document.querySelector('.camera-feed')
const statusElement = document.querySelector('.camera-status')
let cameraStream

initializeCamera()

async function initializeCamera() {
  try {
    cameraStream = await startCamera(videoElement)
    statusElement.textContent = 'Camera ready'
    statusElement.classList.add('is-ready')
  } catch (error) {
    statusElement.textContent = error.message
    statusElement.classList.add('is-error')
  }
}

window.addEventListener('beforeunload', () => stopCamera(cameraStream))
