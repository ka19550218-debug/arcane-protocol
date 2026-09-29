import { COMBAT, GAME_STATES } from './combat.js'
import { abilityLegend } from './heroes.js'

export class CombatView {
  constructor({ root, shield }) {
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
    this.shield = shield
  }

  render(game, now) {
    setText(this.playerHp, `${game.playerHp} / ${COMBAT.PLAYER_HP}`)
    this.playerBar.style.width = `${game.playerHp}%`
    setText(this.bossHp, `${game.bossHp} / ${COMBAT.BOSS_HP}`)
    this.bossBar.style.width = `${game.bossHp / COMBAT.BOSS_HP * 100}%`
    setText(this.score, game.score.toLocaleString())

    const hero = game.hero
    const active = game.state === GAME_STATES.COMBAT
    const frozen = active && now < game.frozenUntil
    const seconds = (until) => `${(Math.max(0, until - now) / 1000).toFixed(1)}s`
    const effects = []
    if (frozen) effects.push(`${game.freezeLabel} · PAUSED ${seconds(game.frozenUntil)}`)
    if (active && now < game.disruptedUntil) effects.push(`EMP DISRUPTION ${seconds(game.disruptedUntil)}`)
    if (active && now < game.vulnerableUntil) effects.push(`SYSTEM HACK ×${hero.ultimate.multiplier} · ${seconds(game.vulnerableUntil)}`)
    effects.push(`${hero.ultimate.name}: ${now < game.nextOverdriveAt ? seconds(game.nextOverdriveAt) : 'READY'}`)
    setText(this.status, effects.join(' · '))
    this.root.classList.toggle('time-frozen', frozen)
    this.root.classList.toggle('boss-hacked', active && now < game.vulnerableUntil)

    const attack = game.attack
    this.warning.hidden = !attack
    if (attack) {
      setText(this.warningTitle, frozen ? game.freezeLabel : attack.type === 'ENERGY_BLAST' ? 'ENERGY BLAST' : 'SWEEP ATTACK')
      setText(this.warningInstruction, attack.type === 'ENERGY_BLAST'
        ? hero.defense.effect === 'freeze' ? 'OPEN PALM TO PAUSE · ATTACK RESUMES' : 'OPEN PALM TO BLOCK'
        : `${hero.dodge} ${attack.direction === 'SWIPE_LEFT' ? 'LEFT' : 'RIGHT'}`)
      setText(this.warningCountdown, `${(Math.max(0, attack.impactAt - now) / 1000).toFixed(1)}s`)
      this.warning.classList.toggle('is-defended', attack.defended)
    }

    const feedbackVisible = now < game.feedback.until || game.state === GAME_STATES.VICTORY || game.state === GAME_STATES.DEFEAT
    setText(this.feedback, feedbackVisible ? game.feedback.message : abilityLegend(hero).slice(0, 3).map(([gesture, name]) => `${gesture}: ${name}`).join(' · '))
    this.feedback.dataset.kind = feedbackVisible ? game.feedback.kind : 'neutral'
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
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value
}
