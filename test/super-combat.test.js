import test from 'node:test'
import assert from 'node:assert/strict'
import { CombatGame, COMBAT, GAME_STATES } from '../src/game/combat.js'
import { HEROES, NEX, AERIS } from '../src/game/heroes.js'
import { GESTURES as G } from '../src/gesture-engine.js'

function charge(game, start = 0) {
  for (let i = 0; i < 5; i += 1) {
    const now = start + i * game.hero.attack.cooldownMs
    game.acceptHands({}, now)
    game.acceptHands({ LEFT: G.FIST }, now)
    assert.equal(game.superEnergy, Math.min(100, (i + 1) * COMBAT.SUPER_ENERGY_PER_BASIC_ATTACK))
  }
  return start + 5 * game.hero.attack.cooldownMs
}

for (const hero of Object.values(HEROES)) {
  test(`${hero.id}: five successful basic attacks charge Super and V_SIGN uses its effect once`, () => {
    const game = new CombatGame(hero.id)
    game.start(0, hero.id, 'ECHO')
    assert.equal(game.superEnergy, 0)
    const now = charge(game)
    const hp = game.bossHp
    game.acceptHands({ LEFT: G.V_SIGN }, now)
    assert.equal(game.superEnergy, 0)
    assert.match(game.feedback.message, new RegExp(hero.ultimate.name))
    if (hero.id === 'NEX') {
      assert.equal(game.bossHp, hp - NEX.HACK_DAMAGE)
      assert.equal(game.vulnerableUntil, now + NEX.HACK_DURATION_MS)
      game.acceptHands({}, now + 1)
      game.acceptHands({ LEFT: G.FIST }, now + 2)
      assert.equal(game.bossHp, hp - NEX.HACK_DAMAGE - Math.round(NEX.EMP_DAMAGE * NEX.HACK_MULTIPLIER))
      assert.equal(game.superEnergy, 20)
    } else {
      assert.equal(game.bossHp, hp - hero.ultimate.damage)
      if (hero.id === 'AERIS') assert.equal(game.frozenUntil, now + AERIS.COLLAPSE_FREEZE_MS)
      game.superEnergy = 100 // Even a refilled meter cannot bypass the held-pose latch.
      game.acceptHands({ LEFT: G.V_SIGN }, now + 20000)
      assert.equal(game.superEnergy, 100)
      assert.equal(game.bossHp, hp - hero.ultimate.damage)
      game.acceptHands({}, now + 20001)
      game.acceptHands({ LEFT: G.V_SIGN }, now + 20002)
      assert.equal(game.superEnergy, 0)
      assert.equal(game.bossHp, hp - 2 * hero.ultimate.damage)
    }
    game.start(now + 30000, hero.id, 'ECHO')
    assert.equal(game.superEnergy, 0)
  })
}

test('held fists, cooldown failures, defenses, dodges, and combos do not grant energy', () => {
  const game = new CombatGame()
  game.start(0)
  game.acceptGesture(G.FIST, 0)
  game.acceptGesture(G.FIST, 2000)
  assert.equal(game.superEnergy, 20)
  game.acceptGesture(G.NONE, 2001)
  game.acceptGesture(G.FIST, 2002)
  game.acceptGesture(G.NONE, 2003)
  game.acceptGesture(G.FIST, 2004)
  assert.equal(game.superEnergy, 40)
  game.acceptGesture(G.OPEN_PALM, 2010)
  game.acceptGesture(G.SWIPE_LEFT, 2020)
  game.acceptHands({ LEFT: G.FIST, RIGHT: G.FIST }, 2030)
  game.acceptHands({ LEFT: G.OPEN_PALM, RIGHT: G.OPEN_PALM }, 2040)
  assert.equal(game.superEnergy, 40)
  game.superEnergy = 95
  game.acceptHands({}, 3000)
  game.acceptHands({ LEFT: G.FIST }, 3001)
  assert.equal(game.superEnergy, 100)
  game.acceptHands({}, 4000)
  game.acceptHands({ LEFT: G.FIST }, 4001)
  assert.equal(game.superEnergy, 100)
})

test('an uncharged correct V_SIGN gets neutral ability feedback, never fires later while held', () => {
  const game = new CombatGame()
  game.start(0)
  game.superEnergy = 72
  game.acceptGesture(G.V_SIGN, 0)
  assert.equal(game.feedback.message, 'SUPER NOT READY · 72%')
  assert.equal(game.feedback.kind, 'neutral')
  assert.equal(game.bossHp, COMBAT.BOSS_HP)
  game.superEnergy = 100
  game.acceptGesture(G.V_SIGN, 20000)
  assert.equal(game.superEnergy, 100)
  game.acceptGesture(G.NONE, 20001)
  game.acceptGesture(G.V_SIGN, 20002)
  assert.equal(game.superEnergy, 0)
})

test('two V signs activate once without overwriting feedback, and swiping a held V cannot repeat it', () => {
  const game = new CombatGame()
  game.start(0)
  game.superEnergy = 100
  game.acceptHands({ LEFT: G.V_SIGN, RIGHT: G.V_SIGN }, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.OVERDRIVE_DAMAGE)
  assert.match(game.feedback.message, /OVERDRIVE/)
  game.superEnergy = 100
  game.acceptHands({ RIGHT: G.V_SIGN }, 100)
  assert.equal(game.superEnergy, 100)
  game.acceptHands({ RIGHT: G.SWIPE_LEFT }, 1000)
  game.acceptHands({ RIGHT: G.V_SIGN }, 1001)
  assert.equal(game.superEnergy, 100)
  game.acceptHands({}, 1002)
  game.acceptHands({ RIGHT: G.V_SIGN }, 1003)
  assert.equal(game.superEnergy, 0)
})

test('mixed combo shares energy with V_SIGN and Super cannot fire outside combat', () => {
  const game = new CombatGame()
  game.start(0)
  game.acceptHands({ LEFT: G.FIST, RIGHT: G.OPEN_PALM }, 0)
  assert.equal(game.superEnergy, 0)
  assert.equal(game.stats.combos, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP)
  game.superEnergy = 100
  game.acceptHands({}, 1)
  game.acceptHands({ LEFT: G.FIST, RIGHT: G.OPEN_PALM }, 2)
  assert.equal(game.superEnergy, 0)
  assert.equal(game.stats.combos, 1)
  game.acceptHands({ LEFT: G.V_SIGN }, 3)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - COMBAT.OVERDRIVE_DAMAGE)
  game.stop()
  game.superEnergy = 100
  assert.equal(game.activateSuper(10), false)
  assert.equal(game.superEnergy, 100)
  assert.equal(game.state, GAME_STATES.READY)
})
