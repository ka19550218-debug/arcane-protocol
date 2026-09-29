import { GESTURES } from './gesture-engine.js'
import { createGestureButton } from './gesture-navigation.js'
import { detectCombo } from './game/combat.js'
import { HEROES, getHero, abilityLegend } from './game/heroes.js'

export const APP_STATES = Object.freeze({
  INTRO: 'INTRO',
  CAMERA: 'CAMERA',
  CALIBRATION: 'CALIBRATION',
  TUTORIAL: 'TUTORIAL',
  HERO_SELECT: 'HERO_SELECT',
  BRIEFING: 'BRIEFING',
  COMBAT: 'COMBAT',
  RESULT: 'RESULT',
})

const CALIBRATION_STEPS = [
  { gesture: GESTURES.OPEN_PALM, title: 'SHOW YOUR OPEN PALM', detail: 'Extend all four fingers toward the camera.' },
  { gesture: GESTURES.FIST, title: 'MAKE A FIST', detail: 'Curl your fingers and hold the pose briefly.' },
  { gesture: GESTURES.POINT, title: 'POINT WITH YOUR INDEX FINGER', detail: 'Keep only your index finger extended.' },
]

const TUTORIAL_ACTIONS = [
  { id: 'PULSE', gestures: [GESTURES.FIST], title: 'FIST', ability: 'PULSE SHOT' },
  { id: 'SHIELD', gestures: [GESTURES.OPEN_PALM], title: 'OPEN PALM', ability: 'ENERGY SHIELD' },
  { id: 'DODGE', gestures: [GESTURES.SWIPE_LEFT, GESTURES.SWIPE_RIGHT], title: 'SWIPE LEFT / RIGHT', ability: 'DODGE' },
]

const CALIBRATION_HOLD_MS = 550
const MAX_SAMPLE_GAP_MS = 250
const ACTION_STATES = {
  ENTER_CAMERA: APP_STATES.INTRO,
  BEGIN_CALIBRATION: APP_STATES.CAMERA,
  CALIBRATION_CONTINUE: APP_STATES.CALIBRATION,
  TUTORIAL_CONTINUE: APP_STATES.TUTORIAL,
  SELECT_VEX: APP_STATES.HERO_SELECT,
  SELECT_NEX: APP_STATES.HERO_SELECT,
  SELECT_AERIS: APP_STATES.HERO_SELECT,
  BEGIN_MISSION: APP_STATES.BRIEFING,
  RETRY: APP_STATES.RESULT,
  RESULT_CONTINUE: APP_STATES.RESULT,
  MAIN_MENU: APP_STATES.RESULT,
}

export class GameFlow {
  constructor({ stage, stateBadge, onStateChange }) {
    this.stage = stage
    this.stateBadge = stateBadge
    this.onStateChange = onStateChange
    this.state = APP_STATES.INTRO
    this.camera = { state: 'connecting', message: 'CONNECTING CAMERA' }
    this.trackingReady = false
    this.calibrationStep = 0
    this.calibrationComplete = false
    this.calibrationHoldStartedAt = null
    this.calibrationHand = null
    this.lastCalibrationSampleAt = null
    this.tutorialComplete = new Set()
    this.selectedHero = 'VEX'
    this.result = null
    this.render()
  }

  setCameraStatus(state, message) {
    this.camera = { state, message }
    if (this.state === APP_STATES.INTRO || this.state === APP_STATES.CAMERA) this.render()
  }

  setTrackingReady() {
    this.trackingReady = true
    if (this.state === APP_STATES.INTRO || this.state === APP_STATES.CAMERA) this.render()
  }

  setState(nextState) {
    this.state = nextState
    this.render()
    this.onStateChange?.(nextState)
  }

  select(value) {
    if (ACTION_STATES[value] !== this.state) return
    switch (value) {
      case 'ENTER_CAMERA':
        this.setState(APP_STATES.CAMERA)
        break
      case 'BEGIN_CALIBRATION':
        if (this.trackingReady && this.camera.state === 'online') {
          this.resetForMainMenu()
          this.setState(APP_STATES.CALIBRATION)
        }
        break
      case 'CALIBRATION_CONTINUE':
        if (this.calibrationComplete) this.setState(APP_STATES.TUTORIAL)
        break
      case 'TUTORIAL_CONTINUE':
        if (this.tutorialComplete.size === TUTORIAL_ACTIONS.length) this.setState(APP_STATES.HERO_SELECT)
        break
      case 'SELECT_VEX':
      case 'SELECT_NEX':
      case 'SELECT_AERIS':
        this.selectedHero = value.slice('SELECT_'.length)
        this.setState(APP_STATES.BRIEFING)
        break
      case 'BEGIN_MISSION':
      case 'RETRY':
        this.setState(APP_STATES.COMBAT)
        break
      case 'RESULT_CONTINUE':
        if (this.result?.outcome === 'VICTORY') {
          this.result.teaser = true
          this.render()
        }
        break
      case 'MAIN_MENU':
        this.resetForMainMenu()
        this.setState(APP_STATES.INTRO)
        break
    }
  }

