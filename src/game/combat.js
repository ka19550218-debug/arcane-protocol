import { GESTURES } from '../gesture-engine.js'

export const COMBAT = Object.freeze({
  PLAYER_HP: 100,
  BOSS_HP: 300,
  PULSE_DAMAGE: 20,
  ENERGY_BLAST_DAMAGE: 22,
  SWEEP_DAMAGE: 25,
  PULSE_COOLDOWN_MS: 900,
  SHIELD_COOLDOWN_MS: 3200,
  SHIELD_DURATION_MS: 2200,
  DODGE_COOLDOWN_MS: 450,
  FIRST_ATTACK_DELAY_MS: 2800,
  BETWEEN_ATTACKS_MS: 2500,
  ENERGY_WARNING_MS: 1800,
  SWEEP_WARNING_MS: 2300,
  FEEDBACK_MS: 1200,
  PULSE_SCORE: 100,
  BLOCK_SCORE: 150,
  DODGE_SCORE: 150,
  VICTORY_SCORE: 500,
})

export const GAME_STATES = Object.freeze({
  READY: 'READY',
  COMBAT: 'COMBAT',
  VICTORY: 'VICTORY',
  DEFEAT: 'DEFEAT',
})

export class CombatGame {
  constructor() {
    this.lastGesture = GESTURES.NONE
    this.lastStaticAction = null
    this.ignoreStaticAfterSwipe = false
    this.reset()
  }

  reset() {
    this.lastStaticAction = null
    this.ignoreStaticAfterSwipe = false
    this.state = GAME_STATES.READY
    this.playerHp = COMBAT.PLAYER_HP
    this.bossHp = COMBAT.BOSS_HP
    this.score = 0
    this.attack = null
    this.attackCount = 0
    this.nextAttackAt = Infinity
    this.nextPulseAt = 0
    this.nextShieldAt = 0
    this.nextDodgeAt = 0
    this.shieldUntil = 0
    this.feedback = { message: 'POINT at START COMBAT to begin', kind: 'neutral', until: Infinity }
  }

  start(now) {
    this.reset()
    this.state = GAME_STATES.COMBAT
    this.nextAttackAt = now + COMBAT.FIRST_ATTACK_DELAY_MS
    this.showFeedback('ENGAGE THE WARDEN', 'neutral', now)
  }

  // The tracking callback runs every camera frame. Only a changed stable gesture
  // becomes a combat action, so holding FIST or OPEN_PALM cannot repeat it.
  acceptGesture(gesture, now) {
    if (gesture === this.lastGesture) return
    this.lastGesture = gesture
    if (this.state !== GAME_STATES.COMBAT) return

    if (gesture === GESTURES.NONE || gesture === GESTURES.POINT) {
      this.lastStaticAction = null
      this.ignoreStaticAfterSwipe = false
      return
    }
    if (gesture === GESTURES.SWIPE_LEFT || gesture === GESTURES.SWIPE_RIGHT) {
      this.ignoreStaticAfterSwipe = true
      this.dodge(gesture, now)
      return
    }
    if (this.ignoreStaticAfterSwipe) {
      this.ignoreStaticAfterSwipe = false
      this.lastStaticAction = gesture
      return
    }
    if (gesture === this.lastStaticAction) return
    this.lastStaticAction = gesture
    if (gesture === GESTURES.FIST) this.pulseShot(now)
    else if (gesture === GESTURES.OPEN_PALM) this.raiseShield(now)
  }

  pulseShot(now) {
    if (now < this.nextPulseAt) {
      this.showFeedback('PULSE SHOT RECHARGING', 'neutral', now)
      return
    }
    this.nextPulseAt = now + COMBAT.PULSE_COOLDOWN_MS
    this.bossHp = Math.max(0, this.bossHp - COMBAT.PULSE_DAMAGE)
    this.score += COMBAT.PULSE_SCORE
    this.showFeedback(`PULSE SHOT  −${COMBAT.PULSE_DAMAGE}  +${COMBAT.PULSE_SCORE}`, 'hit', now)
    if (this.bossHp === 0) {
      this.score += COMBAT.VICTORY_SCORE
      this.state = GAME_STATES.VICTORY
      this.attack = null
      this.showFeedback(`THE WARDEN DEFEATED  +${COMBAT.VICTORY_SCORE}`, 'victory', now)
    }
  }

