import { COMBAT, GAME_STATES } from './combat.js'

export class CombatView {
  constructor({ root, shield, scoreOffset = 0 }) {
    this.root = root
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
  }

  render(game, now) {
    setText(this.playerHp, `${game.playerHp} / ${COMBAT.PLAYER_HP}`)
    this.playerBar.style.width = `${game.playerHp}%`
    setText(this.bossHp, `${game.bossHp} / ${game.boss.hp}`)
    this.bossBar.style.width = `${game.bossHp / game.boss.hp * 100}%`
    setText(this.score, (game.score + this.scoreOffset).toLocaleString())

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
