import test from 'node:test'
import assert from 'node:assert/strict'
import { GameFlow, APP_STATES } from '../src/game-flow.js'
import { GESTURES } from '../src/gesture-engine.js'

// Exercise the flow with engine-shaped input, independently of DOM presentation.
class FlowHarness extends GameFlow {
  render() {}
}

function createFlow() {
  return new FlowHarness({ stage: { querySelector: () => null } })
}

function hand(gesture, rawGesture = gesture) {
  return { gesture, debug: { rawGesture }, landmarks: gesture === GESTURES.NONE ? null : [{}],
    feedback: { quality: 65, state: 'correcting' } }
}

function hands(left, right = GESTURES.NONE) {
  return { LEFT: hand(left), RIGHT: hand(right) }
}

function hold(flow, gesture, start, side = 'LEFT') {
  for (let timestamp = start; timestamp <= start + 600; timestamp += 50) {
    flow.handleHands(side === 'LEFT' ? hands(gesture) : hands(GESTURES.NONE, gesture), timestamp)
  }
}

function beginCalibration(flow) {
  flow.setCameraStatus('online', 'CAMERA ONLINE')
  flow.setTrackingReady()
  flow.select('ENTER_CAMERA')
  flow.select('BEGIN_CALIBRATION')
}

test('camera readiness and screen guards prevent bypassing required steps', () => {
  const flow = createFlow()
  flow.select('RETRY')
  flow.select('SELECT_VEX')
  assert.equal(flow.state, APP_STATES.INTRO)
  flow.select('ENTER_CAMERA')
  flow.select('BEGIN_CALIBRATION')
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setTrackingReady()
  flow.select('BEGIN_CALIBRATION')
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setCameraStatus('online', 'CAMERA ONLINE')
  flow.select('BEGIN_CALIBRATION')
  flow.select('CALIBRATION_CONTINUE')
  assert.equal(flow.state, APP_STATES.CALIBRATION)
})

test('calibration accepts reliable base poses below perfect quality in the required order', () => {
  const flow = createFlow()
  beginCalibration(flow)
  hold(flow, GESTURES.FIST, 0)
  assert.equal(flow.calibrationStep, 0)
  hold(flow, GESTURES.OPEN_PALM, 700)
  assert.equal(flow.calibrationStep, 1)
  hold(flow, GESTURES.FIST, 1400, 'RIGHT')
  assert.equal(flow.calibrationStep, 2)
  hold(flow, GESTURES.POINT, 2100)
  assert.equal(flow.calibrationComplete, true)
  assert.equal(flow.state, APP_STATES.CALIBRATION)
  flow.select('CALIBRATION_CONTINUE')
  assert.equal(flow.state, APP_STATES.TUTORIAL)
})

test('calibration rejects stale output, sample gaps, hand swaps, and interrupted holds', () => {
  const flow = createFlow()
  beginCalibration(flow)
  for (let timestamp = 0; timestamp <= 600; timestamp += 50) {
    flow.handleHands({ LEFT: hand(GESTURES.OPEN_PALM, GESTURES.NONE) }, timestamp)
  }
  assert.equal(flow.calibrationStep, 0)
  flow.handleHands(hands(GESTURES.OPEN_PALM), 700)
  flow.handleHands(hands(GESTURES.OPEN_PALM), 1400)
  assert.equal(flow.calibrationStep, 0)
  flow.handleHands(hands(GESTURES.NONE, GESTURES.OPEN_PALM), 1500)
  assert.equal(flow.calibrationHoldStartedAt, 1500)
  flow.handleHands(hands(GESTURES.NONE), 1550)
  assert.equal(flow.calibrationHoldStartedAt, null)
  hold(flow, GESTURES.OPEN_PALM, 1600)
  assert.equal(flow.calibrationStep, 1)
})

test('tutorial requires all core actions and does not credit combos as single-hand practice', () => {
  const flow = createFlow()
  flow.setState(APP_STATES.TUTORIAL)
  flow.handleHands(hands(GESTURES.FIST, GESTURES.OPEN_PALM), 0)
  flow.handleHands(hands(GESTURES.FIST, GESTURES.FIST), 50)
  flow.handleHands(hands(GESTURES.OPEN_PALM, GESTURES.OPEN_PALM), 100)
  assert.equal(flow.tutorialComplete.size, 0)
  flow.handleHands(hands(GESTURES.FIST), 150)
  flow.handleHands(hands(GESTURES.OPEN_PALM), 200)
  flow.select('TUTORIAL_CONTINUE')
  assert.equal(flow.state, APP_STATES.TUTORIAL)
  flow.handleHands(hands(GESTURES.SWIPE_RIGHT), 250)
  flow.select('TUTORIAL_CONTINUE')
  assert.equal(flow.state, APP_STATES.HERO_SELECT)
  flow.select('SELECT_VEX')
  assert.equal(flow.state, APP_STATES.BRIEFING)
  flow.select('BEGIN_MISSION')
  assert.equal(flow.state, APP_STATES.COMBAT)
})

test('results retain the actual score, gate the teaser, and reset setup without losing tracking', () => {
  const flow = createFlow()
  beginCalibration(flow)
  flow.showResult('DEFEAT', 350)
  flow.select('RESULT_CONTINUE')
  assert.deepEqual(flow.result, { outcome: 'DEFEAT', score: 350, heroId: 'VEX', teaser: false })
  flow.select('RETRY')
  assert.equal(flow.state, APP_STATES.COMBAT)
  flow.showResult('VICTORY', 2350)
  flow.select('RESULT_CONTINUE')
  assert.deepEqual(flow.result, { outcome: 'VICTORY', score: 2350, heroId: 'VEX', teaser: true })
  flow.tutorialComplete.add('PULSE')
  flow.select('MAIN_MENU')
  assert.equal(flow.state, APP_STATES.INTRO)
  assert.equal(flow.result, null)
  assert.equal(flow.tutorialComplete.size, 0)
  assert.equal(flow.calibrationStep, 0)
  assert.equal(flow.trackingReady, true)
  assert.equal(flow.camera.state, 'online')
})

for (const heroId of ['VEX', 'NEX', 'AERIS']) {
  test(`${heroId} selection is guarded, survives retry, and is captured in results`, () => {
    const flow = createFlow()
    flow.select(`SELECT_${heroId}`)
    assert.equal(flow.state, APP_STATES.INTRO)
    flow.setState(APP_STATES.HERO_SELECT)
    flow.select(`SELECT_${heroId}`)
    assert.equal(flow.selectedHero, heroId)
    assert.equal(flow.state, APP_STATES.BRIEFING)
    flow.select('SELECT_VEX') // Cannot change hero outside the selection screen.
    assert.equal(flow.selectedHero, heroId)
    flow.select('BEGIN_MISSION')
    assert.equal(flow.state, APP_STATES.COMBAT)
    flow.showResult('DEFEAT', 500)
    assert.equal(flow.result.heroId, heroId)
    flow.select('RETRY')
    assert.equal(flow.selectedHero, heroId)
    assert.equal(flow.state, APP_STATES.COMBAT)
    flow.showResult('VICTORY', 2500)
    assert.equal(flow.result.heroId, heroId)
    flow.select('MAIN_MENU')
    assert.equal(flow.selectedHero, 'VEX')
    assert.equal(flow.result, null)
  })
}
