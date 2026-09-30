import './styles.css'
import { startCamera, stopCamera } from './camera.js'
import { GESTURES } from './gesture-engine.js'
import { TwoHandInput } from './two-hand-input.js'
import { startHandTracking } from './hand-tracker.js'
import { GestureNavigation } from './gesture-navigation.js'
import { CombatGame, GAME_STATES } from './game/combat.js'
import { CombatView } from './game/combat-view.js'
import { getHero, abilityLegend } from './game/heroes.js'
import { APP_STATES, GameFlow } from './game-flow.js'
import { AudioManager } from './audio.js'

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
        <div class="tracking-heading"><span>NEURAL HAND LINK</span><span class="tracking-live"><i></i> INITIALIZING</span></div>
        <div class="camera-frame">
          <video class="camera-feed" autoplay muted playsinline aria-label="Mirrored webcam preview"></video>
          <canvas class="hand-overlay" aria-hidden="true"></canvas>
          <div class="camera-reticle" aria-hidden="true"></div>
          <span class="camera-corner corner-top" aria-hidden="true">CAM 01 // LIVE</span>
          <span class="camera-corner corner-bottom" aria-hidden="true">ARCANE SENSOR ARRAY</span>
          <p class="camera-status" role="status">CONNECTING CAMERA</p>
        </div>
        <div class="tracking-readout"><div class="link-telemetry"><span>TRACKING <strong data-tracking-state>SEARCHING</strong></span><span>GESTURE <strong data-current-input>NONE</strong></span></div><p class="gesture-display" aria-live="polite">LEFT: NONE · RIGHT: NONE</p></div>
        <p class="shield-status" data-shield>SHIELD OFFLINE</p>
        <section class="gesture-quality is-neutral" aria-live="polite" aria-label="Gesture quality feedback">
          <div class="quality-heading"><span>GESTURE ANALYSIS</span><strong class="gesture-quality-score">—</strong></div>
          <div class="quality-readout"><span>ATTEMPT</span><strong data-quality-attempt>—</strong><span>STATUS</span><strong class="gesture-quality-title">AWAITING HAND</strong></div>
          <div class="gesture-quality-meter" aria-hidden="true"><span></span></div>
          <p class="gesture-quality-message">Show a gesture to receive guidance</p>
          <div class="finger-checks" data-finger-checks hidden aria-label="Finger status">
            <span data-finger="INDEX">INDEX —</span><span data-finger="MIDDLE">MIDDLE —</span>
            <span data-finger="RING">RING —</span><span data-finger="PINKY">PINKY —</span>
          </div>
        </section>
        <div class="controls-label">COMMANDS // QUICK REFERENCE</div>
        <div class="controls-guide">${abilityLegend(getHero()).map(([gesture, name]) => `<p><strong>${gesture}</strong><span>${name}</span></p>`).join('')}</div>
        <details class="tracking-diagnostics">
          <summary>DEVELOPER DIAGNOSTICS</summary>
          <p class="gesture-debug">LEFT RAW: NONE · RIGHT: NONE</p>
          <p class="gesture-quality-debug" aria-hidden="true"></p>
          <pre class="cursor-debug" aria-hidden="true"></pre>
        </details>
      </aside>
    </div>
  </section>
