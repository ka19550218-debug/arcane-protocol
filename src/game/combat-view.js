import { COMBAT, GAME_STATES } from './combat.js'

const EMPTY_EVENTS = []

export class CombatView {
  constructor({ root, shield, scoreOffset = 0 }) {
    this.root = root
    this.panel = root.querySelector('.combat-panel')
    this.arena = root.querySelector('.arena')
    this.arena.style.setProperty('--arena-travel', `${Math.round(this.arena.clientWidth * 0.45)}px`)
    this.cinematicTitle = root.querySelector('.combat-cinematic strong')
    this.cinematicSubtitle = root.querySelector('.cinematic-subtitle')
    this.playerHp = root.querySelector('[data-player-hp]')
    this.playerBar = root.querySelector('[data-player-bar]')
    this.playerCondition = root.querySelector('[data-player-condition]')
    this.bossHp = root.querySelector('[data-boss-hp]')
    this.bossBar = root.querySelector('[data-boss-bar]')
    this.bossCondition = root.querySelector('[data-boss-condition]')
    this.score = root.querySelector('[data-score]')
    this.scoreStatus = root.querySelector('.score-status')
    this.warning = root.querySelector('[data-warning]')
    this.warningTitle = root.querySelector('[data-warning-title]')
    this.warningIcon = root.querySelector('[data-warning-icon]')
    this.warningAction = root.querySelector('[data-warning-action]')
    this.warningInstruction = root.querySelector('[data-warning-instruction]')
    this.warningCountdown = root.querySelector('[data-warning-countdown]')
    this.feedback = root.querySelector('[data-combat-feedback]')
    this.status = root.querySelector('[data-combat-status]')
    this.superMeter = root.querySelector('[data-super-meter]')
    this.superLabel = root.querySelector('[data-super-label]')
    this.superValue = root.querySelector('[data-super-value]')
    this.superBar = root.querySelector('[data-super-bar]')
    this.superProgress = root.querySelector('[data-super-progress]')
    this.abilityStates = Object.fromEntries(['attack', 'defense', 'dodge', 'super'].map((slot) => [
      slot,
      root.querySelector(`[data-ability-slot="${slot}"]`),
    ]))
    this.shield = shield
    this.scoreOffset = scoreOffset
    this.previousScore = null
    this.visualTimer = null
    this.nextCorruptionAt = performance.now() + 6500
    this.playEntrance()
  }

