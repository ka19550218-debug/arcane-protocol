import { COMBAT, GAME_STATES } from './combat.js'

export class CombatView {
  constructor({ root, shield, scoreOffset = 0 }) {
    this.root = root
    this.panel = root.querySelector('.combat-panel')
    this.arena = root.querySelector('.arena')
    this.cinematicTitle = root.querySelector('.combat-cinematic strong')
    this.cinematicSubtitle = root.querySelector('.cinematic-subtitle')
    this.playerHp = root.querySelector('[data-player-hp]')
    this.playerBar = root.querySelector('[data-player-bar]')
    this.bossHp = root.querySelector('[data-boss-hp]')
    this.bossBar = root.querySelector('[data-boss-bar]')
    this.score = root.querySelector('[data-score]')
    this.warning = root.querySelector('[data-warning]')
    this.warningTitle = root.querySelector('[data-warning-title]')
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
    this.previousPlayerHp = null
    this.previousBossHp = null
    this.previousScore = null
    this.previousSuperEnergy = null
    this.previousFeedback = null
    this.visualTimer = null
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
      let instruction = `↔ ${hero.dodge} ${attack.direction === 'SWIPE_LEFT' ? 'LEFT' : 'RIGHT'}`
      if (attack.type === 'ENERGY_BLAST') {
        instruction = hero.defense.effect === 'freeze'
          ? '✋ PALM / 2 PALMS TO PAUSE · ATTACK RESUMES'
          : attack.impactAt - now > hero.defense.durationMs
            ? '✋ OPEN PALM AT 2.0s TO BLOCK'
            : '✋ OPEN PALM TO BLOCK'
      }
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
    if (this.previousBossHp !== null && game.bossHp < this.previousBossHp) {
      this.floatText(`−${this.previousBossHp - game.bossHp}`, 'boss')
      this.panel.classList.remove('boss-impact')
      void this.panel.offsetWidth
      this.panel.classList.add('boss-impact')
    }
    if (this.previousPlayerHp !== null && game.playerHp < this.previousPlayerHp) {
      this.floatText(`−${this.previousPlayerHp - game.playerHp} HP`, 'player')
      this.playEffect('damage', 360)
    }
    if (this.previousScore !== null && game.score !== this.previousScore) {
      this.score.classList.remove('score-updated')
      void this.score.offsetWidth
      this.score.classList.add('score-updated')
    }
    if (game.feedback !== this.previousFeedback) {
      const { kind, message } = game.feedback
      if (['hit', 'dual-pulse'].includes(kind)) {
        this.playEffect(message.includes('REFLECTED') ? 'reflect' : kind === 'dual-pulse' ? 'dual-pulse' : `attack-${game.hero.id.toLowerCase()}`, 520)
      } else if (kind === 'overdrive' || kind === 'hack') {
        this.cinematicTitle.textContent = game.hero.ultimate.name
        this.cinematicSubtitle.textContent = game.hero.id === 'NEX' ? 'TARGET COMPROMISED' : game.hero.id === 'AERIS' ? 'TEMPORAL COLLAPSE' : 'MAXIMUM OUTPUT'
        this.playEffect(`super-${game.hero.id.toLowerCase()}`, 900)
      } else if (kind === 'victory' && this.previousBossHp !== null && game.bossHp < this.previousBossHp) {
        const finishingSuper = this.previousSuperEnergy === COMBAT.SUPER_MAX_ENERGY && game.superEnergy === 0
        if (finishingSuper) {
          this.cinematicTitle.textContent = game.hero.ultimate.name
          this.cinematicSubtitle.textContent = game.hero.id === 'NEX' ? 'TARGET COMPROMISED' : game.hero.id === 'AERIS' ? 'TEMPORAL COLLAPSE' : 'MAXIMUM OUTPUT'
          this.playEffect(`super-${game.hero.id.toLowerCase()}`, 900)
        } else {
          this.playEffect(`attack-${game.hero.id.toLowerCase()}`, 520)
        }
        this.finalImpact(game, this.previousBossHp - game.bossHp, finishingSuper)
      } else if (kind === 'shield' && message.includes('BLOCKED')) {
        this.floatText('BLOCKED', 'player')
        this.playEffect('block', 480)
      } else if (kind === 'dodge' && !message.startsWith('DODGED')) {
        const direction = message.includes('LEFT') || game.attack?.direction === 'SWIPE_LEFT' ? 'left' : 'right'
        this.playEffect(`dodge-${direction}`, 430)
      } else if (kind === 'dodge' && message.startsWith('DODGED')) {
        this.floatText('DODGED', 'player')
      } else if (kind === 'freeze') {
        this.playEffect('freeze', 600)
      }
      if (message.includes('REFLECTED')) this.floatText('REFLECTED', 'boss')
      this.previousFeedback = game.feedback
    }
    this.previousPlayerHp = game.playerHp
    this.previousBossHp = game.bossHp
    this.previousScore = game.score
    this.previousSuperEnergy = game.superEnergy
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

  floatText(value, target) {
    const number = document.createElement('span')
    number.className = `floating-combat-text float-${target}`
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
    detail.textContent = `−${damage} CORE INTEGRITY`
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
      super: superReady ? 'SUPER READY' : `SUPER CHARGING · ${game.superEnergy}%`,
    }
    for (const [slot, element] of Object.entries(this.abilityStates)) {
      if (!element) continue
      const state = states[slot]
      setText(element.querySelector('[data-ability-state]'), state)
      element.classList.toggle('is-ready', state === 'READY' || state === 'SUPER READY')
      element.classList.toggle('is-cooldown', state.startsWith('COOLDOWN'))
      element.classList.toggle('is-charging', state.startsWith('SUPER CHARGING'))
    }
  }
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value
}
