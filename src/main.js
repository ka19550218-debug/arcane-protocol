import './styles.css'
import { startCamera, stopCamera } from './camera.js'
import { GESTURES } from './gesture-engine.js'
import { TwoHandInput } from './two-hand-input.js'
import { startHandTracking } from './hand-tracker.js'
import { GestureNavigation } from './gesture-navigation.js'
import { CombatGame } from './game/combat.js'
import { CombatView } from './game/combat-view.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <section class="app-shell" aria-labelledby="app-title">
    <header class="game-header">
      <div><p class="eyebrow">ADMIT HACKATHON · MOTION 2026</p><h1 id="app-title">ARCANE <span>PROTOCOL</span></h1></div>
      <p class="state-badge" data-game-state>READY</p>
    </header>
    <div class="game-layout">
      <section class="combat-panel" aria-label="Combat arena">
        <div class="combat-topline"><span>ENCOUNTER 01</span><span>VEX VS THE WARDEN</span></div>
        <div class="boss-status"><div class="stat-label"><span>THE WARDEN</span><strong data-boss-hp>300 / 300</strong></div><div class="health-track boss-track"><span data-boss-bar></span></div></div>
        <div class="arena">
          <div class="arena-grid" aria-hidden="true"></div>
          <div class="warning-panel" data-warning hidden>
            <span class="warning-eyebrow">WARNING</span>
            <strong data-warning-title>ENERGY BLAST</strong>
            <span data-warning-instruction>OPEN PALM TO BLOCK</span>
            <span class="warning-countdown" data-warning-countdown>1.8s</span>
          </div>
          <div class="fighters" aria-hidden="true">
            <div class="fighter fighter-vex"><div class="fighter-core"></div><span>VEX</span></div>
            <div class="fighter fighter-warden"><div class="fighter-core"></div><span>THE WARDEN</span></div>
          </div>
        </div>
        <p class="combat-feedback" data-combat-feedback aria-live="polite">POINT at START COMBAT to begin</p>
        <div class="combat-bottomline">
          <div class="player-status"><div class="stat-label"><span>VEX · HP</span><strong data-player-hp>100 / 100</strong></div><div class="health-track player-track"><span data-player-bar></span></div></div>
          <div class="score-status"><span>SCORE</span><strong data-score>0</strong></div>
        </div>
      </section>
      <aside class="tracking-panel" aria-label="Gesture controls and camera">
        <div class="tracking-heading"><span>HAND TRACKING</span><span class="tracking-live">LIVE</span></div>
        <div class="camera-frame">
          <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
          <canvas class="hand-overlay" aria-hidden="true"></canvas>
          <section class="navigation-menu" aria-label="Combat controls">
            <p class="navigation-label">POINT AND HOLD TO SELECT</p>
            <div class="navigation-buttons"></div>
          </section>
          <p class="camera-status" role="status">Starting camera…</p>
        </div>
        <p class="gesture-display" aria-live="polite">LEFT: NONE · RIGHT: NONE</p>
        <p class="gesture-debug">LEFT RAW: NONE · RIGHT RAW: NONE</p>
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

const videoElement = document.querySelector('.camera-feed')
const overlayElement = document.querySelector('.hand-overlay')
const statusElement = document.querySelector('.camera-status')
const gestureDisplayElement = document.querySelector('.gesture-display')
const gestureDebugElement = document.querySelector('.gesture-debug')
const twoHandInput = new TwoHandInput()
const gestureQualityElement = document.querySelector('.gesture-quality')
const gestureQualityTitleElement = document.querySelector('.gesture-quality-title')
const gestureQualityMeterElement = document.querySelector('.gesture-quality-meter > span')
const gestureQualityMessageElement = document.querySelector('.gesture-quality-message')
const gestureQualityDebugElement = document.querySelector('.gesture-quality-debug')
const SHOW_GESTURE_DEBUG = true // Set false after tuning; no other UI changes needed.
gestureQualityDebugElement.hidden = !SHOW_GESTURE_DEBUG
const navigationMenuElement = document.querySelector('.navigation-menu')
const combatGame = new CombatGame()
const combatView = new CombatView(app)
combatView.render(combatGame, performance.now())

const gestureNavigation = new GestureNavigation({
  container: document.querySelector('.camera-frame'),
  menu: navigationMenuElement,
  onSelect: (selection) => {
    if (selection === 'START' || selection === 'RESTART') {
      combatGame.start(performance.now())
      combatView.render(combatGame, performance.now())
    }
  },
})

let cameraStream
let stopHandTracking
let cursorHandSide = 'LEFT'

initializeCamera()
requestAnimationFrame(updateCombat)

function updateCombat(now) {
  combatGame.update(now)
  combatView.render(combatGame, now)
  requestAnimationFrame(updateCombat)
}

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
  combatGame.acceptHands({ LEFT: hands.LEFT.gesture, RIGHT: hands.RIGHT.gesture }, timestamp)
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