  render(game, now) {
    this.renderVisualEvents(game)
    setText(this.playerHp, `${game.playerHp} / ${COMBAT.PLAYER_HP}`)
    this.playerBar.style.width = `${game.playerHp}%`
    setText(this.bossHp, `${game.bossHp} / ${game.boss.hp}`)
    this.bossBar.style.width = `${game.bossHp / game.boss.hp * 100}%`
    setText(this.score, (game.score + this.scoreOffset).toLocaleString())
    this.panel.classList.toggle('player-critical', game.playerHp > 0 && game.playerHp <= 30)
    this.panel.classList.toggle('boss-critical', game.bossHp > 0 && game.bossHp / game.boss.hp <= 0.25)
    setText(this.playerCondition, game.playerHp > 0 && game.playerHp <= 30 ? 'OPERATIVE CONDITION: CRITICAL' : 'VITAL LINK')
    setText(this.bossCondition, game.bossHp > 0 && game.bossHp / game.boss.hp <= 0.25 ? 'CORE INTEGRITY CRITICAL' : 'CORE INTEGRITY')
    this.panel.classList.toggle('echo-corruption', game.boss.id === 'ECHO' && game.state === GAME_STATES.COMBAT)
    if (game.boss.id === 'ECHO' && game.state === GAME_STATES.COMBAT && now >= this.nextCorruptionAt) {
      this.showCombatBanner(Math.floor(now / 9000) % 2 ? 'ECHO OVERRIDE' : 'SIGNAL CORRUPTED', 'corruption')
      this.panel.classList.add('echo-glitch')
      setTimeout(() => this.panel.classList.remove('echo-glitch'), 430)
      this.nextCorruptionAt = now + 8500
    }

    const hero = game.hero
    const superReady = game.superEnergy === COMBAT.SUPER_MAX_ENERGY
    this.superMeter.classList.toggle('is-ready', superReady)
    setText(this.superLabel, superReady ? `SUPER READY ✌️ · ${hero.ultimate.name}` : `SUPER · ${hero.ultimate.name}`)
    setText(this.superValue, `${game.superEnergy}%`)
    this.superBar.style.width = `${game.superEnergy}%`
    this.superProgress.setAttribute('aria-valuenow', String(game.superEnergy))
    const active = game.state === GAME_STATES.COMBAT
    this.renderAbilityStates(game, now, superReady, active)
    const frozen = active && now < game.frozenUntil
    const seconds = (until) => `${(Math.max(0, until - now) / 1000).toFixed(1)}s`
    const effects = []
    if (frozen) effects.push(`${game.freezeLabel} · PAUSED ${seconds(game.frozenUntil)}`)
    if (active && now < game.disruptedUntil) effects.push(`EMP DISRUPTION ${seconds(game.disruptedUntil)}`)
    if (active && now < game.vulnerableUntil) effects.push(`SYSTEM HACK ×${hero.ultimate.multiplier} · ${seconds(game.vulnerableUntil)}`)
    setText(this.status, effects.join(' · '))
    this.root.classList.toggle('time-frozen', frozen)
    this.root.classList.toggle('boss-hacked', active && now < game.vulnerableUntil)

    const attack = game.attack
    this.warning.hidden = !attack
    if (attack) {
      setText(this.warningTitle, frozen ? `${attack.label} · ${game.freezeLabel}` : attack.label)
      let icon = attack.direction === 'SWIPE_LEFT' ? '←' : '→'
      let action = attack.direction === 'SWIPE_LEFT' ? 'SWIPE LEFT' : 'SWIPE RIGHT'
      let instruction = hero.dodge
      if (attack.type === 'ENERGY_BLAST') {
        icon = '✋'
        action = 'OPEN PALM'
        instruction = hero.defense.effect === 'freeze'
          ? 'PAUSE ONLY · ATTACK RESUMES'
          : attack.impactAt - now > hero.defense.durationMs
            ? 'WAIT UNTIL 2.0s TO BLOCK'
            : 'TO BLOCK'
      }
      setText(this.warningIcon, icon)
      setText(this.warningAction, action)
      setText(this.warningInstruction, instruction)
      const remainingMs = Math.max(0, attack.impactAt - now)
      setText(this.warningCountdown, `${(remainingMs / 1000).toFixed(1)}s`)
      this.warning.style.setProperty('--warning-progress', String(remainingMs / attack.warningMs))
      this.warning.classList.toggle('is-urgent', remainingMs < 750 && !attack.defended)
      this.warning.classList.toggle('is-defended', attack.defended)
    }

    const feedbackVisible = now < game.feedback.until || game.state === GAME_STATES.VICTORY || game.state === GAME_STATES.DEFEAT
    setText(this.feedback, feedbackVisible ? game.feedback.message : 'BASIC ATTACKS CHARGE SUPER · RELEASE EACH POSE TO REPEAT')
    this.feedback.dataset.kind = feedbackVisible ? game.feedback.kind : 'neutral'
    this.root.dataset.combatEffect = feedbackVisible ? game.feedback.kind : 'neutral'
    this.root.classList.toggle('shield-active', game.state === GAME_STATES.COMBAT && now < game.shieldUntil)
    this.root.classList.toggle('full-barrier-active', game.state === GAME_STATES.COMBAT && now < game.fullBarrierUntil)
    this.shield.classList.toggle('shield-active', game.state === GAME_STATES.COMBAT && now < game.shieldUntil)
    this.shield.classList.toggle('full-barrier-active', game.state === GAME_STATES.COMBAT && now < game.fullBarrierUntil)
    this.root.classList.toggle('boss-hit', ['hit', 'dual-pulse', 'overdrive'].includes(game.feedback.kind) && now < game.feedback.until)
    this.root.classList.toggle('dual-pulse-effect', game.feedback.kind === 'dual-pulse' && now < game.feedback.until)
    this.root.classList.toggle('overdrive-effect', game.feedback.kind === 'overdrive' && now < game.feedback.until)
    this.root.classList.toggle('player-hit', game.feedback.kind === 'damage' && now < game.feedback.until)
    setText(this.shield, game.state === GAME_STATES.COMBAT && now < game.fullBarrierUntil
      ? `${hero.barrier.name} ${seconds(game.fullBarrierUntil)}`
      : game.state === GAME_STATES.COMBAT && now < game.shieldUntil
        ? `${hero.defense.name} ${seconds(game.shieldUntil)}`
        : frozen ? `${game.freezeLabel} ${seconds(game.frozenUntil)}`
          : `${hero.defense.name} ${now < game.nextShieldAt ? `RECHARGING ${seconds(game.nextShieldAt)}` : 'READY'}`)
  }