`

const stageFrameElement = document.querySelector('.stage-frame')
const stageElement = document.querySelector('[data-stage]')
const videoElement = document.querySelector('.camera-feed')
const overlayElement = document.querySelector('.hand-overlay')
const overlayContext = overlayElement.getContext('2d')
const statusElement = document.querySelector('.camera-status')
const gestureDisplayElement = document.querySelector('.gesture-display')
const gestureDebugElement = document.querySelector('.gesture-debug')
const gestureQualityElement = document.querySelector('.gesture-quality')
const gestureQualityTitleElement = document.querySelector('.gesture-quality-title')
const gestureQualityAttemptElement = document.querySelector('[data-quality-attempt]')
const fingerChecksElement = document.querySelector('[data-finger-checks]')
const fingerCheckElements = Object.fromEntries(['INDEX', 'MIDDLE', 'RING', 'PINKY'].map((name) =>
  [name, document.querySelector(`[data-finger="${name}"]`)]))
const gestureQualityScoreElement = document.querySelector('.gesture-quality-score')
const gestureQualityMeterElement = document.querySelector('.gesture-quality-meter > span')
const gestureQualityMessageElement = document.querySelector('.gesture-quality-message')
const gestureQualityDebugElement = document.querySelector('.gesture-quality-debug')
const shieldElement = document.querySelector('[data-shield]')
const trackingStateElement = document.querySelector('[data-tracking-state]')
const currentInputElement = document.querySelector('[data-current-input]')
const twoHandInput = new TwoHandInput()
const combatGame = new CombatGame()
const audio = new AudioManager()
combatGame.onAudio = (cue) => audio.play(cue)
const SHOW_GESTURE_DEBUG = true // Set false after tuning; no other UI changes needed.

gestureQualityDebugElement.hidden = !SHOW_GESTURE_DEBUG

let cameraStream
let stopHandTracking
let combatView = null
let resultPresentation = null
let firstControlsShown = false

const FINGER_TIPS = { INDEX: 8, MIDDLE: 12, RING: 16, PINKY: 20 }
const MAIN_FINGERS = Object.keys(FINGER_TIPS)

const gestureNavigation = new GestureNavigation({
  container: stageFrameElement,
  menu: stageElement,
  debugElement: document.querySelector('.cursor-debug'),
  onSelect: (selection) => {
    audio.unlock()
    audio.play('select')
    if (selection.startsWith('SELECT_')) showHeroSync(selection.slice(7))
    flow.select(selection)
  },
})

const flow = new GameFlow({
  stage: stageElement,
  stateBadge: document.querySelector('[data-game-state]'),
  onStateChange: handleStateChange,
  soundEnabled: () => audio.enabled,
  onToggleSound: () => audio.toggle(),
})

stageFrameElement.addEventListener('pointerdown', () => audio.unlock(), { once: true })

initializeCamera()
requestAnimationFrame(updateCombat)

function handleStateChange(state) {
  resultPresentation = null
  gestureNavigation.lockUntilPointRelease()
  const hero = getHero(flow.selectedHero)
  document.querySelector('.controls-guide').innerHTML = abilityLegend(hero)
    .map(([gesture, name]) => `<p><strong>${gesture}</strong><span>${name}</span></p>`).join('')
  if (flow.isCombat) {
    combatGame.start(performance.now(), flow.selectedHero, flow.bossId)
    combatView = new CombatView({ root: stageElement, shield: shieldElement, scoreOffset: flow.scoreBeforeBattle })
    combatView.render(combatGame, performance.now())
    if (!firstControlsShown) {
      firstControlsShown = true
      combatView.showFirstControls()
    }
    return
  }

  combatGame.stop()
  combatView = null
  shieldElement.textContent = `${hero.defense.name} OFFLINE`
  shieldElement.classList.remove('shield-active', 'full-barrier-active')
  if (state === APP_STATES.INTRO) combatGame.reset(flow.selectedHero)
}

function updateCombat(now) {
  flow.update(now)
  if (flow.isCombat && combatView) {
    combatGame.update(now)
    combatView.render(combatGame, now)
    if (combatGame.state === GAME_STATES.VICTORY || combatGame.state === GAME_STATES.DEFEAT) {
      if (!resultPresentation) {
        const echoVictory = combatGame.state === GAME_STATES.VICTORY && flow.bossId === 'ECHO'
        const delay = echoVictory ? 1350 : combatGame.state === GAME_STATES.VICTORY ? 760 : 0
        resultPresentation = { at: now + delay }
        audio.play(combatGame.state === GAME_STATES.VICTORY ? 'victory' : 'defeat')
        if (echoVictory) combatView.playEchoDeath()
      }
      if (now >= resultPresentation.at) flow.showResult(combatGame.state, combatGame.score, combatGame.stats)
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
    document.querySelector('.tracking-live').innerHTML = '<i></i> LIVE'
  } catch (error) {
    console.error('Camera or hand tracking could not be started.', error)
    const trackingInitializationFailed = Boolean(cameraStream)
    const failureLabel = trackingInitializationFailed ? 'TRACKING ERROR' : 'CAMERA ERROR'
    const failureMessage = trackingInitializationFailed
      ? 'Hand tracking could not be initialized. Check your connection and reload the page.'
      : error.message
    if (trackingInitializationFailed) {
      stopCamera(cameraStream)
      cameraStream = undefined
    }
    statusElement.textContent = `${failureLabel} · ${failureMessage}`
    statusElement.className = 'camera-status is-error'
    flow.setCameraStatus('error', `${failureLabel} · ${failureMessage}`)
    document.querySelector('.tracking-live').innerHTML = '<i></i> OFFLINE'
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
  const visibleHand = feedbackHand ? hands[feedbackHand] : null
  setPresentationText(trackingStateElement, !visibleHand ? 'SEARCHING'
    : visibleHand.feedback.state === 'success' ? 'LOCKED' : 'HAND DETECTED'
  )
  const currentGesture = visibleHand && visibleHand.gesture !== GESTURES.NONE ? visibleHand.gesture
    : hands.LEFT.gesture !== GESTURES.NONE ? hands.LEFT.gesture : hands.RIGHT.gesture
  const gestureLabel = formatGesture(currentGesture ?? GESTURES.NONE)
  setPresentationText(currentInputElement, gestureLabel)
  const combatInput = stageElement.querySelector('[data-current-gesture]')
  if (combatInput) setPresentationText(combatInput, `INPUT // ${gestureLabel}`)
  if (visibleHand?.feedback.state === 'correcting') drawFingerCorrections(visibleHand)

  const screenChangedByGesture = flow.handleHands(hands, timestamp)
  if (screenChangedByGesture) gestureNavigation.lockUntilPointRelease()
  if (flow.isCombat) {
    combatGame.acceptHands({ LEFT: hands.LEFT.gesture, RIGHT: hands.RIGHT.gesture }, timestamp)
  }

  gestureNavigation.updateHands(hands, timestamp)
}

