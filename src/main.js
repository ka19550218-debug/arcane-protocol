import './styles.css'
import { startCamera, stopCamera } from './camera.js'
import { GESTURES } from './gesture-engine.js'
import { TwoHandInput } from './two-hand-input.js'
import { startHandTracking } from './hand-tracker.js'
import { GestureNavigation } from './gesture-navigation.js'
import { CombatGame, GAME_STATES } from './game/combat.js'
import { CombatView } from './game/combat-view.js'
import { APP_STATES, GameFlow } from './game-flow.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="app-shell" aria-labelledby="app-title">
    <header class="game-header">
      <div><p class="eyebrow">ADMIT HACKATHON · MOTION 2026</p><h1 id="app-title">ARCANE <span>PROTOCOL</span></h1></div>
      <p class="state-badge" data-game-state>SYSTEM BOOT</p>
    </header>
    <div class="game-layout">
      <section class="stage-frame" aria-label="ARCANE PROTOCOL experience">
        <div class="main-stage" data-stage></div>
      </section>
      <aside class="tracking-panel" aria-label="Gesture controls and camera">
        <div class="tracking-heading"><span>HAND TRACKING</span><span class="tracking-live">INITIALIZING</span></div>
        <div class="camera-frame">
          <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
          <canvas class="hand-overlay" aria-hidden="true"></canvas>
          <p class="camera-status" role="status">CONNECTING CAMERA</p>
        </div>
        <p class="gesture-display" aria-live="polite">LEFT: NONE · RIGHT: NONE</p>
        <p class="gesture-debug">LEFT RAW: NONE · RIGHT: NONE</p>
        <p class="shield-status" data-shield>SHIELD OFFLINE</p>
        <section class="gesture-quality is-neutral" aria-live="polite" aria-label="Gesture quality feedback">
          <p class="gesture-quality-title">AWAITING HAND</p>
          <div class="gesture-quality-meter" aria-hidden="true"><span></span></div>
          <p class="gesture-quality-message">Show a gesture to receive guidance</p>
          <p class="gesture-quality-debug" aria-hidden="true"></p>
        </section>
        <div class="controls-guide"><p><strong>FIST</strong><span>PULSE SHOT</span></p><p><strong>OPEN PALM</strong><span>ENERGY SHIELD</span></p><p><strong>SWIPE ← →</strong><span>DODGE</span></p><p><strong>2 FISTS</strong><span>DUAL PULSE</span></p><p><strong>2 PALMS</strong><span>FULL BARRIER</span></p><p><strong>FIST + PALM</strong><span>OVERDRIVE</span></p></div>
      </aside>
    </div>
  </section>
