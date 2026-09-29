import { COMBAT } from './combat-settings.js'

const pattern = (label, type, warningMs, damage) => Object.freeze({ label, type, warningMs, damage })

export const ECHO_BOSS = Object.freeze({
  HP_MULTIPLIER: 1.35,
  HP: Math.round(COMBAT.BOSS_HP * 1.35),
  FIRST_ATTACK_DELAY_MS: 2600,
  BETWEEN_ATTACKS_MS: 2100,
  SYSTEM_PULSE_WARNING_MS: 1900,
  SYSTEM_PULSE_DAMAGE: 10,
  DATA_SWEEP_WARNING_MS: 2400,
  DATA_SWEEP_DAMAGE: 24,
  CORRUPTION_BURST_WARNING_MS: 2800,
  CORRUPTION_BURST_DAMAGE: 18,
})

export const BOSSES = Object.freeze({
  WARDEN: Object.freeze({
    id: 'WARDEN', name: 'THE WARDEN', hp: COMBAT.BOSS_HP, encounter: '01', cssClass: 'warden',
    firstAttackDelayMs: COMBAT.FIRST_ATTACK_DELAY_MS,
    betweenAttacksMs: COMBAT.BETWEEN_ATTACKS_MS,
    patterns: Object.freeze([
      pattern('ENERGY BLAST', 'ENERGY_BLAST', COMBAT.ENERGY_WARNING_MS, COMBAT.ENERGY_BLAST_DAMAGE),
      pattern('SWEEP ATTACK', 'SWEEP', COMBAT.SWEEP_WARNING_MS, COMBAT.SWEEP_DAMAGE),
    ]),
  }),
  ECHO: Object.freeze({
    id: 'ECHO', name: 'ECHO', hp: ECHO_BOSS.HP, encounter: '02', cssClass: 'echo',
    firstAttackDelayMs: ECHO_BOSS.FIRST_ATTACK_DELAY_MS,
    betweenAttacksMs: ECHO_BOSS.BETWEEN_ATTACKS_MS,
    patterns: Object.freeze([
      pattern('SYSTEM PULSE', 'ENERGY_BLAST', ECHO_BOSS.SYSTEM_PULSE_WARNING_MS, ECHO_BOSS.SYSTEM_PULSE_DAMAGE),
      pattern('DATA SWEEP', 'SWEEP', ECHO_BOSS.DATA_SWEEP_WARNING_MS, ECHO_BOSS.DATA_SWEEP_DAMAGE),
      pattern('CORRUPTION BURST', 'ENERGY_BLAST', ECHO_BOSS.CORRUPTION_BURST_WARNING_MS, ECHO_BOSS.CORRUPTION_BURST_DAMAGE),
    ]),
  }),
})

export function getBoss(id = 'WARDEN') {
  return BOSSES[id] ?? BOSSES.WARDEN
}
