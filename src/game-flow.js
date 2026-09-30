import { GESTURES } from './gesture-engine.js'
import { createGestureButton } from './gesture-navigation.js'
import { COMBAT, detectCombo } from './game/combat.js'
import { HEROES, getHero, abilityLegend } from './game/heroes.js'
import { getBoss } from './game/bosses.js'
import { ECHO_DIALOGUE, HERO_INTERRUPTS, STORY_SEQUENCES } from './story.js'

export const APP_STATES = Object.freeze({
  INTRO: 'INTRO',
  CAMERA: 'CAMERA',
  CALIBRATION: 'CALIBRATION',
  TUTORIAL: 'TUTORIAL',
  HERO_SELECT: 'HERO_SELECT',
  BRIEFING: 'BRIEFING',
  WARDEN_COMBAT: 'WARDEN_COMBAT',
  RESULT: 'RESULT',
  STORY_REVEAL: 'STORY_REVEAL',
  ECHO_BRIEFING: 'ECHO_BRIEFING',
  ECHO_COMBAT: 'ECHO_COMBAT',
  RESTORATION: 'RESTORATION',
  FINAL_RESULT: 'FINAL_RESULT',
  ENDING: 'ENDING',
})

const CALIBRATION_STEPS = [
  { gesture: GESTURES.OPEN_PALM, title: 'SHOW YOUR OPEN PALM', detail: 'Extend all four fingers toward the camera.' },
  { gesture: GESTURES.FIST, title: 'MAKE A FIST', detail: 'Curl your fingers and hold the pose briefly.' },
  { gesture: GESTURES.POINT, title: 'POINT WITH YOUR INDEX FINGER', detail: 'Keep only your index finger extended.' },
]

const TUTORIAL_ACTIONS = [
  { id: 'PULSE', gestures: [GESTURES.FIST], icon: '✊', title: 'FIST', ability: 'PULSE SHOT' },
  { id: 'SHIELD', gestures: [GESTURES.OPEN_PALM], icon: '✋', title: 'OPEN PALM', ability: 'ENERGY SHIELD' },
  { id: 'DODGE', gestures: [GESTURES.SWIPE_LEFT, GESTURES.SWIPE_RIGHT], icon: '↔', title: 'SWIPE LEFT / RIGHT', ability: 'DODGE' },
  { id: 'SUPER', gestures: [GESTURES.V_SIGN], icon: '✌', title: 'V SIGN', ability: 'SUPER · OVERDRIVE' },
]

const GESTURE_ICONS = Object.freeze({
  [GESTURES.OPEN_PALM]: '✋',
  [GESTURES.FIST]: '✊',
  [GESTURES.POINT]: '☝',
})

export const FLOW_TIMING = Object.freeze({
  CALIBRATION_HOLD_MS: 550,
  CONFIRMATION_MS: 800,
  COMPLETE_MS: 1000,
  CAMERA_ONLINE_MS: 900,
  STORY_MIN_MS: 1800,
  STORY_WORD_MS: 180,
  STORY_MAX_MS: 6500,
  RESULT_MS: 5000,
})
const MAX_SAMPLE_GAP_MS = 250
const ACTION_STATES = {
  SELECT_VEX: APP_STATES.HERO_SELECT,
  SELECT_NEX: APP_STATES.HERO_SELECT,
  SELECT_AERIS: APP_STATES.HERO_SELECT,
  BEGIN_MISSION: APP_STATES.BRIEFING,
  RETRY: APP_STATES.RESULT,
  ENGAGE_ECHO: APP_STATES.ECHO_BRIEFING,
  RETRY_FINAL: APP_STATES.FINAL_RESULT,
  RETRY_STORY: APP_STATES.ENDING,
  MAIN_MENU: [APP_STATES.RESULT, APP_STATES.FINAL_RESULT, APP_STATES.ENDING],
}

