import test from 'node:test'
import assert from 'node:assert/strict'
import { CombatGame, COMBAT, GAME_STATES } from '../src/game/combat.js'
import { BOSSES, getBoss } from '../src/game/bosses.js'
import { HEROES, NEX, AERIS } from '../src/game/heroes.js'
import { GESTURES as G } from '../src/gesture-engine.js'

function echoGame(heroId = 'VEX') {
  const game = new CombatGame(heroId, 'ECHO')
  game.start(0, heroId, 'ECHO')
  return game
}

const hands = (game, left, right, now) => game.acceptHands({ LEFT: left, RIGHT: right }, now)

test('boss configuration preserves Warden and gives ECHO three forgiving patterns', () => {
  assert.equal(getBoss(), BOSSES.WARDEN)
  assert.equal(getBoss('unknown'), BOSSES.WARDEN)
  assert.equal(BOSSES.WARDEN.hp, COMBAT.BOSS_HP)
  assert.equal(BOSSES.WARDEN.firstAttackDelayMs, COMBAT.FIRST_ATTACK_DELAY_MS)
  assert.equal(BOSSES.WARDEN.betweenAttacksMs, COMBAT.BETWEEN_ATTACKS_MS)
  assert.ok(BOSSES.ECHO.hp > BOSSES.WARDEN.hp)
  assert.ok(BOSSES.ECHO.betweenAttacksMs < BOSSES.WARDEN.betweenAttacksMs)
  assert.equal(BOSSES.ECHO.patterns.length, 3)
  for (const pattern of BOSSES.ECHO.patterns) {
    assert.ok(pattern.warningMs >= (pattern.type === 'SWEEP' ? COMBAT.SWEEP_WARNING_MS : COMBAT.ENERGY_WARNING_MS))
  }
  assert.ok(BOSSES.ECHO.patterns[2].damage > BOSSES.ECHO.patterns[0].damage)
  assert.ok(BOSSES.ECHO.patterns[2].warningMs > BOSSES.ECHO.patterns[0].warningMs)

  const game = echoGame()
  assert.equal(game.bossHp, BOSSES.ECHO.hp)
  assert.match(game.feedback.message, /ENGAGE ECHO/)
  game.update(BOSSES.ECHO.firstAttackDelayMs - 1)
  assert.equal(game.attack, null)
  game.update(BOSSES.ECHO.firstAttackDelayMs)
  assert.equal(game.attack.label, 'SYSTEM PULSE')
})

test('ECHO cycles its three attacks and alternates both DATA SWEEP directions', () => {
  const game = echoGame()
  let now = game.nextAttackAt
  const sequence = []
  for (let index = 0; index < 6; index += 1) {
    game.update(now)
    sequence.push([game.attack.label, game.attack.direction])
    if (game.attack.type === 'SWEEP') game.acceptGesture(game.attack.direction, now + 500)
    else game.acceptGesture(G.OPEN_PALM, game.attack.impactAt - 1000)
    now = game.attack.impactAt
    game.update(now)
    game.acceptGesture(G.NONE, now + 1)
    assert.equal(game.nextAttackAt, now + BOSSES.ECHO.betweenAttacksMs)
    now = game.nextAttackAt
  }
  assert.deepEqual(sequence, [
    ['SYSTEM PULSE', null], ['DATA SWEEP', G.SWIPE_LEFT], ['CORRUPTION BURST', null],
    ['SYSTEM PULSE', null], ['DATA SWEEP', G.SWIPE_RIGHT], ['CORRUPTION BURST', null],
  ])
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.stats.blocks, 4)
  assert.equal(game.stats.dodges, 2)
})

test('corruption burst uses the shared shield timing, damage, and barrier rules', () => {
  for (const lead of [1000, 2800, -1]) {
    const game = echoGame()
    game.attackCount = 2
    game.beginAttack(1000)
    const impact = game.attack.impactAt
    game.acceptGesture(G.OPEN_PALM, impact - lead)
    game.update(impact + 2)
    assert.equal(game.playerHp, COMBAT.PLAYER_HP - (lead === 1000 ? 0 : BOSSES.ECHO.patterns[2].damage))
    assert.equal(game.stats.blocks, lead === 1000 ? 1 : 0)
  }
  const game = echoGame()
  game.attackCount = 2
  game.beginAttack(1000)
  hands(game, G.OPEN_PALM, G.OPEN_PALM, 1001)
  game.update(game.attack.impactAt)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.score, COMBAT.FULL_BARRIER_BLOCK_SCORE)
})

