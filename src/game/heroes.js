import { COMBAT } from './combat-settings.js'

export const NEX = Object.freeze({
  EMP_DAMAGE: 16, EMP_COOLDOWN_MS: 1100, EMP_DISRUPT_MS: 900,
  BURST_DAMAGE: 36, BURST_COOLDOWN_MS: 3400, BURST_DISRUPT_MS: 1800,
  BARRIER_DURATION_MS: 2200, BARRIER_COOLDOWN_MS: 3200,
  REFLECT_WINDOW_MS: 650, REFLECT_DAMAGE: 18,
  MATRIX_DURATION_MS: 3500, MATRIX_COOLDOWN_MS: 5500, MATRIX_REFLECT_DAMAGE: 24,
  HACK_DURATION_MS: 4500, HACK_COOLDOWN_MS: 8000, HACK_MULTIPLIER: 1.75,
  HACK_DAMAGE: 30,
})

export const AERIS = Object.freeze({
  BOLT_DAMAGE: 20, BOLT_COOLDOWN_MS: 900,
  FREEZE_DURATION_MS: 1500, FREEZE_COOLDOWN_MS: 4500,
  BURST_DAMAGE: 42, BURST_COOLDOWN_MS: 3200,
  LOCK_DURATION_MS: 2800, LOCK_COOLDOWN_MS: 6500,
  COLLAPSE_DAMAGE: 85, COLLAPSE_COOLDOWN_MS: 10000,
  COLLAPSE_FREEZE_MS: 1500,
})

const ability = (name, effect, cooldownMs, options = {}) => Object.freeze({ name, effect, cooldownMs, ...options })

export const HEROES = Object.freeze({
  VEX: Object.freeze({
    id: 'VEX', role: 'ASSAULT', description: 'Direct damage / shields / dodge',
    attack: ability('PULSE SHOT', 'damage', COMBAT.PULSE_COOLDOWN_MS, { damage: COMBAT.PULSE_DAMAGE }),
    defense: ability('ENERGY SHIELD', 'shield', COMBAT.SHIELD_COOLDOWN_MS, { durationMs: COMBAT.SHIELD_DURATION_MS }),
    dodge: 'DODGE',
    dual: ability('DUAL PULSE', 'damage', COMBAT.DUAL_PULSE_COOLDOWN_MS, { damage: COMBAT.DUAL_PULSE_DAMAGE }),
    barrier: ability('FULL BARRIER', 'barrier', COMBAT.FULL_BARRIER_COOLDOWN_MS, { durationMs: COMBAT.FULL_BARRIER_DURATION_MS }),
    ultimate: ability('OVERDRIVE', 'damage', COMBAT.OVERDRIVE_COOLDOWN_MS, { damage: COMBAT.OVERDRIVE_DAMAGE }),
  }),
  NEX: Object.freeze({
    id: 'NEX', role: 'HACKER', description: 'Disruption / reflection / hacking',
    attack: ability('EMP BLAST', 'damage', NEX.EMP_COOLDOWN_MS, { damage: NEX.EMP_DAMAGE, disruptMs: NEX.EMP_DISRUPT_MS }),
    defense: ability('REFLECT BARRIER', 'shield', NEX.BARRIER_COOLDOWN_MS, {
      durationMs: NEX.BARRIER_DURATION_MS, blocksAll: true, reflectDamage: NEX.REFLECT_DAMAGE, reflectWindowMs: NEX.REFLECT_WINDOW_MS,
    }),
    dodge: 'PHASE SHIFT',
    dual: ability('EMP BURST', 'damage', NEX.BURST_COOLDOWN_MS, { damage: NEX.BURST_DAMAGE, disruptMs: NEX.BURST_DISRUPT_MS }),
    barrier: ability('MIRROR MATRIX', 'barrier', NEX.MATRIX_COOLDOWN_MS, { durationMs: NEX.MATRIX_DURATION_MS, reflectDamage: NEX.MATRIX_REFLECT_DAMAGE }),
    ultimate: ability('SYSTEM HACK', 'hack', NEX.HACK_COOLDOWN_MS, { damage: NEX.HACK_DAMAGE, durationMs: NEX.HACK_DURATION_MS, multiplier: NEX.HACK_MULTIPLIER }),
  }),
  AERIS: Object.freeze({
    id: 'AERIS', role: 'CHRONOMANCER', description: 'Time freeze / control / burst damage',
    attack: ability('CHRONO BOLT', 'damage', AERIS.BOLT_COOLDOWN_MS, { damage: AERIS.BOLT_DAMAGE }),
    defense: ability('TIME FREEZE', 'freeze', AERIS.FREEZE_COOLDOWN_MS, { durationMs: AERIS.FREEZE_DURATION_MS }),
    dodge: 'TIME SHIFT',
    dual: ability('TIME BURST', 'damage', AERIS.BURST_COOLDOWN_MS, { damage: AERIS.BURST_DAMAGE }),
    barrier: ability('CHRONO LOCK', 'freeze', AERIS.LOCK_COOLDOWN_MS, { durationMs: AERIS.LOCK_DURATION_MS }),
    ultimate: ability('TIME COLLAPSE', 'damage', AERIS.COLLAPSE_COOLDOWN_MS, { damage: AERIS.COLLAPSE_DAMAGE, freezeMs: AERIS.COLLAPSE_FREEZE_MS }),
  }),
})

export function getHero(id = 'VEX') {
  return HEROES[id] ?? HEROES.VEX
}

export function abilityLegend(hero) {
  return [
    ['✊ FIST · BASIC ATTACK', hero.attack.name], ['✋ OPEN PALM · DEFENSE', hero.defense.name],
    ['↔ SWIPE · DODGE', hero.dodge], ['✌️ V SIGN · SUPER', hero.ultimate.name],
    ['2 FISTS', hero.dual.name], ['2 PALMS', hero.barrier.name], ['FIST + PALM · SUPER', `${hero.ultimate.name} · 100% ENERGY`],
  ]
}