  renderVisualEvents(game) {
    const events = game.visualEvents.length ? game.visualEvents.splice(0) : EMPTY_EVENTS
    const mainEffect = events.find((event) => event.type === 'super')
      ?? events.find((event) => event.type === 'attack')
      ?? events.find((event) => event.type === 'dodge-move')
      ?? events.find((event) => event.type === 'player-hit')
      ?? events.find((event) => event.type === 'shield-ready')
    if (mainEffect?.type === 'super') {
      this.cinematicTitle.textContent = mainEffect.name
      this.cinematicSubtitle.textContent = mainEffect.heroId === 'NEX' ? 'SYSTEM ACCESS // TARGET COMPROMISED'
        : mainEffect.heroId === 'AERIS' ? 'TEMPORAL FRACTURE // IMPACT' : 'MAXIMUM OUTPUT // CORE DISCHARGE'
      this.playEffect(`super-${mainEffect.heroId.toLowerCase()}`, 1000)
    } else if (mainEffect?.type === 'attack') {
      this.playEffect(mainEffect.kind === 'reflect' ? 'reflect' : mainEffect.kind === 'dual-pulse'
        ? 'dual-pulse' : `attack-${mainEffect.heroId.toLowerCase()}`, 470)
    } else if (mainEffect?.type === 'dodge-move') {
      this.playEffect(`dodge-${mainEffect.direction}`, 430)
    } else if (mainEffect?.type === 'player-hit') {
      this.playEffect('damage', 360)
    } else if (mainEffect?.type === 'shield-ready') {
      this.playEffect(game.hero.id === 'AERIS' ? 'freeze' : 'shield-ready', 500)
    }

    for (const event of events) {
      if (event.type === 'boss-hit') {
        this.floatText(`−${event.damage}`, 'boss', event.kind === 'overdrive' ? 'large' : '')
        this.panel.classList.remove('boss-impact')
        void this.panel.offsetWidth
        this.panel.classList.add('boss-impact')
      } else if (event.type === 'player-hit') {
        this.floatText(`−${event.damage} HP`, 'player')
      } else if (event.type === 'block-success') {
        this.pulseClass('shield-impact', 500)
        this.floatText(event.perfect ? 'PERFECT BLOCK' : event.reflected ? 'REFLECTED' : 'BLOCKED', 'player')
        if (event.perfect) {
          this.showCombatBanner('PERFECT BLOCK  +100', 'perfect')
          this.pulseClass('perfect-action', 700)
        }
        if (event.reflected) this.floatText('REFLECTED', 'boss')
      } else if (event.type === 'dodge-success') {
        this.floatText(event.perfect ? 'PERFECT DODGE' : 'DODGED', 'player')
        if (event.perfect) {
          this.showCombatBanner('PERFECT DODGE  +100', 'perfect')
          this.pulseClass('perfect-action', 700)
        }
      } else if (event.type === 'streak') {
        this.showCombatBanner(`COMBO x${event.count}`, 'combo')
      } else if (event.type === 'super-ready') {
        this.showCombatBanner('SUPER CORE // READY  ✌ V SIGN', 'ready')
        this.pulseClass('super-charged', 1100)
      } else if (event.type === 'boss-defeated' && event.bossId === 'WARDEN') {
        this.finalImpact(game, 0, false)
      }
    }
    if (this.previousScore !== null && game.score !== this.previousScore) {
      if (game.score > this.previousScore) this.showScoreGain(game.score - this.previousScore)
      this.score.classList.remove('score-updated')
      void this.score.offsetWidth
      this.score.classList.add('score-updated')
    }
    this.previousScore = game.score
  }

