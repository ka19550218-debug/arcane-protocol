import test from 'node:test'
import assert from 'node:assert/strict'
import { CombatGame, COMBAT, GAME_STATES, detectCombo, COMBOS } from '../src/game/combat.js'
import { GESTURES } from '../src/gesture-engine.js'

test('a held fist fires once and requires release plus cooldown to repeat', () => {
  const game = new CombatGame()
  game.start(0)
  for (let now = 0; now <= 1200; now += 40) game.acceptGesture(GESTURES.FIST, now)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.PULSE_DAMAGE)
  assert.equal(game.score, COMBAT.PULSE_SCORE)

  game.acceptGesture(GESTURES.NONE, 1201)
  game.acceptGesture(GESTURES.FIST, 1202)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - 2 * COMBAT.PULSE_DAMAGE)

  game.acceptGesture(GESTURES.NONE, 1300)
  game.acceptGesture(GESTURES.FIST, 1301)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - 2 * COMBAT.PULSE_DAMAGE)
})

test('shield blocks an energy blast and correct swipe dodges the next sweep', () => {
  const game = new CombatGame()
  game.start(0)
  game.update(COMBAT.FIRST_ATTACK_DELAY_MS)
  assert.equal(game.attack.type, 'ENERGY_BLAST')
  game.acceptGesture(GESTURES.OPEN_PALM, 3200)
  game.update(4600)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.score, COMBAT.BLOCK_SCORE)
  assert.match(game.feedback.message, /BLOCKED/)

  game.update(7100)
  assert.equal(game.attack.type, 'SWEEP')
  assert.equal(game.attack.direction, GESTURES.SWIPE_LEFT)
  game.acceptGesture(GESTURES.SWIPE_LEFT, 7800)
  game.update(9400)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.score, COMBAT.BLOCK_SCORE + COMBAT.DODGE_SCORE)
  assert.match(game.feedback.message, /DODGED/)
})

test('wrong dodge takes damage, and a swipe cannot re-trigger a held fist', () => {
  const game = new CombatGame()
  game.start(0)
  game.acceptGesture(GESTURES.FIST, 0)
  game.acceptGesture(GESTURES.SWIPE_LEFT, 1000)
  game.acceptGesture(GESTURES.FIST, 1100)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.PULSE_DAMAGE)

  game.update(2800)
  game.update(4600)
  game.update(7100)
  game.acceptGesture(GESTURES.SWIPE_RIGHT, 7800)
  game.update(9400)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE - COMBAT.SWEEP_DAMAGE)
})

test('a shield raised after impact cannot block an overdue blast', () => {
  const game = new CombatGame()
  game.start(0)
  game.update(COMBAT.FIRST_ATTACK_DELAY_MS)
  game.acceptGesture(GESTURES.OPEN_PALM, 4700)
  game.update(4800)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE)
})

test('victory and defeat stop the encounter; restart resets it', () => {
  const game = new CombatGame()
  game.start(0)
  for (let shot = 0; shot < COMBAT.BOSS_HP / COMBAT.PULSE_DAMAGE; shot += 1) {
    game.acceptGesture(GESTURES.FIST, shot * 1000)
    game.acceptGesture(GESTURES.NONE, shot * 1000 + 100)
  }
  assert.equal(game.state, GAME_STATES.VICTORY)
  assert.equal(game.score, 15 * COMBAT.PULSE_SCORE + COMBAT.VICTORY_SCORE)
  game.update(100000)
  assert.equal(game.attack, null)

  game.start(100000)
  assert.equal(game.state, GAME_STATES.COMBAT)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.bossHp, COMBAT.BOSS_HP)
  assert.equal(game.score, 0)
  game.acceptGesture(GESTURES.FIST, 100001)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.PULSE_DAMAGE)

  for (let now = 103000; game.state === GAME_STATES.COMBAT; now += 10000) {
    game.beginAttack(now)
    game.update(game.attack.impactAt)
  }
  assert.equal(game.state, GAME_STATES.DEFEAT)
  assert.equal(game.playerHp, 0)
})