for (const hero of Object.values(HEROES)) {
  test(`${hero.id} retains damage abilities, unique ultimate, and combo priority against ECHO`, () => {
    const game = echoGame(hero.id)
    hands(game, G.FIST, G.NONE, 0)
    hands(game, G.NONE, G.NONE, 1)
    hands(game, G.FIST, G.FIST, 2)
    const damage = hero.attack.damage + hero.dual.damage
    assert.equal(game.bossHp, BOSSES.ECHO.hp - damage)
    assert.equal(game.stats.attacks, 2)
    hands(game, G.NONE, G.NONE, 3)
    game.superEnergy = COMBAT.SUPER_MAX_ENERGY
    hands(game, G.FIST, G.OPEN_PALM, 4)
    if (hero.ultimate.effect === 'damage') {
      assert.equal(game.bossHp, BOSSES.ECHO.hp - damage - hero.ultimate.damage)
    } else {
      assert.equal(game.bossHp, BOSSES.ECHO.hp - damage - NEX.HACK_DAMAGE)
      assert.equal(game.vulnerableUntil, 4 + NEX.HACK_DURATION_MS)
      hands(game, G.NONE, G.NONE, 1200)
      hands(game, G.FIST, G.NONE, 1201)
      assert.equal(game.bossHp, BOSSES.ECHO.hp - damage - NEX.HACK_DAMAGE - Math.round(NEX.EMP_DAMAGE * NEX.HACK_MULTIPLIER))
    }
    assert.equal(game.stats.combos, 2)
  })

  test(`${hero.id} can correct a wrong ECHO sweep and dodge in either direction`, () => {
    for (const index of [1, 4]) {
      const game = echoGame(hero.id)
      game.attackCount = index
      game.beginAttack(1000)
      const direction = game.attack.direction
      game.acceptGesture(direction === G.SWIPE_LEFT ? G.SWIPE_RIGHT : G.SWIPE_LEFT, 1100)
      assert.equal(game.attack.defended, false)
      game.acceptGesture(direction, 1100 + COMBAT.DODGE_COOLDOWN_MS)
      game.update(game.attack.impactAt)
      assert.equal(game.playerHp, COMBAT.PLAYER_HP)
      assert.equal(game.stats.dodges, 1)
    }
  })
}

test('NEX disruption delays ECHO, and reflect and mirror matrix still counter every attack', () => {
  const disrupted = echoGame('NEX')
  disrupted.acceptGesture(G.FIST, 2500)
  disrupted.update(BOSSES.ECHO.firstAttackDelayMs)
  assert.equal(disrupted.attack, null)
  disrupted.update(2500 + NEX.EMP_DISRUPT_MS)
  assert.equal(disrupted.attack.label, 'SYSTEM PULSE')

  for (const index of [0, 1, 2]) {
    for (const matrix of [false, true]) {
      const game = echoGame('NEX')
      game.attackCount = index
      game.beginAttack(1000)
      const impact = game.attack.impactAt
      hands(game, G.OPEN_PALM, matrix ? G.OPEN_PALM : G.NONE, impact - 500)
      game.update(impact)
      assert.equal(game.playerHp, COMBAT.PLAYER_HP)
      assert.equal(game.bossHp, BOSSES.ECHO.hp - (matrix ? NEX.MATRIX_REFLECT_DAMAGE : NEX.REFLECT_DAMAGE))
      assert.equal(game.stats.blocks, 1)
    }
  }
})

test('AERIS freeze and chrono lock pause ECHO but do not turn into shields', () => {
  for (const lock of [false, true]) {
    const game = echoGame('AERIS')
    game.attackCount = 2
    game.beginAttack(1000)
    const impact = game.attack.impactAt
    hands(game, G.OPEN_PALM, lock ? G.OPEN_PALM : G.NONE, 1500)
    const duration = lock ? AERIS.LOCK_DURATION_MS : AERIS.FREEZE_DURATION_MS
    game.update(1500 + duration)
    assert.equal(game.attack.impactAt, impact + duration)
    assert.equal(game.shieldUntil, 0)
    assert.equal(game.fullBarrierUntil, 0)
    game.update(game.attack.impactAt)
    assert.equal(game.playerHp, COMBAT.PLAYER_HP - BOSSES.ECHO.patterns[2].damage)
    assert.equal(game.stats.blocks, 0)
  }
})

test('stop is idempotent, preserves earned results, and prevents post-combat actions', () => {
  const game = echoGame('NEX')
  hands(game, G.FIST, G.FIST, 1)
  hands(game, G.FIST, G.OPEN_PALM, 2)
  hands(game, G.OPEN_PALM, G.OPEN_PALM, 3)
  game.beginAttack(3000)
  const earned = { score: game.score, stats: { ...game.stats }, hp: game.bossHp }
  game.stop()
  game.stop()
  assert.equal(game.state, GAME_STATES.READY)
  game.update(50000)
  game.beginAttack(50000)
  game.pulseShot(50000)
  game.damageBoss(100, 100, 'LATE HIT', 'hit', 50000)
  assert.equal(game.attack, null)
  assert.equal(game.nextAttackAt, Infinity)
  assert.equal(game.disruptedUntil, 0)
  assert.equal(game.vulnerableUntil, 0)
  assert.equal(game.shieldUntil, 0)
  assert.equal(game.fullBarrierUntil, 0)
  assert.deepEqual({ score: game.score, stats: game.stats, hp: game.bossHp }, earned)
})