  handleHands(hands, timestamp) {
    if (this.state === APP_STATES.CALIBRATION) return this.updateCalibration(hands, timestamp)
    if (this.state === APP_STATES.TUTORIAL) return this.updateTutorial(hands)
    return false
  }

  showResult(outcome, score, stats) {
    this.result = { outcome, score, heroId: this.selectedHero, teaser: false, ...(stats ? { stats: { ...stats } } : {}) }
    this.setState(APP_STATES.RESULT)
  }

  updateCalibration(hands, timestamp) {
    if (this.calibrationComplete) return false
    const step = CALIBRATION_STEPS[this.calibrationStep]
    // Use the existing base classifier and stable output, never quality as a gate.
    // Requiring the same hand and continuous samples prevents stale poses from passing.
    const matches = (side) => hands[side]?.landmarks &&
      hands[side].gesture === step.gesture && hands[side].debug.rawGesture === step.gesture
    const matchingHand = matches(this.calibrationHand)
      ? this.calibrationHand : Object.keys(hands).find(matches)
    const status = this.stage.querySelector('[data-calibration-status]')
    const meter = this.stage.querySelector('[data-calibration-progress]')

    if (!matchingHand) {
      this.calibrationHoldStartedAt = null
      this.calibrationHand = null
      this.lastCalibrationSampleAt = null
      if (status) status.textContent = 'WAITING FOR THE REQUIRED GESTURE'
      if (meter) meter.style.width = '0%'
      return false
    }

    if (this.calibrationHoldStartedAt === null || matchingHand !== this.calibrationHand ||
      timestamp - this.lastCalibrationSampleAt > MAX_SAMPLE_GAP_MS) {
      this.calibrationHoldStartedAt = timestamp
    }
    this.calibrationHand = matchingHand
    this.lastCalibrationSampleAt = timestamp
    const progress = Math.min((timestamp - this.calibrationHoldStartedAt) / CALIBRATION_HOLD_MS, 1)
    if (status) status.textContent = progress === 1 ? 'GESTURE CONFIRMED' : 'CONFIRMING STABLE GESTURE...'
    if (meter) meter.style.width = `${progress * 100}%`

    if (progress < 1) return false
    this.calibrationStep += 1
    this.calibrationHoldStartedAt = null
    if (this.calibrationStep === CALIBRATION_STEPS.length) this.calibrationComplete = true
    this.render()
    return true
  }

  updateTutorial(hands) {
    // A two-hand combo must not count as practicing its component one-hand actions.
    if (detectCombo(hands.LEFT?.gesture, hands.RIGHT?.gesture)) return false
    const recognized = Object.values(hands).map((hand) => hand.gesture)
    const swipes = recognized.filter((gesture) => gesture === GESTURES.SWIPE_LEFT || gesture === GESTURES.SWIPE_RIGHT)
    const gestures = swipes.length ? swipes : recognized
    const completed = TUTORIAL_ACTIONS.find((action) => (
      !this.tutorialComplete.has(action.id) && action.gestures.some((gesture) => gestures.includes(gesture))
    ))
    if (!completed) return false
    this.tutorialComplete.add(completed.id)
    this.render()
    return true
  }

  resetForMainMenu() {
    this.calibrationStep = 0
    this.calibrationComplete = false
    this.calibrationHoldStartedAt = null
    this.calibrationHand = null
    this.lastCalibrationSampleAt = null
    this.tutorialComplete.clear()
    this.selectedHero = 'VEX'
    this.result = null
  }

  render() {
    this.stage.className = 'main-stage'
    this.stage.dataset.appState = this.state.toLowerCase()
    this.stateBadge.textContent = badgeFor(this.state)
    this.stage.innerHTML = ''

    switch (this.state) {
      case APP_STATES.INTRO:
        this.renderIntro()
        break
      case APP_STATES.CAMERA:
        this.renderCamera()
        break
      case APP_STATES.CALIBRATION:
        this.renderCalibration()
        break
      case APP_STATES.TUTORIAL:
        this.renderTutorial()
        break
      case APP_STATES.HERO_SELECT:
        this.renderHeroSelect()
        break
      case APP_STATES.BRIEFING:
        this.renderBriefing()
        break
      case APP_STATES.COMBAT:
        this.stage.innerHTML = combatMarkup(getHero(this.selectedHero))
        break
      case APP_STATES.RESULT:
        this.renderResult()
        break
    }
  }

