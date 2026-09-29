import { COMBAT, GAME_STATES } from './combat.js'
import { createGestureButton } from '../gesture-navigation.js'

export class CombatView {
  constructor(root) {
    this.root = root
    this.playerHp = root.querySelector('[data-player-hp]')
    this.playerBar = root.querySelector('[data-player-bar]')
    this.bossHp = root.querySelector('[data-boss-hp]')
    this.bossBar = root.querySelector('[data-boss-bar]')
    this.score = root.querySelector('[data-score]')
    this.state = root.querySelector('[data-game-state]')
    this.warning = root.querySelector('[data-warning]')
    this.warningTitle = root.querySelector('[data-warning-title]')
    this.warningInstruction = root.querySelector('[data-warning-instruction]')
    this.warningCountdown = root.querySelector('[data-warning-countdown]')
    this.feedback = root.querySelector('[data-combat-feedback]')
    this.shield = root.querySelector('[data-shield]')
    this.menu = root.querySelector('.navigation-menu')
    this.menuButtons = root.querySelector('.navigation-buttons')
    this.menuLabel = root.querySelector('.navigation-label')
    this.lastState = null
  }

  render(game, now) {
    setText(this.playerHp, `${game.playerHp} / ${COMBAT.PLAYER_HP}`)
    this.playerBar.style.width = `${game.playerHp}%`
    setText(this.bossHp, `${game.bossHp} / ${COMBAT.BOSS_HP}`)
    this.bossBar.style.width = `${game.bossHp / COMBAT.BOSS_HP * 100}%`
    setText(this.score, game.score.toLocaleString())
    setText(this.state, game.state)
    this.root.dataset.gameState = game.state.toLowerCase()

    const attack = game.attack
    this.warning.hidden = !attack
    if (attack) {
      setText(this.warningTitle, attack.type === 'ENERGY_BLAST' ? 'ENERGY BLAST' : 'SWEEP ATTACK')
      setText(this.warningInstruction, attack.type === 'ENERGY_BLAST'
        ? 'OPEN PALM TO BLOCK'
        : attack.direction === 'SWIPE_LEFT' ? 'DODGE LEFT' : 'DODGE RIGHT')
      setText(this.warningCountdown, `${(Math.max(0, attack.impactAt - now) / 1000).toFixed(1)}s`)
      this.warning.classList.toggle('is-defended', attack.defended)
    }

    const feedbackVisible = now < game.feedback.until || game.state === GAME_STATES.VICTORY || game.state === GAME_STATES.DEFEAT
    setText(this.feedback, feedbackVisible ? game.feedback.message : 'FIST: PULSE SHOT  ·  OPEN PALM: SHIELD  ·  SWIPE: DODGE')
    this.feedback.dataset.kind = feedbackVisible ? game.feedback.kind : 'neutral'
    this.root.classList.toggle('shield-active', game.state === GAME_STATES.COMBAT && now < game.shieldUntil)
    this.root.classList.toggle('boss-hit', game.feedback.kind === 'hit' && now < game.feedback.until)
    this.root.classList.toggle('player-hit', game.feedback.kind === 'damage' && now < game.feedback.until)
    setText(this.shield, now < game.shieldUntil && game.state === GAME_STATES.COMBAT
      ? `SHIELD ${(Math.max(0, game.shieldUntil - now) / 1000).toFixed(1)}s`
      : 'SHIELD OFFLINE')

    if (game.state !== this.lastState) {
      this.lastState = game.state
      this.menuButtons.replaceChildren()
      this.menu.hidden = game.state === GAME_STATES.COMBAT
      if (!this.menu.hidden) {
        const isReady = game.state === GAME_STATES.READY
        this.menuLabel.textContent = 'POINT AND HOLD TO SELECT'
        this.menuButtons.append(createGestureButton({
          label: isReady ? 'START COMBAT' : 'RESTART COMBAT',
          value: isReady ? 'START' : 'RESTART',
        }))
      }
    }
  }
}

function setText(element, value) {
  if (element.textContent !== value) element.textContent = value
}