  raiseShield(now) {
    if (now < this.nextShieldAt) {
      this.showFeedback('SHIELD RECHARGING', 'neutral', now)
      return
    }
    this.nextShieldAt = now + COMBAT.SHIELD_COOLDOWN_MS
    this.shieldUntil = now + COMBAT.SHIELD_DURATION_MS
    this.showFeedback('ENERGY SHIELD ACTIVE', 'shield', now)
  }

  dodge(gesture, now) {
    if (now < this.nextDodgeAt) return
    this.nextDodgeAt = now + COMBAT.DODGE_COOLDOWN_MS
    if (this.attack?.type !== 'SWEEP' || now >= this.attack.impactAt) {
      this.showFeedback(gesture === GESTURES.SWIPE_LEFT ? 'DODGE LEFT' : 'DODGE RIGHT', 'dodge', now)
      return
    }
    if (gesture === this.attack.direction) {
      this.attack.defended = true
      this.showFeedback('DODGE LOCKED IN', 'dodge', now)
    } else {
      this.showFeedback('WRONG DIRECTION — TRY AGAIN', 'danger', now)
    }
  }

  update(now) {
    if (this.state !== GAME_STATES.COMBAT) return

    if (this.attack && now >= this.attack.impactAt) {
      this.resolveAttack(now)
    }
    if (this.state === GAME_STATES.COMBAT && !this.attack && now >= this.nextAttackAt) {
      this.beginAttack(now)
    }
  }

  beginAttack(now) {
    const isEnergyBlast = this.attackCount % 2 === 0
    const direction = this.attackCount % 4 === 1 ? GESTURES.SWIPE_LEFT : GESTURES.SWIPE_RIGHT
    this.attack = {
      type: isEnergyBlast ? 'ENERGY_BLAST' : 'SWEEP',
      direction: isEnergyBlast ? null : direction,
      impactAt: now + (isEnergyBlast ? COMBAT.ENERGY_WARNING_MS : COMBAT.SWEEP_WARNING_MS),
      defended: false,
    }
    this.attackCount += 1
  }

  resolveAttack(now) {
    const attack = this.attack
    this.attack = null
    this.nextAttackAt = now + COMBAT.BETWEEN_ATTACKS_MS

    const shieldStartedAt = this.shieldUntil - COMBAT.SHIELD_DURATION_MS
    if (attack.type === 'ENERGY_BLAST' && shieldStartedAt <= attack.impactAt && attack.impactAt < this.shieldUntil) {
      this.score += COMBAT.BLOCK_SCORE
      this.showFeedback(`BLOCKED  +${COMBAT.BLOCK_SCORE}`, 'shield', now)
      return
    }
    if (attack.type === 'SWEEP' && attack.defended) {
      this.score += COMBAT.DODGE_SCORE
      this.showFeedback(`DODGED  +${COMBAT.DODGE_SCORE}`, 'dodge', now)
      return
    }

    const damage = attack.type === 'ENERGY_BLAST' ? COMBAT.ENERGY_BLAST_DAMAGE : COMBAT.SWEEP_DAMAGE
    this.playerHp = Math.max(0, this.playerHp - damage)
    this.showFeedback(`HIT  −${damage} HP`, 'damage', now)
    if (this.playerHp === 0) {
      this.state = GAME_STATES.DEFEAT
      this.showFeedback('VEX DEFEATED', 'defeat', now)
    }
  }

  showFeedback(message, kind, now) {
    this.feedback = { message, kind, until: now + COMBAT.FEEDBACK_MS }
  }
}
