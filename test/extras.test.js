import test from 'node:test'
import assert from 'node:assert/strict'
import { APP_STATES, GameFlow } from '../src/game-flow.js'
import { CombatGame } from '../src/game/combat.js'
import { LEADERBOARD_KEY, readRecords, saveRecord } from '../src/leaderboard.js'

class FlowHarness extends GameFlow { render() {} }

function withStorage(run) {
  const previous = globalThis.localStorage
  const data = new Map()
  globalThis.localStorage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  }
  try { run(data) } finally { globalThis.localStorage = previous }
}

test('Boss Rush reuses both combat states, cumulative score, automatic transition and clean retry', () => {
  withStorage(() => {
    const flow = new FlowHarness({ stage: {} })
    flow.calibrationComplete = true
    flow.setState(APP_STATES.MENU)
    flow.select('BOSS_RUSH')
    assert.equal(flow.state, APP_STATES.HERO_SELECT)
    flow.select('SELECT_NEX')
    assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
    flow.showResult('VICTORY', 1200)
    assert.equal(flow.state, APP_STATES.RUSH_TRANSITION)
    flow.update(flow.pendingTransition.at - 1)
    assert.equal(flow.state, APP_STATES.RUSH_TRANSITION)
    flow.update(flow.pendingTransition.at)
    assert.equal(flow.state, APP_STATES.ECHO_COMBAT)
    assert.equal(flow.scoreBeforeBattle, 1200)
    flow.showResult('VICTORY', 800)
    assert.equal(flow.state, APP_STATES.RUSH_RESULT)
    assert.equal(flow.result.score, 2000)
    assert.deepEqual(readRecords().map((record) => [record.mode, record.score]), [['BOSS RUSH', 2000]])
    flow.showResult('VICTORY', 800)
    assert.equal(readRecords().length, 1)
    flow.select('RETRY_RUSH')
    assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
    assert.equal(flow.scoreBeforeBattle, 0)
  })
})

test('defeat saves only when leaving the run; leaderboard keeps the best ten', () => {
  withStorage((data) => {
    const flow = new FlowHarness({ stage: {} })
    flow.setState(APP_STATES.MENU)
    flow.select('BOSS_RUSH')
    flow.select('SELECT_VEX')
    flow.showResult('DEFEAT', 300)
    assert.equal(readRecords().length, 0)
    flow.select('MAIN_MENU')
    assert.equal(readRecords().length, 1)
    for (let score = 0; score < 12; score += 1) saveRecord({ score, hero: 'VEX', mode: 'STORY', result: 'VICTORY' })
    assert.equal(readRecords().length, 10)
    assert.equal(readRecords()[0].score, 300)
    assert.ok(data.has(LEADERBOARD_KEY))
  })
})

test('Story victory saves once after ECHO and not at the Warden checkpoint', () => {
  withStorage(() => {
    const flow = new FlowHarness({ stage: {} })
    flow.setState(APP_STATES.WARDEN_COMBAT)
    flow.showResult('VICTORY', 1000)
    assert.equal(readRecords().length, 0)
    flow.setState(APP_STATES.ECHO_COMBAT)
    flow.showResult('VICTORY', 600)
    assert.deepEqual(readRecords().map((record) => [record.mode, record.score]), [['STORY', 1600]])
    flow.select('MAIN_MENU') // Restoration does not accept a premature menu action.
    assert.equal(readRecords().length, 1)
  })
})

test('Super ready audio fires once on crossing 100 and activation remains one event', () => {
  const game = new CombatGame()
  const cues = []
  game.onAudio = (cue) => cues.push(cue)
  game.start(0)
  for (let i = 0; i < 6; i += 1) game.pulseShot(i * 1000)
  assert.equal(cues.filter((cue) => cue === 'superReady').length, 1)
  game.activateSuper(6000)
  game.activateSuper(6001)
  assert.equal(cues.filter((cue) => cue === 'super').length, 1)
})