  playEntrance() {
    this.panel.classList.add('entrance-active')
    if (this.panel.classList.contains('encounter-echo')) this.panel.classList.add('echo-glitch')
    setTimeout(() => this.panel.classList.remove('entrance-active', 'echo-glitch'), 1650)
  }

  showFirstControls() {
    setTimeout(() => {
      if (!this.arena.isConnected) return
      const reminder = document.createElement('div')
      reminder.className = 'first-combat-controls'
      reminder.innerHTML = '<strong>GESTURE CONTROLS</strong><span>✊ ATTACK</span><span>✋ DEFENSE</span><span>↔ DODGE</span><span>✌ SUPER</span>'
      this.arena.append(reminder)
      setTimeout(() => reminder.remove(), 1250)
    }, 1450)
  }

  showScoreGain(points) {
    const gain = document.createElement('span')
    gain.className = 'score-gain'
    gain.textContent = `+${points.toLocaleString()}`
    this.scoreStatus.append(gain)
    setTimeout(() => gain.remove(), 900)
  }

  playEchoDeath() {
    this.panel.classList.remove('echo-corruption')
    this.panel.classList.add('echo-death-active')
    this.showCombatBanner('ECHO CONNECTION // LOST', 'echo-death', 1200)
    setTimeout(() => this.showCombatBanner('ARCANE PROTOCOL // CONTROL RESTORED', 'restored', 800), 520)
  }

  pulseClass(name, duration) {
    this.panel.classList.remove(name)
    void this.panel.offsetWidth
    this.panel.classList.add(name)
    setTimeout(() => this.panel.classList.remove(name), duration)
  }

  showCombatBanner(message, kind, duration = 950) {
    const banner = document.createElement('div')
    banner.className = `combat-banner banner-${kind}`
    banner.textContent = message
    this.arena.append(banner)
    setTimeout(() => banner.remove(), duration)
  }

  playEffect(name, duration) {
    if (this.visualTimer) clearTimeout(this.visualTimer)
    this.panel.removeAttribute('data-visual-effect')
    void this.panel.offsetWidth
    this.panel.dataset.visualEffect = name
    this.visualTimer = setTimeout(() => {
      this.panel.removeAttribute('data-visual-effect')
      this.visualTimer = null
    }, duration)
  }

  floatText(value, target, size = '') {
    const number = document.createElement('span')
    number.className = `floating-combat-text float-${target} ${size}`
    number.textContent = value
    this.arena.append(number)
    number.addEventListener('animationend', () => number.remove(), { once: true })
    setTimeout(() => number.remove(), 1000)
  }

  finalImpact(game, damage, superAttack) {
    const impact = document.createElement('div')
    impact.className = `final-impact ${superAttack ? 'is-super' : ''}`
    const title = document.createElement('strong')
    title.textContent = superAttack ? game.hero.ultimate.name : `${game.boss.name} // OFFLINE`
    const detail = document.createElement('span')
    detail.textContent = damage ? `−${damage} CORE INTEGRITY` : 'CORE INTEGRITY // ZERO'
    impact.append(title, detail)
    this.root.parentElement.append(impact)
    impact.addEventListener('animationend', () => impact.remove(), { once: true })
    setTimeout(() => impact.remove(), 900)
  }

  renderAbilityStates(game, now, superReady, active) {
    const cooldown = (until) => active && now < until ? `COOLDOWN ${(until - now) / 1000 < 10 ? ((until - now) / 1000).toFixed(1) : Math.ceil((until - now) / 1000)}s` : 'READY'
    const states = {
      attack: cooldown(game.nextPulseAt),
      defense: cooldown(game.nextShieldAt),
      dodge: cooldown(game.nextDodgeAt),
      super: superReady ? 'SUPER READY · ✌ V SIGN' : `SUPER ${game.superEnergy}%`,
    }
    for (const [slot, element] of Object.entries(this.abilityStates)) {
      if (!element) continue
      const state = states[slot]
      setText(element.querySelector('[data-ability-state]'), state)
      element.classList.toggle('is-ready', state === 'READY' || state.startsWith('SUPER READY'))
      element.classList.toggle('is-cooldown', state.startsWith('COOLDOWN'))
      element.classList.toggle('is-charging', slot === 'super' && !superReady)
    }
  }
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value
}