`

const stageFrameElement = document.querySelector('.stage-frame')
const stageElement = document.querySelector('[data-stage]')
const videoElement = document.querySelector('.camera-feed')
const overlayElement = document.querySelector('.hand-overlay')
const statusElement = document.querySelector('.camera-status')
const gestureDisplayElement = document.querySelector('.gesture-display')
const gestureDebugElement = document.querySelector('.gesture-debug')
const gestureQualityElement = document.querySelector('.gesture-quality')
const gestureQualityTitleElement = document.querySelector('.gesture-quality-title')
const gestureQualityMeterElement = document.querySelector('.gesture-quality-meter > span')
const gestureQualityMessageElement = document.querySelector('.gesture-quality-message')
const gestureQualityDebugElement = document.querySelector('.gesture-quality-debug')
const shieldElement = document.querySelector('[data-shield]')
const twoHandInput = new TwoHandInput()
const combatGame = new CombatGame()
const SHOW_GESTURE_DEBUG = true // Set false after tuning; no other UI changes needed.

gestureQualityDebugElement.hidden = !SHOW_GESTURE_DEBUG

let cameraStream
let stopHandTracking
let combatView = null
let cursorHandSide = 'LEFT'

const gestureNavigation = new GestureNavigation({
  container: stageFrameElement,
  menu: stageElement,
  onSelect: (selection) => flow.select(selection),
})

const flow = new GameFlow({
  stage: stageElement,
  stateBadge: document.querySelector('[data-game-state]'),
  onStateChange: handleStateChange,
})

initializeCamera()
requestAnimationFrame(updateCombat)

function handleStateChange(state) {
  gestureNavigation.lockUntilPointRelease()
  if (state === APP_STATES.COMBAT) {
    combatGame.start(performance.now())
    combatView = new CombatView({ root: stageElement, shield: shieldElement })
    combatView.render(combatGame, performance.now())
    return
  }

  combatView = null
  shieldElement.textContent = 'SHIELD OFFLINE'
  shieldElement.classList.remove('shield-active', 'full-barrier-active')
  if (state === APP_STATES.INTRO) combatGame.reset()
}

function updateCombat(now) {
  if (flow.state === APP_STATES.COMBAT && combatView) {
    combatGame.update(now)
    combatView.render(combatGame, now)
    if (combatGame.state === GAME_STATES.VICTORY || combatGame.state === GAME_STATES.DEFEAT) {
      flow.showResult(combatGame.state, combatGame.score, combatGame.stats)
    }
  }
  requestAnimationFrame(updateCombat)
}

async function initializeCamera() {
  flow.setCameraStatus('connecting', 'CONNECTING CAMERA')
  try {
    cameraStream = await startCamera(videoElement)
    statusElement.textContent = 'CAMERA ONLINE'
    statusElement.className = 'camera-status is-ready'
    flow.setCameraStatus('online', 'CAMERA ONLINE')
    stopHandTracking = await startHandTracking(videoElement, overlayElement, updateGestureDisplay)
    statusElement.textContent = 'CAMERA + TRACKING ONLINE'
    flow.setCameraStatus('online', 'CAMERA ONLINE · TRACKING LOCKED')
    flow.setTrackingReady()
    document.querySelector('.tracking-live').textContent = 'LIVE'
  } catch (error) {
    console.error('Camera or hand tracking could not be started.', error)
    statusElement.textContent = `CAMERA ERROR · ${error.message}`
    statusElement.className = 'camera-status is-error'
    flow.setCameraStatus('error', `CAMERA ERROR · ${error.message}`)
    document.querySelector('.tracking-live').textContent = 'OFFLINE'
  }
}

function updateGestureDisplay(landmarks, handedness, timestamp) {
  const hands = twoHandInput.update(landmarks, handedness, timestamp)
  gestureDisplayElement.textContent = `LEFT: ${hands.LEFT.gesture} · RIGHT: ${hands.RIGHT.gesture}`
  gestureDebugElement.textContent = `LEFT RAW: ${hands.LEFT.debug.rawGesture} · RIGHT RAW: ${hands.RIGHT.debug.rawGesture}`

  const feedbackHand = ['LEFT', 'RIGHT'].filter((side) => hands[side].landmarks)
    .sort((a, b) => feedbackPriority(hands[b].feedback) - feedbackPriority(hands[a].feedback))[0]
  updateGestureQuality(
    feedbackHand ? hands[feedbackHand].feedback : { state: 'neutral', components: [] },
    feedbackHand,
    feedbackHand ? hands[feedbackHand].debug.rawGesture : GESTURES.NONE,
  )

  const screenChangedByGesture = flow.handleHands(hands, timestamp)
  if (screenChangedByGesture) gestureNavigation.lockUntilPointRelease()
  if (flow.state === APP_STATES.COMBAT) {
    combatGame.acceptHands({ LEFT: hands.LEFT.gesture, RIGHT: hands.RIGHT.gesture }, timestamp)
  }

  if (hands[cursorHandSide].gesture !== GESTURES.POINT) {
    cursorHandSide = hands.LEFT.gesture === GESTURES.POINT ? 'LEFT' : 'RIGHT'
  }
  const cursorHand = hands[cursorHandSide]
  gestureNavigation.update({
    gesture: cursorHand.gesture,
    indexTip: cursorHand.landmarks?.[8],
    timestamp,
    videoElement,
  })
}

function feedbackPriority(feedback) {
  return { correcting: 3, pending: 2, success: 1, neutral: 0 }[feedback.state]
}

function updateGestureQuality(feedback, side, rawGesture) {
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
    gestureQualityTitleElement.textContent = feedback.fingerStates ? `${side} · NO STATIC GESTURE` : 'AWAITING HAND'
    gestureQualityMeterElement.style.width = '0%'
    gestureQualityMessageElement.textContent = feedback.fingerStates
      ? 'Show a static gesture to receive guidance'
      : 'Show a hand to receive guidance'
    return
  }

  gestureQualityElement.className = `gesture-quality is-${feedback.state}`
  const label = feedback.state === 'success' ? formatGesture(feedback.gesture) : `ATTEMPTING ${formatGesture(feedback.gesture)}`
  gestureQualityTitleElement.textContent = `${side} · ${label} · QUALITY: ${feedback.quality}%`
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