  renderIntro() {
    const ready = this.trackingReady
    this.stage.innerHTML = `
      <section class="story-screen intro-screen" aria-labelledby="intro-title">
        <p class="screen-kicker">ADMIT HACKATHON · MOTION 2026</p>
        <h2 id="intro-title">ARCANE <span>PROTOCOL</span></h2>
        <div class="intro-transmission" aria-label="Opening transmission">
          <p>2057</p>
          <p>THE NETWORK HAS FALLEN.</p>
          <p>ONE SYSTEM REMAINS ONLINE.</p>
        </div>
        <p class="system-line ${this.camera.state}" role="status"></p>
        <p class="screen-copy">${ready
          ? 'Gesture tracking is online. Point at the control below and hold to enter.'
          : 'Allow browser camera access. The protocol will unlock when hand tracking is ready.'}</p>
        <div class="screen-actions"></div>
      </section>`
    this.stage.querySelector('.system-line').textContent = this.camera.message
    this.appendAction('ENTER PROTOCOL', 'ENTER_CAMERA')
  }

  renderCamera() {
    const online = this.camera.state === 'online'
    const connecting = this.camera.state === 'connecting'
    const canContinue = online && this.trackingReady
    this.stage.innerHTML = `
      <section class="story-screen camera-screen" aria-labelledby="camera-title">
        <p class="screen-kicker">CAMERA CONNECTION</p>
        <h2 id="camera-title">${connecting ? 'CONNECTING <span>CAMERA</span>' : online ? 'CAMERA <span>ONLINE</span>' : 'CAMERA <span>ERROR</span>'}</h2>
        <div class="connection-grid">
          <p><span>VIDEO INPUT</span><strong>${online ? 'CONNECTED' : 'UNAVAILABLE'}</strong></p>
          <p><span>HAND TRACKING</span><strong>${this.trackingReady ? 'LOCKED' : 'INITIALIZING'}</strong></p>
          <p><span>CONTROL MODE</span><strong>${this.trackingReady ? 'POINT + DWELL' : 'STANDBY'}</strong></p>
        </div>
        <p class="system-line ${this.camera.state}" role="status"></p>
        <p class="screen-copy">${connecting ? 'Allow camera access in the browser permission prompt.' : online
          ? 'Keep the camera clear and show one hand to begin calibration.'
          : 'Allow camera access in your browser, then reload this page to reconnect.'}</p>
        <div class="screen-actions"></div>
      </section>`
    this.stage.querySelector('.system-line').textContent = this.camera.message
    this.appendAction('BEGIN CALIBRATION', 'BEGIN_CALIBRATION', !canContinue)
  }

  renderCalibration() {
    if (this.calibrationComplete) {
      this.stage.innerHTML = `
        <section class="story-screen calibration-screen" aria-labelledby="calibration-title">
          <p class="screen-kicker">CALIBRATION · 3 / 3</p>
          <h2 id="calibration-title">CALIBRATION <span>COMPLETE</span></h2>
          <div class="success-seal">TRACKING STABLE</div>
          <p class="screen-copy">Relax your pointing hand, then point again to continue. Use the tracking panel whenever you need form guidance.</p>
          <div class="screen-actions"></div>
        </section>`
      this.appendAction('CONTINUE', 'CALIBRATION_CONTINUE')
      return
    }

    const step = CALIBRATION_STEPS[this.calibrationStep]
    this.stage.innerHTML = `
      <section class="story-screen calibration-screen" aria-labelledby="calibration-title">
        <p class="screen-kicker">CALIBRATION · ${this.calibrationStep + 1} / ${CALIBRATION_STEPS.length}</p>
        <h2 id="calibration-title">STEP ${this.calibrationStep + 1}<span> / ${CALIBRATION_STEPS.length}</span></h2>
        <div class="gesture-prompt">
          <strong>${step.title}</strong>
          <span>${step.detail}</span>
        </div>
        <div class="confirmation-meter" aria-hidden="true"><span data-calibration-progress></span></div>
        <p class="confirmation-status" data-calibration-status>WAITING FOR THE REQUIRED GESTURE</p>
        <p class="screen-copy">The live gesture-quality panel gives specific corrections if your pose is close but inaccurate.</p>
      </section>`
  }