function feedbackPriority(feedback) {
  return { correcting: 3, pending: 2, success: 1, neutral: 0 }[feedback.state]
}

function updateGestureQuality(feedback, side, rawGesture) {
  if (SHOW_GESTURE_DEBUG) {
    const fingerDebug = feedback.fingerDiagnostics
      ? Object.entries(feedback.fingerDiagnostics).map(([name, diagnostics]) => {
        if (name === 'THUMB') {
          return `${name}: ${diagnostics.state} (MCP ${formatMetric(diagnostics.mcpAngle, 0)}° · IP ${formatMetric(diagnostics.ipAngle, 0)}° · TIP/BASE ${formatMetric(diagnostics.tipToBase)})`
        }
        return `${name}: ${diagnostics.state} (PIP ${formatMetric(diagnostics.pipAngle3d, 0)}° · DIP ${formatMetric(diagnostics.dipAngle3d, 0)}° · CURL ${formatMetric(diagnostics.totalFlexion, 0)}° · TIP/CHAIN ${formatMetric(diagnostics.tipToChain)})`
      }).join(' | ')
      : ''
    const fistTipDebug = feedback.fistTipMetrics
      ? `FIST TIPS: AVG ${formatMetric(feedback.fistTipMetrics.averageExtension)} · CLOSE ${feedback.fistTipMetrics.closeTipCount}/4`
      : ''
    const componentDebug = feedback.components
      .map(({ name, score }) => `${name}: ${Math.round(score * 100)}%`).join(' · ')
    const classificationDebug = [
      `ATTEMPT: ${feedback.attemptedGesture ?? 'NONE'}`,
      `BASE: ${rawGesture}`,
      `QUALITY: ${feedback.quality ?? 0}%`,
    ].join(' · ')
    gestureQualityDebugElement.textContent = [fingerDebug, fistTipDebug, classificationDebug, componentDebug]
      .filter(Boolean).join(' | ')
  }

  if (feedback.state === 'neutral') {
    gestureQualityElement.className = 'gesture-quality is-neutral'
    gestureQualityTitleElement.textContent = feedback.fingerStates ? 'SCANNING' : 'AWAITING HAND'
    gestureQualityAttemptElement.textContent = '—'
    fingerChecksElement.hidden = true
    gestureQualityScoreElement.textContent = '—'
    gestureQualityMeterElement.style.width = '0%'
    gestureQualityMessageElement.textContent = feedback.fingerStates
      ? 'Show a static gesture to receive guidance'
      : 'Show a hand to receive guidance'
    return
  }

  gestureQualityElement.className = `gesture-quality is-${feedback.state}`
  gestureQualityAttemptElement.textContent = `${side} // ${formatGesture(feedback.gesture)}`
  gestureQualityTitleElement.textContent = feedback.state === 'success' ? 'GESTURE LOCKED'
    : feedback.state === 'pending' ? 'CONFIRMING' : 'CORRECTION NEEDED'
  gestureQualityScoreElement.textContent = `${feedback.quality}%`
  gestureQualityMeterElement.style.width = `${feedback.quality}%`
  gestureQualityMessageElement.textContent = feedback.state === 'success'
    ? 'Pose aligned and recognized'
    : feedback.state === 'pending' ? 'Confirming gesture…' : feedback.correction
  fingerChecksElement.hidden = !feedback.fingerStates
  if (feedback.fingerStates) {
    for (const name of MAIN_FINGERS) {
      const needsFix = fingerNeedsCorrection(feedback.gesture, name, feedback.fingerStates[name])
      const element = fingerCheckElements[name]
      setPresentationText(element, `${name} ${needsFix ? 'FIX' : 'OK'}`)
      element.classList.toggle('needs-fix', needsFix)
    }
  }
}