test('dual pulse takes priority over both individual fists and a held combo cannot repeat', () => {
  const game = new CombatGame()
  game.start(0)
  for (let now = 0; now <= 6000; now += 50) {
    game.acceptHands({ LEFT: GESTURES.FIST, RIGHT: GESTURES.FIST }, now)
  }
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.DUAL_PULSE_DAMAGE)
  assert.equal(game.score, COMBAT.DUAL_PULSE_SCORE)
  assert.match(game.feedback.message, /DUAL PULSE/)

  game.acceptHands({ LEFT: GESTURES.FIST, RIGHT: GESTURES.NONE }, 6001)
  game.acceptHands({ LEFT: GESTURES.FIST, RIGHT: GESTURES.FIST }, 6002)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - 2 * COMBAT.DUAL_PULSE_DAMAGE)
  assert.equal(game.score, 2 * COMBAT.DUAL_PULSE_SCORE)
})

test('overdrive works in either hand order, respects its cooldown, and suppresses single-hand actions', () => {
  assert.equal(detectCombo(GESTURES.FIST, GESTURES.OPEN_PALM), COMBOS.OVERDRIVE)
  assert.equal(detectCombo(GESTURES.OPEN_PALM, GESTURES.FIST), COMBOS.OVERDRIVE)
  const game = new CombatGame()
  game.start(0)
  game.acceptHands({ LEFT: GESTURES.FIST, RIGHT: GESTURES.OPEN_PALM }, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.OVERDRIVE_DAMAGE)
  assert.equal(game.score, COMBAT.OVERDRIVE_SCORE)
  assert.equal(game.shieldUntil, 0)
  game.acceptHands({ LEFT: GESTURES.NONE, RIGHT: GESTURES.NONE }, 100)
  game.acceptHands({ LEFT: GESTURES.OPEN_PALM, RIGHT: GESTURES.FIST }, 200)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.OVERDRIVE_DAMAGE)
  game.acceptHands({ LEFT: GESTURES.NONE, RIGHT: GESTURES.NONE }, 7100)
  game.acceptHands({ LEFT: GESTURES.OPEN_PALM, RIGHT: GESTURES.FIST }, 7101)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - 2 * COMBAT.OVERDRIVE_DAMAGE)
  assert.equal(game.score, 2 * COMBAT.OVERDRIVE_SCORE)
})

test('full barrier blocks an active sweep, rewards the block once, and respects cooldown', () => {
  const game = new CombatGame()
  game.start(0)
  game.attackCount = 1
  game.beginAttack(1000)
  game.acceptHands({ LEFT: GESTURES.OPEN_PALM, RIGHT: GESTURES.OPEN_PALM }, 1100)
  assert.equal(game.shieldUntil, 1100 + COMBAT.FULL_BARRIER_DURATION_MS)
  assert.equal(game.attack.defended, true)
  assert.equal(game.score, 0)
  game.update(game.attack.impactAt)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.score, COMBAT.FULL_BARRIER_BLOCK_SCORE)
  assert.match(game.feedback.message, /FULL BARRIER BLOCKED/)
  game.acceptHands({ LEFT: GESTURES.NONE, RIGHT: GESTURES.NONE }, 3400)
  game.acceptHands({ LEFT: GESTURES.OPEN_PALM, RIGHT: GESTURES.OPEN_PALM }, 3500)
  assert.equal(game.shieldUntil, 1100 + COMBAT.FULL_BARRIER_DURATION_MS)
})

test('one-hand actions still work when the other hand only points', () => {
  const game = new CombatGame()
  game.start(0)
  game.acceptHands({ LEFT: GESTURES.POINT, RIGHT: GESTURES.FIST }, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.PULSE_DAMAGE)
  game.acceptHands({ LEFT: GESTURES.POINT, RIGHT: GESTURES.NONE }, 100)
  game.acceptHands({ LEFT: GESTURES.POINT, RIGHT: GESTURES.OPEN_PALM }, 1000)
  assert.equal(game.shieldUntil, 1000 + COMBAT.SHIELD_DURATION_MS)
})
