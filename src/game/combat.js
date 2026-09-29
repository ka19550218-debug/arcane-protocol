import { GESTURES } from '../gesture-engine.js'

export const COMBAT = Object.freeze({
  PLAYER_HP: 100,
  BOSS_HP: 300,
  PULSE_DAMAGE: 20,
  DUAL_PULSE_DAMAGE: 45,
  OVERDRIVE_DAMAGE: 70,
  ENERGY_BLAST_DAMAGE: 22,
  SWEEP_DAMAGE: 25,
  PULSE_COOLDOWN_MS: 900,
  DUAL_PULSE_COOLDOWN_MS: 3000,
  FULL_BARRIER_COOLDOWN_MS: 5000,
  OVERDRIVE_COOLDOWN_MS: 7000,
  SHIELD_COOLDOWN_MS: 3200,
  SHIELD_DURATION_MS: 2200,
  FULL_BARRIER_DURATION_MS: 3500,
  DODGE_COOLDOWN_MS: 450,
  FIRST_ATTACK_DELAY_MS: 2800,
  BETWEEN_ATTACKS_MS: 2500,
  ENERGY_WARNING_MS: 1800,
  SWEEP_WARNING_MS: 2300,
  FEEDBACK_MS: 1200,
  PULSE_SCORE: 100,
  DUAL_PULSE_SCORE: 200,
  OVERDRIVE_SCORE: 350,
  FULL_BARRIER_BLOCK_SCORE: 250,
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

export const COMBOS = Object.freeze({
  DUAL_PULSE: 'DUAL_PULSE',
  FULL_BARRIER: 'FULL_BARRIER',
  OVERDRIVE: 'OVERDRIVE',
})

export function detectCombo(left, right) {
  if (left === GESTURES.FIST && right === GESTURES.FIST) return COMBOS.DUAL_PULSE
  if (left === GESTURES.OPEN_PALM && right === GESTURES.OPEN_PALM) return COMBOS.FULL_BARRIER
  if (
    (left === GESTURES.FIST && right === GESTURES.OPEN_PALM) ||
    (left === GESTURES.OPEN_PALM && right === GESTURES.FIST)
  ) return COMBOS.OVERDRIVE
  return null
}

export class CombatGame {
  constructor() {
    this.reset()
  }

  reset() {
    this.handInputs = Object.fromEntries(['SINGLE', 'LEFT', 'RIGHT'].map((side) => [side, {
      lastGesture: GESTURES.NONE,
      lastStaticAction: null,
      ignoreStaticAfterSwipe: false,
    }]))
    this.lastCombo = null
    this.state = GAME_STATES.READY
    this.playerHp = COMBAT.PLAYER_HP
    this.bossHp = COMBAT.BOSS_HP
    this.score = 0
    this.attack = null
    this.attackCount = 0
    this.nextAttackAt = Infinity
    this.nextPulseAt = 0
    this.nextDualPulseAt = 0
    this.nextFullBarrierAt = 0
    this.nextOverdriveAt = 0
    this.nextShieldAt = 0
    this.nextDodgeAt = 0
    this.shieldUntil = 0
    this.shieldStartedAt = 0
    this.fullBarrierUntil = 0
    this.fullBarrierStartedAt = 0
    this.feedback = { message: 'POINT at START COMBAT to begin', kind: 'neutral', until: Infinity }
  }

  start(now) {
    this.reset()
    this.state = GAME_STATES.COMBAT
    this.nextAttackAt = now + COMBAT.FIRST_ATTACK_DELAY_MS
    this.showFeedback('ENGAGE THE WARDEN', 'neutral', now)
  }

  acceptHands(hands, now) {
    const left = hands.LEFT ?? GESTURES.NONE
    const right = hands.RIGHT ?? GESTURES.NONE
    const combo = detectCombo(left, right)
    if (combo) {
      // Record both poses without firing their one-hand abilities.
      this.acceptGesture(left, now, 'LEFT', true)
      this.acceptGesture(right, now, 'RIGHT', true)
      if (combo !== this.lastCombo && this.state === GAME_STATES.COMBAT) this.activateCombo(combo, now)
      this.lastCombo = combo
      return
    }

    this.lastCombo = null
    const swipe = [left, right].some((gesture) =>
      gesture === GESTURES.SWIPE_LEFT || gesture === GESTURES.SWIPE_RIGHT)
    this.acceptGesture(left, now, 'LEFT', swipe && left !== GESTURES.SWIPE_LEFT && left !== GESTURES.SWIPE_RIGHT)
    this.acceptGesture(right, now, 'RIGHT', swipe && right !== GESTURES.SWIPE_LEFT && right !== GESTURES.SWIPE_RIGHT)
  }

  // A stable pose is one action per hand until that hand changes or releases it.
  acceptGesture(gesture, now, side = 'SINGLE', suppress = false) {
    const input = this.handInputs[side]
    if (gesture === input.lastGesture) return
    input.lastGesture = gesture
    if (this.state !== GAME_STATES.COMBAT) return

    if (gesture === GESTURES.NONE || gesture === GESTURES.POINT) {
      input.lastStaticAction = null
      input.ignoreStaticAfterSwipe = false
      return
    }
    if (gesture === GESTURES.SWIPE_LEFT || gesture === GESTURES.SWIPE_RIGHT) {
      input.ignoreStaticAfterSwipe = true
      if (!suppress) this.dodge(gesture, now)
      return
    }
    if (input.ignoreStaticAfterSwipe) {
      input.ignoreStaticAfterSwipe = false
      input.lastStaticAction = gesture
      return
    }
    if (gesture === input.lastStaticAction) return
    input.lastStaticAction = gesture
    if (suppress) return
    if (gesture === GESTURES.FIST) this.pulseShot(now)
    else if (gesture === GESTURES.OPEN_PALM) this.raiseShield(now)
  }

  activateCombo(combo, now) {
    if (combo === COMBOS.DUAL_PULSE) {
      if (now < this.nextDualPulseAt) return
      this.nextDualPulseAt = now + COMBAT.DUAL_PULSE_COOLDOWN_MS
      this.damageBoss(COMBAT.DUAL_PULSE_DAMAGE, COMBAT.DUAL_PULSE_SCORE, 'DUAL PULSE', 'dual-pulse', now)
    } else if (combo === COMBOS.FULL_BARRIER) {
      if (now < this.nextFullBarrierAt) return
      this.nextFullBarrierAt = now + COMBAT.FULL_BARRIER_COOLDOWN_MS
      this.fullBarrierStartedAt = now
      this.fullBarrierUntil = now + COMBAT.FULL_BARRIER_DURATION_MS
      this.shieldStartedAt = now
      this.shieldUntil = Math.max(this.shieldUntil, this.fullBarrierUntil)
      if (this.attack && now < this.attack.impactAt) this.attack.defended = true
      this.showFeedback('FULL BARRIER', 'shield', now)
    } else if (combo === COMBOS.OVERDRIVE) {
      if (now < this.nextOverdriveAt) return
      this.nextOverdriveAt = now + COMBAT.OVERDRIVE_COOLDOWN_MS
      this.damageBoss(COMBAT.OVERDRIVE_DAMAGE, COMBAT.OVERDRIVE_SCORE, 'OVERDRIVE', 'overdrive', now)
    }
  }

  pulseShot(now) {
    if (now < this.nextPulseAt) {
      this.showFeedback('PULSE SHOT RECHARGING', 'neutral', now)
      return
    }
    this.nextPulseAt = now + COMBAT.PULSE_COOLDOWN_MS
    this.damageBoss(COMBAT.PULSE_DAMAGE, COMBAT.PULSE_SCORE, 'PULSE SHOT', 'hit', now)
  }

  damageBoss(damage, score, label, kind, now) {
    this.bossHp = Math.max(0, this.bossHp - damage)
    this.score += score
    this.showFeedback(`${label}  −${damage}  +${score}`, kind, now)
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
    this.shieldStartedAt = now
    this.shieldUntil = Math.max(this.shieldUntil, now + COMBAT.SHIELD_DURATION_MS)
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

    if (this.fullBarrierStartedAt <= attack.impactAt && attack.impactAt < this.fullBarrierUntil) {
      this.score += COMBAT.FULL_BARRIER_BLOCK_SCORE
      this.showFeedback(`FULL BARRIER BLOCKED  +${COMBAT.FULL_BARRIER_BLOCK_SCORE}`, 'shield', now)
      return
    }
    if (attack.type === 'ENERGY_BLAST' && this.shieldStartedAt <= attack.impactAt && attack.impactAt < this.shieldUntil) {
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