test('ECHO victory and defeat keep final states but clear attacks, deadlines, and effects', () => {
  for (const victory of [true, false]) {
    const game = echoGame('AERIS')
    game.beginAttack(1000)
    hands(game, G.OPEN_PALM, G.OPEN_PALM, 1100)
    if (victory) {
      game.bossHp = 1
      game.superEnergy = COMBAT.SUPER_MAX_ENERGY
      hands(game, G.FIST, G.OPEN_PALM, 1200)
    } else {
      game.playerHp = 1
      game.update(10000)
    }
    assert.equal(game.state, victory ? GAME_STATES.VICTORY : GAME_STATES.DEFEAT)
    assert.equal(game.attack, null)
    assert.equal(game.nextAttackAt, Infinity)
    assert.equal(game.frozenUntil, 0)
    assert.match(game.feedback.message, victory ? /ECHO DEFEATED/ : /AERIS DEFEATED/)
    const score = game.score
    game.stop()
    game.update(100000)
    assert.equal(game.state, victory ? GAME_STATES.VICTORY : GAME_STATES.DEFEAT)
    assert.equal(game.score, score)
  }
})

test('retrying ECHO resets battle-local scores, health, effects, and held gesture latches', () => {
  const game = echoGame('AERIS')
  hands(game, G.FIST, G.FIST, 0)
  hands(game, G.OPEN_PALM, G.OPEN_PALM, 1)
  game.playerHp = 1
  game.stop()
  game.start(10000, 'AERIS', 'ECHO')
  assert.equal(game.boss, BOSSES.ECHO)
  assert.equal(game.playerHp, COMBAT.PLAYER_HP)
  assert.equal(game.bossHp, BOSSES.ECHO.hp)
  assert.equal(game.score, 0)
  assert.deepEqual(game.stats, { attacks: 0, blocks: 0, dodges: 0, combos: 0 })
  assert.equal(game.attackCount, 0)
  assert.equal(game.lastCombo, null)
  assert.equal(game.frozenUntil, 0)
  hands(game, G.FIST, G.FIST, 10001)
  assert.equal(game.bossHp, BOSSES.ECHO.hp - AERIS.BURST_DAMAGE)
  game.start(20000)
  assert.equal(game.boss, BOSSES.WARDEN)
  assert.equal(game.bossHp, COMBAT.BOSS_HP)
})

// A reproducible balance smoke check: hold each pose for 600 ms, release, then
// react/attack once per 1.2–1.5 seconds. It approximates gesture cadence, not a
// physical webcam test. Defense takes priority; use Super when charged,
// dual attacks when ready, and basic attacks to rebuild energy.
function playEcho(heroId, cadenceMs) {
  const game = echoGame(heroId)
  let nextActionAt = 500
  let releaseAt = Infinity
  let now = 0
  for (; now < 120000 && game.state === GAME_STATES.COMBAT; now += 50) {
    game.update(now)
    if (now >= releaseAt) {
      game.acceptHands({}, now)
      releaseAt = Infinity
    }
    if (now < nextActionAt || game.state !== GAME_STATES.COMBAT) continue
    const attack = game.attack
    let pose
    if (attack?.type === 'SWEEP' && !attack.defended) {
      pose = { LEFT: attack.direction }
    } else if (heroId === 'AERIS' && attack?.type === 'ENERGY_BLAST' && now >= game.frozenUntil && now >= game.nextShieldAt) {
      pose = { LEFT: G.OPEN_PALM }
    } else if (heroId === 'AERIS' && attack?.type === 'ENERGY_BLAST' && now >= game.frozenUntil && now >= game.nextFullBarrierAt) {
      pose = { LEFT: G.OPEN_PALM, RIGHT: G.OPEN_PALM }
    } else if (heroId !== 'AERIS' && attack?.type === 'ENERGY_BLAST' && attack.impactAt - now < 2200 && game.shieldUntil <= attack.impactAt && now >= game.nextShieldAt) {
      pose = { LEFT: G.OPEN_PALM }
    } else if (game.superEnergy === COMBAT.SUPER_MAX_ENERGY) {
      pose = { LEFT: G.FIST, RIGHT: G.OPEN_PALM }
    } else if (now >= game.nextDualPulseAt) {
      pose = { LEFT: G.FIST, RIGHT: G.FIST }
    } else {
      pose = { LEFT: G.FIST }
    }
    game.acceptHands(pose, now)
    nextActionAt = now + cadenceMs
    releaseAt = now + 600
  }
  return { game, durationMs: now }
}

for (const heroId of Object.keys(HEROES)) {
  test(`${heroId} can clear ECHO in roughly 1–2 minutes with released gestures and defense`, () => {
    for (const cadenceMs of [1200, 1500]) {
      const { game, durationMs } = playEcho(heroId, cadenceMs)
      assert.equal(game.state, GAME_STATES.VICTORY, `${cadenceMs}ms: ${game.bossHp} HP remaining`)
      assert.ok(durationMs >= 60000 && durationMs <= 120000, `${cadenceMs}ms cadence: ${durationMs}ms battle`)
      assert.ok(game.stats.combos > 0)
      assert.ok(game.stats.dodges > 0)
      assert.ok(game.playerHp > 0)
    }
  })
}
