import { COMBAT } from './combat-settings.js'

const pattern = (label, type, warningMs, damage) => Object.freeze({ label, type, warningMs, damage })

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
    // Allow a minute of released attacks and defense gestures. Energy hits are
    // survivable for AERIS, whose time controls delay attacks rather than block.
    id: 'ECHO', name: 'ECHO', hp: 1500, encounter: '02', cssClass: 'echo',
    firstAttackDelayMs: 2600,
    betweenAttacksMs: 2100,
    patterns: Object.freeze([
      pattern('SYSTEM PULSE', 'ENERGY_BLAST', 1900, 10),
      pattern('DATA SWEEP', 'SWEEP', 2400, 24),
      pattern('CORRUPTION BURST', 'ENERGY_BLAST', 2800, 18),
    ]),
  }),
})

export function getBoss(id = 'WARDEN') {
  return BOSSES[id] ?? BOSSES.WARDEN
}