export class GameFlow {
  constructor({ stage, stateBadge, onStateChange }) {
    this.stage = stage
    this.stateBadge = stateBadge
    this.onStateChange = onStateChange
    this.state = APP_STATES.INTRO
    this.camera = { state: 'connecting', message: 'CONNECTING CAMERA' }
    this.trackingReady = false
    this.pendingTransition = null
    this.cameraReadyAt = null
    this.calibrationStep = 0
    this.calibrationComplete = false
    this.calibrationHoldStartedAt = null
    this.calibrationHand = null
    this.lastCalibrationSampleAt = null
    this.tutorialComplete = new Set()
    this.tutorialConfirmed = null
    this.selectedHero = 'VEX'
    this.result = null
    this.wardenResult = null
    this.storyStep = 0
    this.storyStartedAt = performance.now()
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

  get isCombat() {
    return this.state === APP_STATES.WARDEN_COMBAT || this.state === APP_STATES.ECHO_COMBAT
  }

  get bossId() {
    return this.state === APP_STATES.ECHO_COMBAT ? 'ECHO' : 'WARDEN'
  }

  get scoreBeforeBattle() {
    return this.bossId === 'ECHO' ? this.wardenResult?.score ?? 0 : 0
  }

  setState(nextState, now = performance.now()) {
    this.pendingTransition = null
    this.tutorialConfirmed = null
    this.cameraReadyAt = null
    this.state = nextState
    this.storyStep = 0
    this.storyStartedAt = now
    this.render()
    this.onStateChange?.(nextState)
  }

  select(value) {
    if (![ACTION_STATES[value]].flat().includes(this.state)) return
    switch (value) {
      case 'SELECT_VEX':
      case 'SELECT_NEX':
      case 'SELECT_AERIS':
        this.selectedHero = value.slice('SELECT_'.length)
        this.setState(APP_STATES.BRIEFING)
        break
      case 'BEGIN_MISSION':
      case 'RETRY':
        this.result = null
        this.wardenResult = null
        this.setState(APP_STATES.WARDEN_COMBAT)
        break
      case 'ENGAGE_ECHO':
        if (this.storyStep !== STORY_SEQUENCES.ECHO_BRIEFING.length - 1 || !this.wardenResult) return
        this.result = null
        this.setState(APP_STATES.ECHO_COMBAT)
        break
      case 'RETRY_FINAL':
        if (this.result?.outcome !== 'DEFEAT' || !this.wardenResult) return
        this.result = null
        this.setState(APP_STATES.ECHO_COMBAT)
        break
      case 'RETRY_STORY':
        if (this.storyStep !== STORY_SEQUENCES.ENDING.length - 1) return
        this.result = null
        this.wardenResult = null
        this.setState(APP_STATES.HERO_SELECT)
        break
      case 'MAIN_MENU':
        this.resetForMainMenu()
        this.setState(APP_STATES.INTRO)
        break
    }
  }

  handleHands(hands, timestamp) {
    if (this.state === APP_STATES.CALIBRATION) return this.updateCalibration(hands, timestamp)
    if (this.state === APP_STATES.TUTORIAL) return this.updateTutorial(hands, timestamp)
    return false
  }

  showResult(outcome, score, stats) {
    // A completed encounter is committed once, before changing screens.
    if (!this.isCombat || !['VICTORY', 'DEFEAT'].includes(outcome)) return
    const bossId = this.bossId
    const encounter = { outcome, score, heroId: this.selectedHero, bossId,
      ...(stats ? { stats: { ...stats } } : {}) }
    if (bossId === 'WARDEN') {
      this.result = encounter
      if (outcome === 'VICTORY') this.wardenResult = encounter
      this.setState(outcome === 'VICTORY' ? APP_STATES.STORY_REVEAL : APP_STATES.RESULT)
      return
    }
    this.result = { ...encounter, score: (this.wardenResult?.score ?? 0) + score }
    if (stats && this.wardenResult?.stats) {
      this.result.stats = Object.fromEntries(Object.keys(stats).map((key) =>
        [key, this.wardenResult.stats[key] + stats[key]]))
    }
    this.setState(outcome === 'VICTORY' ? APP_STATES.RESTORATION : APP_STATES.FINAL_RESULT)
  }

  advanceStory(now = performance.now()) {
    const sequence = STORY_SEQUENCES[this.state]
    if (!sequence) return
    if (this.storyStep < sequence.length - 1) {
      this.storyStep += 1
      this.storyStartedAt = now
      this.render()
      // A page within a state still needs a fresh POINT release before selection.
      this.onStateChange?.(this.state)
      return
    }
    const next = {
      [APP_STATES.INTRO]: APP_STATES.CAMERA,
      [APP_STATES.STORY_REVEAL]: APP_STATES.ECHO_BRIEFING,
      [APP_STATES.RESTORATION]: APP_STATES.FINAL_RESULT,
    }[this.state]
    if (next) this.setState(next, now)
  }

  scheduleTransition(now, delay, action) {
    this.pendingTransition = { at: now + delay, action }
  }

  update(now) {
    if (this.pendingTransition && now >= this.pendingTransition.at) {
      const { action } = this.pendingTransition
      this.pendingTransition = null
      action(now)
      return
    }
    if (this.state === APP_STATES.CAMERA) {
      if (this.camera.state !== 'online' || !this.trackingReady) {
        this.cameraReadyAt = null
        return
      }
      this.cameraReadyAt ??= now
      if (now - this.cameraReadyAt >= FLOW_TIMING.CAMERA_ONLINE_MS) {
        this.resetForMainMenu()
        this.setState(APP_STATES.CALIBRATION, now)
      }
      return
    }
    if (this.state === APP_STATES.FINAL_RESULT && this.result?.outcome === 'VICTORY' &&
      now >= this.storyStartedAt + FLOW_TIMING.RESULT_MS) {
      this.setState(APP_STATES.ENDING, now)
      return
    }
    this.updateStoryProgress(now)
    const sequence = STORY_SEQUENCES[this.state]
    if (!sequence) return
    const last = this.storyStep === sequence.length - 1
    // ENGAGE and the ending menu remain deliberate POINT + dwell choices.
    if (last && [APP_STATES.ECHO_BRIEFING, APP_STATES.ENDING].includes(this.state)) return
    const page = sequence[this.storyStep]
    const words = [page.title, ...(page.lines ?? []), ...(page.dialogue ?? [])].join(' ').split(/\s+/).length
    const readingMs = Math.min(FLOW_TIMING.STORY_MAX_MS,
      Math.max(FLOW_TIMING.STORY_MIN_MS, words * FLOW_TIMING.STORY_WORD_MS))
    const progressMs = page.progress
      ? (page.progress.values.length - 1) * page.progress.stepMs + FLOW_TIMING.COMPLETE_MS : 0
    if (now - this.storyStartedAt >= Math.max(readingMs, progressMs)) this.advanceStory(now)
  }

  updateStoryProgress(now) {
    const progress = STORY_SEQUENCES[this.state]?.[this.storyStep]?.progress
    if (!progress) return
    const index = Math.min(progress.values.length - 1,
      Math.max(0, Math.floor((now - this.storyStartedAt) / progress.stepMs)))
    const value = progress.values[index]
    const label = this.stage.querySelector('[data-story-progress]')
    const meter = this.stage.querySelector('[data-story-meter]')
    const status = this.stage.querySelector('[data-story-status]')
    const percentage = `${String(value).padStart(progress.pad ? 2 : 1, '0')}%`
    const message = index === progress.values.length - 1 ? progress.complete : 'CONNECTING...'
    if (label && label.textContent !== percentage) label.textContent = percentage
    if (meter && meter.style.width !== `${value}%`) meter.style.width = `${value}%`
    if (status && status.textContent !== message) status.textContent = message
  }

  updateCalibration(hands, timestamp) {
    if (this.calibrationComplete || this.pendingTransition) return false
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
    const progress = Math.min((timestamp - this.calibrationHoldStartedAt) / FLOW_TIMING.CALIBRATION_HOLD_MS, 1)
    if (status) status.textContent = progress === 1 ? 'GESTURE CONFIRMED' : 'CONFIRMING STABLE GESTURE...'
    if (meter) meter.style.width = `${progress * 100}%`

    if (progress < 1) return false
    this.calibrationHoldStartedAt = null
    if (this.calibrationStep === CALIBRATION_STEPS.length - 1) {
      this.calibrationComplete = true
      this.render()
      this.scheduleTransition(timestamp, FLOW_TIMING.COMPLETE_MS,
        (now) => this.setState(APP_STATES.TUTORIAL, now))
    } else {
      this.scheduleTransition(timestamp, FLOW_TIMING.CONFIRMATION_MS, () => {
        this.calibrationStep += 1
        this.render()
      })
    }
    return true
  }

  updateTutorial(hands, timestamp) {
    if (this.pendingTransition) return false
    // A two-hand combo must not count as practicing its component one-hand actions.
    if (detectCombo(hands.LEFT?.gesture, hands.RIGHT?.gesture)) return false
    const action = TUTORIAL_ACTIONS.find((item) => !this.tutorialComplete.has(item.id))
    if (!action) return false
    const recognized = Object.values(hands).filter((hand) => hand.landmarks &&
      hand.gesture === hand.debug.rawGesture).map((hand) => hand.gesture)
    const swipes = recognized.filter((gesture) => gesture === GESTURES.SWIPE_LEFT || gesture === GESTURES.SWIPE_RIGHT)
    const gestures = swipes.length ? swipes : recognized
    if (!action.gestures.some((gesture) => gestures.includes(gesture))) return false
    this.tutorialComplete.add(action.id)
    this.renderTutorialConfirmation(action)
    this.scheduleTransition(timestamp, FLOW_TIMING.CONFIRMATION_MS, (now) => {
      this.tutorialConfirmed = null
      if (this.tutorialComplete.size === TUTORIAL_ACTIONS.length) this.setState(APP_STATES.HERO_SELECT, now)
      else this.render()
    })
    return true
  }

  renderTutorialConfirmation(action) {
    this.tutorialConfirmed = action
    this.render()
    const status = this.stage.querySelector('[data-tutorial-status]')
    if (status) status.textContent = `${action.ability} CONFIRMED${action.id === 'SUPER' ? ' · TRAINING COMPLETE' : ''}`
  }

  resetForMainMenu() {
    this.pendingTransition = null
    this.calibrationStep = 0
    this.calibrationComplete = false
    this.calibrationHoldStartedAt = null
    this.calibrationHand = null
    this.lastCalibrationSampleAt = null
    this.tutorialComplete.clear()
    this.tutorialConfirmed = null
    this.selectedHero = 'VEX'
    this.result = null
    this.wardenResult = null
  }

  render() {
    this.stage.className = 'main-stage'
    this.stage.dataset.appState = this.state.toLowerCase()
    this.stateBadge.textContent = badgeFor(this.state)
    this.stage.innerHTML = ''

    switch (this.state) {
      case APP_STATES.INTRO:
      case APP_STATES.STORY_REVEAL:
      case APP_STATES.ECHO_BRIEFING:
      case APP_STATES.RESTORATION:
      case APP_STATES.ENDING:
        this.renderStory()
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
      case APP_STATES.WARDEN_COMBAT:
      case APP_STATES.ECHO_COMBAT:
        this.stage.innerHTML = combatMarkup(getHero(this.selectedHero), getBoss(this.bossId))
        break
      case APP_STATES.RESULT:
      case APP_STATES.FINAL_RESULT:
        this.renderResult()
        break
    }
  }

  renderStory() {
    const sequence = STORY_SEQUENCES[this.state]
    const page = sequence[this.storyStep]
    const intro = this.state === APP_STATES.INTRO
    const last = this.storyStep === sequence.length - 1
    const speaker = page.heroInterrupt ? this.selectedHero : page.speaker
    const dialogue = page.heroInterrupt ? [HERO_INTERRUPTS[this.selectedHero]] : page.dialogue
    this.stage.innerHTML = `
      <section class="story-screen sequence-screen ${intro ? 'intro-screen' : ''} story-${page.tone ?? 'normal'}" aria-labelledby="story-title">
        <p class="screen-kicker">${page.kicker}</p>
        <h2 id="story-title">${page.title === 'ARCANE PROTOCOL' ? 'ARCANE <span>PROTOCOL</span>' : page.title}</h2>
        ${page.lines ? `<div class="intro-transmission">${page.lines.map((line) => `<p>${line}</p>`).join('')}</div>` : ''}
        ${dialogue ? `<div class="echo-message">${dialogue.map((line) => `<p><strong>${speaker}:</strong> ${line}</p>`).join('')}</div>` : ''}
        ${page.progress ? `<div class="story-progress" aria-label="${page.progress.label}">
          <span>${page.progress.label}</span><strong data-story-progress></strong>
          <div class="confirmation-meter" aria-hidden="true"><span data-story-meter></span></div>
          <p data-story-status role="status"></p></div>` : ''}
        ${page.heroInterrupt ? `<p class="screen-copy">${getHero(this.selectedHero).defense.effect === 'freeze'
          ? 'Palms pause attacks; they resume afterward. Strike during the pause. Swipe in the shown direction for DATA SWEEP.'
          : 'Open palm blocks pulses. Swipe in the shown direction for DATA SWEEP. Time your shield near impact for CORRUPTION BURST.'}</p>` : ''}
        ${intro ? `<p class="system-line ${this.camera.state}" role="status"></p>
          <p class="screen-copy">${this.trackingReady ? 'Tracking online. Synchronization begins automatically.' : 'Allow browser camera access to enable POINT + dwell.'}</p>` : ''}
        <div class="screen-actions"></div>
      </section>`
    if (intro) this.stage.querySelector('.system-line').textContent = this.camera.message
    if (last && this.state === APP_STATES.ENDING) {
      this.appendAction('MAIN MENU', 'MAIN_MENU')
      this.appendAction('RETRY STORY', 'RETRY_STORY')
    } else if (last && this.state === APP_STATES.ECHO_BRIEFING) {
      this.appendAction('ENGAGE', 'ENGAGE_ECHO')
    }
    this.updateStoryProgress(performance.now())
  }

  renderCamera() {
    const online = this.camera.state === 'online'
    const connecting = this.camera.state === 'connecting'
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
  }

  renderCalibration() {
    if (this.calibrationComplete) {
      this.stage.innerHTML = `
        <section class="story-screen calibration-screen" aria-labelledby="calibration-title">
          <p class="screen-kicker">CALIBRATION · 3 / 3</p>
          <h2 id="calibration-title">CALIBRATION <span>COMPLETE</span></h2>
          <div class="success-seal">TRACKING STABLE</div>
          <p class="screen-copy"><strong>ECHO:</strong> ${ECHO_DIALOGUE.calibrated}</p>
          <p class="screen-copy">Tutorial starts automatically. Use the tracking panel whenever you need form guidance.</p>
          <div class="screen-actions"></div>
        </section>`
      return
    }

    const step = CALIBRATION_STEPS[this.calibrationStep]
    this.stage.innerHTML = `
      <section class="story-screen calibration-screen" aria-labelledby="calibration-title">
        <p class="screen-kicker">CALIBRATION · ${this.calibrationStep + 1} / ${CALIBRATION_STEPS.length}</p>
        <h2 id="calibration-title">STEP ${this.calibrationStep + 1}<span> / ${CALIBRATION_STEPS.length}</span></h2>
        <div class="gesture-prompt">
          <span class="gesture-prompt-icon" aria-hidden="true">${GESTURE_ICONS[step.gesture]}</span>
          <strong>${step.title}</strong>
          <span>${step.detail}</span>
        </div>
        <div class="confirmation-meter" aria-hidden="true"><span data-calibration-progress></span></div>
        <p class="confirmation-status" data-calibration-status>WAITING FOR THE REQUIRED GESTURE</p>
        <p class="screen-copy">The live gesture-quality panel gives specific corrections if your pose is close but inaccurate.</p>
      </section>`
  }

  renderTutorial() {
    const action = this.tutorialConfirmed ?? TUTORIAL_ACTIONS.find((item) => !this.tutorialComplete.has(item.id))
    const superStep = action?.id === 'SUPER'
    this.stage.innerHTML = `
      <section class="story-screen tutorial-screen" aria-labelledby="tutorial-title">
        <p class="screen-kicker">TRAINING // ${action?.id ?? 'COMPLETE'} · ${this.tutorialComplete.size} / ${TUTORIAL_ACTIONS.length}</p>
        <h2 id="tutorial-title">INPUT <span>CALIBRATION</span></h2>
        <p class="screen-copy">${ECHO_DIALOGUE.training} Use one hand. Release each pose before repeating it. Move sideways quickly to dodge.</p>
        <div class="gesture-prompt tutorial-prompt ${this.tutorialConfirmed ? 'is-verified' : ''}">
          <span class="gesture-prompt-icon" aria-hidden="true">${action?.icon ?? '✓'}</span>
          <span class="prompt-overline">${this.tutorialConfirmed ? 'INPUT VERIFIED' : 'WAITING FOR INPUT...'}</span>
          <strong>${action?.title ?? 'TRAINING COMPLETE'}</strong>
          <span>${action?.ability ?? 'Choose your operative next.'}</span>
        </div>
        <p class="screen-copy">BASIC ATTACKS CHARGE SUPER · ✊ → +${COMBAT.SUPER_ENERGY_PER_BASIC_ATTACK} ENERGY · ✌️ → SUPER AT 100%</p>
        ${superStep ? `<div class="super-meter is-ready"><div class="stat-label"><span>TRAINING DEMO · SUPER READY ✌️</span><strong>100%</strong></div>
          <div class="health-track super-track"><span style="width:100%"></span></div></div>
          <p class="screen-copy">Demo energy is full. Extend and separate index + middle; fold ring + pinky. Real combat starts at 0%.</p>` : ''}
        <div class="combo-demo" aria-label="Two-hand combination examples">
          <span>2 FISTS · DUAL PULSE</span><span>2 PALMS · FULL BARRIER</span><span>FIST + PALM · SUPER AT 100%</span>
        </div>
        <p class="confirmation-status" data-tutorial-status>${action ? 'PERFORM THE SHOWN ACTION' : 'TRAINING COMPLETE'}</p>
      </section>`
  }

  renderHeroSelect() {
    this.stage.innerHTML = `
      <section class="story-screen hero-screen" aria-labelledby="hero-title">
        <p class="screen-kicker">COMBAT AVATAR SELECTION</p>
        <h2 id="hero-title">CHOOSE YOUR <span>OPERATOR</span></h2>
        <div class="hero-grid">
          ${Object.values(HEROES).map((hero) => `
            <article class="hero-card hero-${hero.id.toLowerCase()}" data-hero="${hero.id}">
              <div class="hero-card-topline"><span>OPERATIVE // ${hero.id}</span><i>ONLINE</i></div>
              ${heroVisualMarkup(hero)}
              <div class="hero-card-copy"><p>${hero.id}</p><strong>${hero.role}</strong><span>${hero.description}</span></div>
              <div class="hero-card-abilities">
                <span>✊ ${hero.attack.name}</span><span>✋ ${hero.defense.name}</span><span>✌ ${hero.ultimate.name}</span>
              </div>
              <div data-hero-action="${hero.id}"></div>
            </article>`).join('')}
        </div>
        <p class="screen-copy"><strong>ECHO:</strong> ${ECHO_DIALOGUE.selectHero}</p>
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
          <p><strong>TARGET:</strong> THE WARDEN · <strong>CLASS:</strong> CORE SENTINEL · <strong>STATUS:</strong> HOSTILE</p>
          ${ECHO_DIALOGUE.briefing.map((line) => `<p><strong>ECHO:</strong> ${line}</p>`).join('')}
        </div>
        <p class="screen-copy">${hero.description}. Your gesture controls remain active throughout the encounter.</p>
        <div class="screen-actions"></div>
      </section>`
    this.appendAction('ENGAGE', 'BEGIN_MISSION')
  }

  renderResult() {
    const victory = this.result?.outcome === 'VICTORY'
    const final = this.state === APP_STATES.FINAL_RESULT
    const hero = getHero(this.result?.heroId ?? this.selectedHero)
    this.stage.innerHTML = `
      <section class="story-screen result-screen ${victory ? 'is-victory' : 'is-defeat'}" aria-labelledby="result-title">
        <p class="screen-kicker">${victory ? 'NETWORK CONTROL RESTORED' : final ? 'ECHO CONTROL: 100%' : 'WARDEN · SECURITY LAYER ACTIVE'}</p>
        <h2 id="result-title">${victory ? 'MISSION <span>COMPLETE</span>' : 'CONNECTION <span>LOST</span>'}</h2>
        <div class="result-summary">
          <strong>${victory ? 'WARDEN: DEFEATED · ECHO: DEFEATED' : 'MISSION FAILED'}</strong>
          <p class="result-operative">OPERATIVE <span>${hero.id}</span></p>
          <p>${victory ? 'FINAL SCORE' : 'SCORE'} <span>${Number(this.result?.score ?? 0).toLocaleString()}</span></p>
          ${this.result?.stats ? `<dl class="result-stats">
            ${Object.entries({ attacks: 'ATTACKS LANDED', blocks: 'BLOCKS', dodges: 'DODGES', combos: 'COMBOS USED' })
              .map(([key, label]) => `<div><dt>${label}</dt><dd>${this.result.stats[key]}</dd></div>`).join('')}
          </dl>` : ''}
        </div>
        <p class="screen-copy">${victory ? 'The channel is yours again. Network recovery can begin.'
          : final ? 'Warden checkpoint secured. Retry ECHO with full health and the same operative.'
            : `${hero.id} lost synchronization. Re-enter the encounter when ready.`}</p>
        <div class="screen-actions"></div>
      </section>`
    if (!victory) this.appendAction(final ? 'RETRY FINAL BATTLE' : 'RETRY', final ? 'RETRY_FINAL' : 'RETRY')
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
    [APP_STATES.WARDEN_COMBAT]: 'WARDEN LIVE',
    [APP_STATES.STORY_REVEAL]: 'CORE UNLOCKED',
    [APP_STATES.ECHO_BRIEFING]: 'PROTOCOL OVERRIDE',
    [APP_STATES.ECHO_COMBAT]: 'ECHO LIVE',
    [APP_STATES.RESTORATION]: 'RESTORING',
    [APP_STATES.FINAL_RESULT]: 'FINAL RESULT',
    [APP_STATES.ENDING]: 'SESSION COMPLETE',
    [APP_STATES.RESULT]: 'MISSION RESULT',
  }[state]
}

function combatMarkup(hero, boss) {
  return `
      <section class="combat-panel encounter-${boss.cssClass}" aria-label="Combat arena">
      <div class="combat-topline"><span>ENCOUNTER // ${boss.encounter}</span><strong>COMBAT LINK ACTIVE</strong><span>${hero.id} VS ${boss.name}</span></div>
      <div class="combat-hud">
        <div class="player-status"><div class="stat-label"><span>${hero.id} · OPERATIVE</span><strong data-player-hp>100 / 100</strong></div><div class="health-track player-track"><span data-player-bar></span></div></div>
        <div class="score-status"><span>LIVE SCORE</span><strong data-score>0</strong></div>
        <div class="boss-status"><div class="stat-label"><span>${boss.name}</span><strong data-boss-hp>${boss.hp} / ${boss.hp}</strong></div><div class="health-track boss-track"><span data-boss-bar></span></div></div>
      </div>
      <div class="arena">
        <div class="arena-grid" aria-hidden="true"></div>
        <div class="warning-panel" data-warning hidden><span class="warning-eyebrow">⚠ INCOMING ATTACK</span><strong data-warning-title>ENERGY BLAST</strong><span class="warning-use">REQUIRED RESPONSE</span><span data-warning-instruction>✋ OPEN PALM TO BLOCK</span><span class="warning-countdown" data-warning-countdown>1.8s</span></div>
        <div class="combat-fx" aria-hidden="true"><span></span></div>
        <div class="fighters" aria-hidden="true">
          <div class="fighter fighter-player fighter-${hero.id.toLowerCase()}"><div class="fighter-aura"></div><div class="fighter-core"></div><div class="fighter-emblem"></div><span>${hero.id}</span></div>
          <div class="fighter fighter-boss fighter-${boss.cssClass}"><div class="fighter-aura"></div><div class="fighter-core"></div><div class="fighter-emblem"></div><span>${boss.name}</span></div>
        </div>
      </div>
      <div class="combat-controls" aria-label="Current operative abilities">
        ${abilityLegend(hero).slice(0, 4).map(([gesture, name], index) => `<p data-ability-slot="${['attack', 'defense', 'dodge', 'super'][index]}"><span>${gesture}</span><strong>${name}</strong><small data-ability-state>READY</small></p>`).join('')}
      </div>
      <div class="super-meter" data-super-meter><div class="stat-label"><span data-super-label>SUPER · ${hero.ultimate.name}</span><strong data-super-value>0%</strong></div>
        <div class="health-track super-track" role="progressbar" aria-label="Super Energy" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-super-progress><span data-super-bar style="width:0%"></span></div></div>
      <p class="combat-feedback" data-combat-feedback aria-live="polite">BASIC ATTACKS CHARGE SUPER · RELEASE EACH POSE TO REPEAT</p>
      <p class="combat-status" data-combat-status role="status"></p>
    </section>`
}

function heroVisualMarkup(hero) {
  return `<div class="hero-visual" aria-hidden="true">
    <span class="hero-visual-ring"></span><span class="hero-visual-head"></span>
    <span class="hero-visual-body"></span><span class="hero-visual-core"></span>
    <span class="hero-visual-mark">${hero.id.slice(0, 1)}</span>
  </div>`
}
