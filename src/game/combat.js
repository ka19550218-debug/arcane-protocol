import { GESTURES } from '../gesture-engine.js'
import { COMBAT } from './combat-settings.js'
import { getHero } from './heroes.js'

export { COMBAT } from './combat-settings.js'

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
  constructor(heroId = 'VEX') {
    this.reset(heroId)
  }

  reset(heroId = this.hero?.id ?? 'VEX') {
    this.hero = getHero(heroId)
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
    this.stats = { attacks: 0, blocks: 0, dodges: 0, combos: 0 }
    this.attack = null
    this.attackCount = 0
    this.disruptedUntil = 0
    this.vulnerableUntil = 0
    this.frozenUntil = 0
    this.freezeLabel = ''
    this.lastClockAt = 0
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

  start(now, heroId = this.hero.id) {
    this.reset(heroId)
    this.lastClockAt = now
    this.state = GAME_STATES.COMBAT
    this.nextAttackAt = now + COMBAT.FIRST_ATTACK_DELAY_MS
    this.showFeedback('ENGAGE THE WARDEN', 'neutral', now)
  }

  acceptHands(hands, now) {
    this.advanceClock(now)
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
    this.advanceClock(now)
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
    const slot = {
      [COMBOS.DUAL_PULSE]: ['dual', 'nextDualPulseAt', COMBAT.DUAL_PULSE_SCORE, 'dual-pulse'],
      [COMBOS.FULL_BARRIER]: ['barrier', 'nextFullBarrierAt', 0, 'shield'],
      [COMBOS.OVERDRIVE]: ['ultimate', 'nextOverdriveAt', COMBAT.OVERDRIVE_SCORE, 'overdrive'],
    }[combo]
    if (!slot) return
    const [key, cooldown, score, kind] = slot
    if (this.useAbility(this.hero[key], cooldown, score, kind, now)) this.stats.combos += 1
  }

  pulseShot(now) {
    this.useAbility(this.hero.attack, 'nextPulseAt', COMBAT.PULSE_SCORE, 'hit', now)
  }

  useAbility(ability, cooldown, score, kind, now) {
    if (this.state !== GAME_STATES.COMBAT) return false
    if (now < this[cooldown]) {
      this.showFeedback(`${ability.name} RECHARGING`, 'neutral', now)
      return false
    }
    this[cooldown] = now + ability.cooldownMs
    if (ability.effect === 'damage') {
      if (ability.disruptMs) this.disruptedUntil = Math.max(this.disruptedUntil, now + ability.disruptMs)
      this.damageBoss(ability.damage, score, ability.name, kind, now)
    } else if (ability.effect === 'shield' || ability.effect === 'barrier') {
      this.shieldStartedAt = now
      this.shieldUntil = Math.max(this.shieldUntil, now + ability.durationMs)
      if (ability.effect === 'barrier') {
        this.fullBarrierStartedAt = now
        this.fullBarrierUntil = now + ability.durationMs
        if (this.attack && now < this.attack.impactAt) this.attack.defended = true
      }
      this.showFeedback(`${ability.name} ACTIVE`, 'shield', now)
    } else if (ability.effect === 'hack') {
      this.vulnerableUntil = now + ability.durationMs
      this.showFeedback(`${ability.name} · DAMAGE ×${ability.multiplier}`, 'hack', now)
    } else if (ability.effect === 'freeze') {
      this.frozenUntil = Math.max(this.frozenUntil, now + ability.durationMs)
      this.freezeLabel = ability.name
      this.showFeedback(`${ability.name} ACTIVE`, 'freeze', now)
    }
    return true
  }

  // Move only offensive deadlines by the actual elapsed frozen time. Calling this
  // before input as well as frames prevents a new freeze from pausing past time.
  advanceClock(now) {
    if (this.state !== GAME_STATES.COMBAT || now <= this.lastClockAt) return
    const pausedMs = Math.max(0, Math.min(now, this.frozenUntil) - this.lastClockAt)
    if (this.attack && this.attack.impactAt > this.lastClockAt) this.attack.impactAt += pausedMs
    this.nextAttackAt += pausedMs
    this.lastClockAt = now
  }

  damageBoss(damage, score, label, kind, now) {
    if (now < this.vulnerableUntil) damage = Math.round(damage * this.hero.ultimate.multiplier)
    this.stats.attacks += 1
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
    this.useAbility(this.hero.defense, 'nextShieldAt', 0, 'shield', now)
  }

  dodge(gesture, now) {
    if (now < this.nextDodgeAt) return
    this.nextDodgeAt = now + COMBAT.DODGE_COOLDOWN_MS
    if (this.attack?.type !== 'SWEEP' || now >= this.attack.impactAt) {
      this.showFeedback(`${this.hero.dodge} ${gesture === GESTURES.SWIPE_LEFT ? 'LEFT' : 'RIGHT'}`, 'dodge', now)
      return
    }
    if (gesture === this.attack.direction) {
      this.attack.defended = true
      this.showFeedback(`${this.hero.dodge} LOCKED IN`, 'dodge', now)
    } else {
      this.showFeedback('WRONG DIRECTION — TRY AGAIN', 'danger', now)
    }
  }

  update(now) {
    if (this.state !== GAME_STATES.COMBAT) return
    this.advanceClock(now)

    if (this.attack && now >= this.attack.impactAt) {
      this.resolveAttack(now)
    }
    if (this.state === GAME_STATES.COMBAT && !this.attack && now >= this.nextAttackAt &&
      now >= this.disruptedUntil && now >= this.frozenUntil) {
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
      this.stats.blocks += 1
      this.score += COMBAT.FULL_BARRIER_BLOCK_SCORE
      this.blockFeedback(this.hero.barrier, attack, this.fullBarrierStartedAt, COMBAT.FULL_BARRIER_BLOCK_SCORE, now)
      return
    }
    if ((attack.type === 'ENERGY_BLAST' || this.hero.defense.blocksAll) && this.shieldStartedAt <= attack.impactAt && attack.impactAt < this.shieldUntil) {
      this.stats.blocks += 1
      this.score += COMBAT.BLOCK_SCORE
      this.blockFeedback(this.hero.defense, attack, this.shieldStartedAt, COMBAT.BLOCK_SCORE, now)
      return
    }
    if (attack.type === 'SWEEP' && attack.defended) {
      this.stats.dodges += 1
      this.score += COMBAT.DODGE_SCORE
      this.showFeedback(`DODGED  +${COMBAT.DODGE_SCORE}`, 'dodge', now)
      return
    }

    const damage = attack.type === 'ENERGY_BLAST' ? COMBAT.ENERGY_BLAST_DAMAGE : COMBAT.SWEEP_DAMAGE
    this.playerHp = Math.max(0, this.playerHp - damage)
    this.showFeedback(`HIT  −${damage} HP`, 'damage', now)
    if (this.playerHp === 0) {
      this.state = GAME_STATES.DEFEAT
      this.showFeedback(`${this.hero.id} DEFEATED`, 'defeat', now)
    }
  }

  blockFeedback(ability, attack, startedAt, blockScore, now) {
    const timed = ability.reflectWindowMs === undefined || attack.impactAt - startedAt <= ability.reflectWindowMs
    if (ability.reflectDamage && timed) {
      this.damageBoss(ability.reflectDamage, 0, `${ability.name} REFLECTED`, 'hit', now)
    } else {
      this.showFeedback(`${ability.name} BLOCKED  +${blockScore}`, 'shield', now)
    }
  }

  showFeedback(message, kind, now) {
    this.feedback = { message, kind, until: now + COMBAT.FEEDBACK_MS }
  }
}