function fingerNeedsCorrection(gesture, finger, state) {
  if (gesture === GESTURES.OPEN_PALM) return state !== 'EXTENDED'
  if (gesture === GESTURES.FIST) return state !== 'CURLED'
  if (gesture === GESTURES.POINT) return finger === 'INDEX' ? state !== 'EXTENDED' : state === 'EXTENDED'
  if (gesture === GESTURES.V_SIGN) return (finger === 'INDEX' || finger === 'MIDDLE')
    ? state !== 'EXTENDED' : state === 'EXTENDED'
  return false
}

function drawFingerCorrections(hand) {
  if (!hand.landmarks || !overlayElement.width) return
  overlayContext.strokeStyle = '#ffcf76'
  overlayContext.lineWidth = Math.max(3, overlayElement.width / 180)
  for (const name of MAIN_FINGERS) {
    if (!fingerNeedsCorrection(hand.feedback.gesture, name, hand.feedback.fingerStates[name])) continue
    const tip = hand.landmarks[FINGER_TIPS[name]]
    overlayContext.beginPath()
    overlayContext.arc(tip.x * overlayElement.width, tip.y * overlayElement.height,
      Math.max(10, overlayElement.width / 45), 0, Math.PI * 2)
    overlayContext.stroke()
  }
}

function showHeroSync(heroId) {
  if (!['VEX', 'NEX', 'AERIS'].includes(heroId)) return
  const overlay = document.createElement('div')
  overlay.className = `hero-sync hero-sync-${heroId.toLowerCase()}`
  overlay.innerHTML = `<span>OPERATIVE SYNCHRONIZED</span><strong>${heroId}</strong>`
  stageFrameElement.append(overlay)
  setTimeout(() => overlay.remove(), 850)
}

function setPresentationText(element, value) {
  if (element.textContent !== value) element.textContent = value
}

function formatMetric(value, digits = 2) {
  return Number.isFinite(value) ? value.toFixed(digits) : '—'
}

function formatGesture(gesture) {
  return gesture.replace('_', ' ')
}

window.addEventListener('beforeunload', () => {
  stopHandTracking?.()
  stopCamera(cameraStream)
})
