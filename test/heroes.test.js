import test from 'node:test'
import assert from 'node:assert/strict'
import { CombatGame, COMBAT, GAME_STATES } from '../src/game/combat.js'
import { HEROES, NEX, AERIS } from '../src/game/heroes.js'
import { GESTURES as G } from '../src/gesture-engine.js'

const release = (game, now) => game.acceptHands({}, now)
const combo = (game, left, right, now) => game.acceptHands({ LEFT: left, RIGHT: right }, now)

test('EMP delays new attacks, expires, and never cancels an active attack', () => {
  const game = new CombatGame('NEX')
  game.start(0)
  game.acceptGesture(G.FIST, 2700)
  game.update(2800)
  assert.equal(game.attack, null)
  game.update(2700 + NEX.EMP_DISRUPT_MS)
  assert.equal(game.attack.type, 'ENERGY_BLAST')
  const impact = game.attack.impactAt
  combo(game, G.FIST, G.FIST, 4000)
  assert.equal(game.attack.impactAt, impact)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - NEX.EMP_DAMAGE - NEX.BURST_DAMAGE)
  game.update(impact)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE)
})

for (const attackCount of [0, 1]) {
  test(`NEX barrier blocks attack ${attackCount}; only a timed barrier reflects`, () => {
    for (const leadMs of [NEX.REFLECT_WINDOW_MS, NEX.REFLECT_WINDOW_MS + 1, -1]) {
      const game = new CombatGame('NEX')
      game.start(0)
      game.attackCount = attackCount
      game.beginAttack(2800)
      const impact = game.attack.impactAt
      game.acceptGesture(G.OPEN_PALM, impact - leadMs)
      game.update(impact + 2)
      assert.equal(game.stats.blocks, leadMs < 0 ? 0 : 1)
      assert.equal(game.bossHp, COMBAT.BOSS_HP - (leadMs === NEX.REFLECT_WINDOW_MS ? NEX.REFLECT_DAMAGE : 0))
      assert.equal(game.playerHp === COMBAT.PLAYER_HP, leadMs >= 0)
    }
  })
}

test('mirror matrix reflects once and can end the encounter without a later attack', () => {
  const game = new CombatGame('NEX')
  game.start(0)
  game.attackCount = 1
  game.beginAttack(2800)
  combo(game, G.OPEN_PALM, G.OPEN_PALM, 2900)
  game.bossHp = NEX.MATRIX_REFLECT_DAMAGE
  game.update(5100)
  assert.equal(game.state, GAME_STATES.VICTORY)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.stats.blocks, 1)
  const score = game.score
  game.update(50000)
  assert.equal(game.score, score)
  assert.equal(game.attack, null)
})

test('system hack deals damage and boosts attacks temporarily', () => {
  const game = new CombatGame('NEX')
  game.start(0)
  game.superEnergy = COMBAT.SUPER_MAX_ENERGY
  combo(game, G.FIST, G.OPEN_PALM, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - NEX.HACK_DAMAGE)
  release(game, 1)
  combo(game, G.FIST, G.FIST, 2)
  let expectedHp = COMBAT.BOSS_HP - NEX.HACK_DAMAGE - Math.round(NEX.BURST_DAMAGE * NEX.HACK_MULTIPLIER)
  assert.equal(game.bossHp, expectedHp)
  release(game, NEX.HACK_DURATION_MS - 1)
  combo(game, G.FIST, G.NONE, NEX.HACK_DURATION_MS)
  expectedHp -= NEX.EMP_DAMAGE
  assert.equal(game.bossHp, expectedHp)
  release(game, NEX.HACK_DURATION_MS + 1)
  combo(game, G.OPEN_PALM, G.FIST, NEX.HACK_DURATION_MS + 2)
  assert.equal(game.vulnerableUntil, NEX.HACK_DURATION_MS)
})

test('time freeze pauses the countdown across frames and resumes with its remaining time', () => {
  const game = new CombatGame('AERIS')
  game.start(0)
  game.update(2800)
  game.acceptGesture(G.OPEN_PALM, 3200)
  assert.equal(game.shieldUntil, 0)
  const remaining = game.attack.impactAt - 3200
  for (const now of [3400, 4000, 4600]) {
    game.update(now)
    assert.equal(game.attack.impactAt - now, remaining)
  }
  game.update(3200 + AERIS.FREEZE_DURATION_MS)
  assert.equal(game.attack.impactAt, 4600 + AERIS.FREEZE_DURATION_MS)
  game.update(game.attack.impactAt)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE)
  game.update(game.nextAttackAt)
  assert.equal(game.attack.type, 'SWEEP')
})

test('overlapping freeze and chrono lock pause only actual elapsed time, including long frame gaps', () => {
  const game = new CombatGame('AERIS')
  game.start(0)
  game.update(2800)
  combo(game, G.OPEN_PALM, G.NONE, 3000)
  combo(game, G.OPEN_PALM, G.OPEN_PALM, 3500)
  const frozenEnd = 3500 + AERIS.LOCK_DURATION_MS
  game.update(frozenEnd + 100)
  assert.equal(game.attack.impactAt, 4600 + frozenEnd - 3000)
  game.update(game.attack.impactAt)
  assert.equal(game.stats.blocks, 0)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE)
})