  renderTutorial() {
    const complete = this.tutorialComplete.size === TUTORIAL_ACTIONS.length
    this.stage.innerHTML = `
      <section class="story-screen tutorial-screen" aria-labelledby="tutorial-title">
        <p class="screen-kicker">OPERATOR TRAINING · ${this.tutorialComplete.size} / ${TUTORIAL_ACTIONS.length}</p>
        <h2 id="tutorial-title">COMBAT <span>CONTROLS</span></h2>
        <p class="screen-copy">Use one hand to perform each action once. For a dodge, move your hand quickly sideways. In combat, release each pose before repeating it and allow abilities to recharge.</p>
        <div class="tutorial-actions">
          ${TUTORIAL_ACTIONS.map((action) => tutorialCard(action, this.tutorialComplete.has(action.id))).join('')}
        </div>
        <div class="combo-demo" aria-label="Two-hand combination examples">
          <span>2 FISTS · DUAL PULSE</span><span>2 PALMS · FULL BARRIER</span><span>FIST + PALM · OVERDRIVE</span>
        </div>
        <p class="confirmation-status ${complete ? 'is-complete' : ''}">${complete
          ? 'CORE ACTIONS CONFIRMED'
          : 'SHOW THE REMAINING GESTURES TO CONTINUE'}</p>
        <div class="screen-actions"></div>
      </section>`
    this.appendAction('CONTINUE', 'TUTORIAL_CONTINUE', !complete)
  }

  renderHeroSelect() {
    this.stage.innerHTML = `
      <section class="story-screen hero-screen" aria-labelledby="hero-title">
        <p class="screen-kicker">COMBAT AVATAR SELECTION</p>
        <h2 id="hero-title">CHOOSE YOUR <span>OPERATOR</span></h2>
        <div class="hero-grid">
          ${Object.values(HEROES).map((hero) => `
            <article class="hero-card hero-${hero.id.toLowerCase()}">
              <p>${hero.id}</p><strong>${hero.role}</strong><span>ONLINE · ${hero.description}</span>
              <div data-hero-action="${hero.id}"></div>
            </article>`).join('')}
        </div>
        <p class="screen-copy">All operators online. Choose your combat style.</p>
        <p class="navigation-hint">POINT + HOLD 0.8s TO SELECT · RELAX HAND BETWEEN SELECTIONS</p>
      </section>`
    for (const hero of Object.values(HEROES)) {
      this.stage.querySelector(`[data-hero-action="${hero.id}"]`).append(
        createGestureButton({ label: `SELECT ${hero.id}`, value: `SELECT_${hero.id}` }),
      )
    }
  }

  renderBriefing() {
    const hero = getHero(this.selectedHero)
    this.stage.innerHTML = `
      <section class="story-screen briefing-screen" aria-labelledby="briefing-title">
        <p class="screen-kicker">ECHO · SECURE CHANNEL</p>
        <h2 id="briefing-title">MISSION <span>BRIEFING</span></h2>
        <div class="success-seal" role="status">SELECTED: ${hero.id} · ${hero.role}</div>
        <div class="echo-message">
          <p><strong>ECHO:</strong> ${hero.id} synchronization complete.</p>
          <p><strong>TARGET:</strong> THE WARDEN</p>
          <p>The Warden is blocking access to the core. Eliminate it.</p>
        </div>
        <p class="screen-copy">${hero.description}. Your gesture controls remain active throughout the encounter.</p>
        <div class="screen-actions"></div>
      </section>`
    this.appendAction('BEGIN MISSION', 'BEGIN_MISSION')
  }

  renderResult() {
    const victory = this.result?.outcome === 'VICTORY'
    const hero = getHero(this.result?.heroId ?? this.selectedHero)
    if (this.result?.teaser) {
      this.stage.innerHTML = `
        <section class="story-screen result-screen teaser-screen" aria-labelledby="teaser-title">
          <p class="screen-kicker">CORE SECURITY · UNLOCKED</p>
          <h2 id="teaser-title">CONNECTION <span>ANOMALY</span></h2>
          <div class="echo-message"><p><strong>ECHO:</strong> Thank you, Operator.</p><p>...</p><p>CONNECTION ANOMALY DETECTED</p></div>
          <p class="screen-copy">TO BE CONTINUED</p>
          <div class="screen-actions"></div>
        </section>`
      this.appendAction('MAIN MENU', 'MAIN_MENU')
      return
    }

    this.stage.innerHTML = `
      <section class="story-screen result-screen ${victory ? 'is-victory' : 'is-defeat'}" aria-labelledby="result-title">
        <p class="screen-kicker">MISSION RESULT</p>
        <h2 id="result-title">${victory ? 'MISSION <span>COMPLETE</span>' : 'CONNECTION <span>LOST</span>'}</h2>
        <div class="result-summary">
          <strong>${victory ? 'THE WARDEN DEFEATED' : 'MISSION FAILED'}</strong>
          <p class="result-operative">OPERATIVE <span>${hero.id}</span></p>
          <p>SCORE <span>${Number(this.result?.score ?? 0).toLocaleString()}</span></p>
          ${this.result?.stats ? `<dl class="result-stats">
            ${Object.entries({ attacks: 'ATTACKS LANDED', blocks: 'BLOCKS', dodges: 'DODGES', combos: 'COMBOS USED' })
              .map(([key, label]) => `<div><dt>${label}</dt><dd>${this.result.stats[key]}</dd></div>`).join('')}
          </dl>` : ''}
        </div>
        <p class="screen-copy">${victory
          ? 'The core is accessible. ECHO is awaiting your next decision.'
          : `${hero.id} lost synchronization. Re-enter the encounter when ready.`}</p>
        <div class="screen-actions"></div>
      </section>`
    if (victory) this.appendAction('CONTINUE', 'RESULT_CONTINUE')
    this.appendAction('RETRY', 'RETRY')
    this.appendAction('MAIN MENU', 'MAIN_MENU')
  }

  appendAction(label, value, disabled = false) {
    const actions = this.stage.querySelector('.screen-actions')
    if (!actions) return
    const button = createGestureButton({ label, value })
    button.disabled = disabled
    actions.append(button)
    if (!actions.nextElementSibling) {
      const hint = document.createElement('p')
      hint.className = 'navigation-hint'
      hint.textContent = 'POINT + HOLD 0.8s TO SELECT · RELAX HAND BETWEEN SELECTIONS'
      actions.after(hint)
    }
  }
}

function badgeFor(state) {
  return {
    [APP_STATES.INTRO]: 'SYSTEM BOOT',
    [APP_STATES.CAMERA]: 'CAMERA LINK',
    [APP_STATES.CALIBRATION]: 'CALIBRATING',
    [APP_STATES.TUTORIAL]: 'TRAINING',
    [APP_STATES.HERO_SELECT]: 'OPERATOR SELECT',
    [APP_STATES.BRIEFING]: 'MISSION BRIEF',
    [APP_STATES.COMBAT]: 'COMBAT LIVE',
    [APP_STATES.RESULT]: 'MISSION RESULT',
  }[state]
}

function tutorialCard(action, complete) {
  return `<article class="tutorial-card ${complete ? 'is-complete' : ''}">
    <span>${complete ? 'CONFIRMED' : 'PENDING'}</span><strong>${action.title}</strong><p>${action.ability}</p>
  </article>`
}

function combatMarkup(hero) {
  return `
    <section class="combat-panel" aria-label="Combat arena">
      <div class="combat-topline"><span>ENCOUNTER 01</span><span>${hero.id} VS THE WARDEN</span></div>
      <div class="boss-status"><div class="stat-label"><span>THE WARDEN</span><strong data-boss-hp>300 / 300</strong></div><div class="health-track boss-track"><span data-boss-bar></span></div></div>
      <div class="arena">
        <div class="arena-grid" aria-hidden="true"></div>
        <div class="warning-panel" data-warning hidden><span class="warning-eyebrow">WARNING</span><strong data-warning-title>ENERGY BLAST</strong><span data-warning-instruction>OPEN PALM TO BLOCK</span><span class="warning-countdown" data-warning-countdown>1.8s</span></div>
        <div class="fighters" aria-hidden="true"><div class="fighter fighter-player fighter-${hero.id.toLowerCase()}"><div class="fighter-core"></div><span>${hero.id}</span></div><div class="fighter fighter-warden"><div class="fighter-core"></div><span>THE WARDEN</span></div></div>
      </div>
      <p class="combat-feedback" data-combat-feedback aria-live="polite">${abilityLegend(hero).slice(0, 3).map(([gesture, name]) => `${gesture}: ${name}`).join(' · ')}</p>
      <p class="combat-status" data-combat-status role="status"></p>
      <div class="combat-bottomline"><div class="player-status"><div class="stat-label"><span>${hero.id} · HP</span><strong data-player-hp>100 / 100</strong></div><div class="health-track player-track"><span data-player-bar></span></div></div><div class="score-status"><span>SCORE</span><strong data-score>0</strong></div></div>
    </section>`
}