test('chrono lock pauses idle offensive activity; late freeze cannot rescue an overdue attack', () => {
  const game = new CombatGame('AERIS')
  game.start(0)
  combo(game, G.OPEN_PALM, G.OPEN_PALM, 2700)
  const end = 2700 + AERIS.LOCK_DURATION_MS
  game.update(end)
  assert.equal(game.attack, null)
  game.update(end + 100)
  assert.equal(game.attack.type, 'ENERGY_BLAST')
  const impact = game.attack.impactAt
  release(game, impact + 1)
  combo(game, G.OPEN_PALM, G.NONE, impact + 2)
  game.update(impact + 3)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP - COMBAT.ENERGY_BLAST_DAMAGE)
})

for (const hero of Object.values(HEROES)) {
  test(`${hero.id}: held actions and combos cannot repeat even after cooldown`, () => {
    for (const [left, right, key] of [
      [G.FIST, G.NONE, 'attack'], [G.OPEN_PALM, G.NONE, 'defense'],
      [G.FIST, G.FIST, 'dual'], [G.OPEN_PALM, G.OPEN_PALM, 'barrier'],
      [G.FIST, G.OPEN_PALM, 'ultimate'],
    ]) {
      const game = new CombatGame(hero.id)
      game.start(0)
      if (key === 'ultimate') game.superEnergy = COMBAT.SUPER_MAX_ENERGY
      combo(game, left, right, 0)
      const hp = game.bossHp
      const stats = { ...game.stats }
      const until = [game.frozenUntil, game.vulnerableUntil, game.shieldUntil]
      for (const now of [500, hero[key].cooldownMs + 1]) combo(game, left, right, now)
      assert.equal(game.bossHp, hp)
      assert.deepEqual(game.stats, stats)
      assert.deepEqual([game.frozenUntil, game.vulnerableUntil, game.shieldUntil], until)
      release(game, hero[key].cooldownMs + 2)
      if (key === 'ultimate') game.superEnergy = COMBAT.SUPER_MAX_ENERGY
      combo(game, left, right, hero[key].cooldownMs + 3)
      if (hero[key].damage) assert.ok(game.bossHp < hp)
      else assert.ok(game.frozenUntil > until[0] || game.vulnerableUntil > until[1] || game.shieldUntil > until[2])
    }
  })

  test(`${hero.id}: both swipe directions use the shared dodge and victory/defeat work`, () => {
    const game = new CombatGame(hero.id)
    for (const count of [1, 3]) {
      game.start(0)
      game.attackCount = count
      game.beginAttack(2800)
      game.acceptGesture(game.attack.direction, 3000)
      assert.match(game.feedback.message, new RegExp(hero.dodge))
      game.update(game.attack.impactAt)
      assert.equal(game.playerHp, COMBAT.PLAYER_HP)
      assert.equal(game.stats.dodges, 1)
    }
    game.start(0)
    game.bossHp = hero.ultimate.damage ?? hero.attack.damage
    game.superEnergy = COMBAT.SUPER_MAX_ENERGY
    if (hero.ultimate.damage) combo(game, G.FIST, G.OPEN_PALM, 0)
    else game.acceptGesture(G.FIST, 0)
    assert.equal(game.state, GAME_STATES.VICTORY)
    game.start(0)
    game.playerHp = 1
    game.update(2800)
    game.update(4600)
    assert.equal(game.state, GAME_STATES.DEFEAT)
    assert.match(game.feedback.message, new RegExp(hero.id))
  })
}

test('time collapse deals strong damage, freezes time, and requires recharge', () => {
  const game = new CombatGame('AERIS')
  game.start(0)
  game.superEnergy = COMBAT.SUPER_MAX_ENERGY
  combo(game, G.FIST, G.OPEN_PALM, 0)
  assert.equal(game.bossHp, COMBAT.BOSS_HP - AERIS.COLLAPSE_DAMAGE)
  assert.equal(game.feedback.kind, 'overdrive')
  assert.equal(game.frozenUntil, AERIS.COLLAPSE_FREEZE_MS)
  release(game, 1)
  combo(game, G.OPEN_PALM, G.FIST, AERIS.COLLAPSE_COOLDOWN_MS - 1)
  assert.equal(game.stats.combos, 1)
  release(game, AERIS.COLLAPSE_COOLDOWN_MS)
  game.superEnergy = COMBAT.SUPER_MAX_ENERGY
  combo(game, G.OPEN_PALM, G.FIST, AERIS.COLLAPSE_COOLDOWN_MS + 1)
  assert.equal(game.stats.combos, 2)
})

test('retry and hero changes clear all old effects, cooldowns, and gesture latches', () => {
  const game = new CombatGame()
  for (const heroId of ['NEX', 'AERIS', 'VEX', 'NEX']) {
    game.start(100, heroId)
    assert.equal(game.hero.id, heroId)
    for (const key of ['disruptedUntil', 'frozenUntil', 'vulnerableUntil', 'shieldUntil', 'fullBarrierUntil',
      'nextPulseAt', 'nextShieldAt', 'nextDualPulseAt', 'nextFullBarrierAt', 'nextOverdriveAt', 'nextDodgeAt']) {
      assert.equal(game[key], 0, key)
    }
    assert.equal(game.lastCombo, null)
    assert.equal(game.bossHp, COMBAT.BOSS_HP)
    assert.equal(game.playerHp, COMBAT.PLAYER_HP)
    assert.equal(game.score, 0)
    assert.equal(game.superEnergy, 0)
    game.superEnergy = COMBAT.SUPER_MAX_ENERGY
    combo(game, G.FIST, G.OPEN_PALM, 101)
    combo(game, G.OPEN_PALM, G.OPEN_PALM, 102)
    combo(game, G.FIST, G.FIST, 103)
    assert.equal(game.stats.combos, 3)
  }
})
