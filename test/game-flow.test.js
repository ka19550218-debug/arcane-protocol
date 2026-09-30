import test from 'node:test'
import assert from 'node:assert/strict'
import { GameFlow, APP_STATES, FLOW_TIMING } from '../src/game-flow.js'
import { GESTURES } from '../src/gesture-engine.js'
import { STORY_SEQUENCES } from '../src/story.js'
import { GestureNavigation } from '../src/gesture-navigation.js'

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
  const now = flow.storyStartedAt
  flow.update(now)
  flow.update(now + FLOW_TIMING.CAMERA_ONLINE_MS)
}

test('camera readiness is required and CAMERA ONLINE remains visible before calibration', () => {
  const flow = createFlow()
  flow.select('RETRY')
  flow.select('SELECT_VEX')
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.update(100000)
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setTrackingReady()
  flow.update(110000)
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setCameraStatus('online', 'CAMERA ONLINE')
  flow.update(120000)
  flow.update(120000 + FLOW_TIMING.CAMERA_ONLINE_MS - 1)
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.update(120000 + FLOW_TIMING.CAMERA_ONLINE_MS)
  assert.equal(flow.state, APP_STATES.CALIBRATION)
})

test('calibration accepts reliable base poses in order with readable automatic confirmations', () => {
  const flow = createFlow()
  beginCalibration(flow)
  hold(flow, GESTURES.FIST, 0)
  assert.equal(flow.calibrationStep, 0)
  for (const [index, gesture] of [GESTURES.OPEN_PALM, GESTURES.FIST, GESTURES.POINT].entries()) {
    const now = 1000 + index * 2000
    hold(flow, gesture, now)
    assert.equal(flow.calibrationStep, index)
    assert.ok(flow.pendingTransition)
    flow.update(flow.pendingTransition.at - 1)
    assert.equal(flow.calibrationStep, index)
    if (index < 2) {
      flow.update(flow.pendingTransition.at)
      assert.equal(flow.calibrationStep, index + 1)
    }
  }
  assert.equal(flow.calibrationComplete, true)
  assert.equal(flow.state, APP_STATES.CALIBRATION)
  flow.update(flow.pendingTransition.at)
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
  flow.update(flow.pendingTransition.at)
  assert.equal(flow.calibrationStep, 1)
})

test('tutorial progresses in order, rejects combos and stale poses, and demonstrates Super', () => {
  const flow = createFlow()
  flow.calibrationComplete = true
  flow.setState(APP_STATES.TUTORIAL)
  flow.handleHands(hands(GESTURES.FIST, GESTURES.OPEN_PALM), 0)
  flow.handleHands(hands(GESTURES.FIST, GESTURES.FIST), 50)
  flow.handleHands(hands(GESTURES.OPEN_PALM, GESTURES.OPEN_PALM), 100)
  flow.handleHands(hands(GESTURES.SWIPE_RIGHT), 120)
  flow.handleHands({ LEFT: hand(GESTURES.FIST, GESTURES.NONE) }, 130)
  assert.equal(flow.tutorialComplete.size, 0)
  for (const [index, gesture] of [GESTURES.FIST, GESTURES.OPEN_PALM, GESTURES.SWIPE_RIGHT, GESTURES.V_SIGN].entries()) {
    flow.handleHands(hands(gesture), 1000 + index * 1000)
    assert.equal(flow.tutorialComplete.size, index + 1)
    flow.handleHands(hands(GESTURES.OPEN_PALM), 1001 + index * 1000)
    assert.equal(flow.tutorialComplete.size, index + 1)
    assert.equal(flow.state, APP_STATES.TUTORIAL)
    flow.update(flow.pendingTransition.at)
  }
  assert.equal(flow.state, APP_STATES.MENU)
  flow.update(100000)
  assert.equal(flow.state, APP_STATES.MENU)
  flow.select('STORY_MODE')
  finishSequence(flow)
  assert.equal(flow.state, APP_STATES.HERO_SELECT)
  flow.select('SELECT_VEX')
  assert.equal(flow.state, APP_STATES.BRIEFING)
  flow.update(200000)
  assert.equal(flow.state, APP_STATES.BRIEFING)
  flow.select('BEGIN_MISSION')
  assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
})

function enterWarden(flow, hero = 'VEX') {
  flow.setState(APP_STATES.HERO_SELECT)
  flow.select(`SELECT_${hero}`)
  flow.select('BEGIN_MISSION')
}

function finishSequence(flow) {
  const count = STORY_SEQUENCES[flow.state].length
  for (let i = flow.storyStep; i < count; i += 1) flow.update(flow.storyStartedAt + FLOW_TIMING.STORY_MAX_MS)
}

function enterEcho(flow) {
  finishSequence(flow)
  assert.equal(flow.state, APP_STATES.ECHO_BRIEFING)
  flow.select('ENGAGE_ECHO') // Cannot skip the takeover / hero interruption.
  assert.equal(flow.state, APP_STATES.ECHO_BRIEFING)
  finishSequence(flow)
  flow.select('ENGAGE_ECHO')
  assert.equal(flow.state, APP_STATES.ECHO_COMBAT)
}

const wardenStats = { attacks: 10, blocks: 2, dodges: 1, combos: 3 }
const echoStats = { attacks: 25, blocks: 5, dodges: 4, combos: 8 }

test('only a Warden victory unlocks the reveal and completed encounters are committed once', () => {
  const flow = createFlow()
  flow.showResult('VICTORY', 9999)
  assert.equal(flow.result, null)
  enterWarden(flow)
  flow.showResult('DEFEAT', 350, wardenStats)
  assert.equal(flow.state, APP_STATES.RESULT)
  assert.equal(flow.wardenResult, null)
  flow.select('NEXT_STORY')
  flow.select('RESULT_CONTINUE')
  flow.select('RETRY_FINAL')
  assert.equal(flow.state, APP_STATES.RESULT)
  flow.select('RETRY')
  assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
  const mutableStats = { ...wardenStats }
  flow.showResult('VICTORY', 1200, mutableStats)
  mutableStats.attacks = 900
  assert.equal(flow.state, APP_STATES.STORY_REVEAL)
  assert.equal(flow.isCombat, false)
  assert.equal(flow.wardenResult.score, 1200)
  assert.deepEqual(flow.wardenResult.stats, wardenStats)
  flow.showResult('VICTORY', 5000, echoStats)
  assert.equal(flow.wardenResult.score, 1200)
  assert.equal(flow.storyStep, 0)
})

for (const heroId of ['VEX', 'NEX', 'AERIS']) {
  test(`${heroId}: final retry retains setup and checkpoint but never failed-attempt points`, () => {
    const flow = createFlow()
    beginCalibration(flow)
    flow.calibrationComplete = true
    flow.tutorialComplete = new Set(['PULSE', 'SHIELD', 'DODGE', 'SUPER'])
    enterWarden(flow, heroId)
    flow.select('SELECT_VEX')
    assert.equal(flow.selectedHero, heroId)
    flow.showResult('VICTORY', 1200, wardenStats)
    enterEcho(flow)
    assert.equal(flow.scoreBeforeBattle, 1200)
    for (let retry = 0; retry < 2; retry += 1) {
      flow.showResult('DEFEAT', 300, echoStats)
      assert.equal(flow.state, APP_STATES.FINAL_RESULT)
      assert.equal(flow.result.score, 1500)
      assert.equal(flow.result.heroId, heroId)
      flow.select('RESULT_CONTINUE')
      assert.equal(flow.state, APP_STATES.FINAL_RESULT)
      flow.select('RETRY_FINAL')
      assert.equal(flow.state, APP_STATES.ECHO_COMBAT)
      assert.equal(flow.result, null)
      assert.equal(flow.selectedHero, heroId)
      assert.equal(flow.calibrationComplete, true)
      assert.equal(flow.tutorialComplete.size, 4)
      assert.equal(flow.camera.state, 'online')
      assert.equal(flow.trackingReady, true)
      assert.equal(flow.scoreBeforeBattle, 1200)
    }
    flow.showResult('VICTORY', 800, echoStats)
    assert.equal(flow.state, APP_STATES.RESTORATION)
    assert.equal(flow.result.score, 2000)
    assert.deepEqual(flow.result.stats, { attacks: 35, blocks: 7, dodges: 5, combos: 11 })
    flow.showResult('VICTORY', 800, echoStats)
    assert.equal(flow.result.score, 2000)
    finishSequence(flow)
    assert.equal(flow.state, APP_STATES.FINAL_RESULT)
    flow.select('RETRY_FINAL') // A victory cannot use the defeat-only action.
    assert.equal(flow.state, APP_STATES.FINAL_RESULT)
    flow.update(flow.storyStartedAt + FLOW_TIMING.RESULT_MS - 1)
    assert.equal(flow.state, APP_STATES.FINAL_RESULT)
    flow.update(flow.storyStartedAt + FLOW_TIMING.RESULT_MS)
    assert.equal(flow.state, APP_STATES.ENDING)
    flow.select('RETRY_STORY')
    assert.equal(flow.state, APP_STATES.ENDING)
    finishSequence(flow)
    flow.select('RETRY_STORY')
    assert.equal(flow.state, APP_STATES.HERO_SELECT)
    assert.equal(flow.wardenResult, null)
    assert.equal(flow.result, null)
    assert.equal(flow.calibrationComplete, true)
    flow.select(`SELECT_${heroId}`)
    flow.select('BEGIN_MISSION')
    assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
    assert.equal(flow.scoreBeforeBattle, 0)
  })
}

test('main menu clears all story progression but preserves the live camera and tracker', () => {
  const flow = createFlow()
  beginCalibration(flow)
  flow.calibrationComplete = true
  enterWarden(flow, 'NEX')
  flow.showResult('VICTORY', 1200, wardenStats)
  enterEcho(flow)
  flow.showResult('DEFEAT', 300, echoStats)
  flow.select('MAIN_MENU')
  assert.equal(flow.state, APP_STATES.MENU)
  assert.equal(flow.storyStep, 0)
  assert.equal(flow.result, null)
  assert.equal(flow.wardenResult, null)
  assert.equal(flow.selectedHero, 'VEX')
  assert.equal(flow.calibrationStep, 0)
  assert.equal(flow.calibrationComplete, true)
  assert.equal(flow.trackingReady, true)
  assert.equal(flow.camera.state, 'online')
})

test('story pages advance automatically once per update and meaningful choices wait', () => {
  const flow = createFlow()
  flow.setState(APP_STATES.MENU)
  flow.select('STORY_MODE')
  const changes = []
  flow.onStateChange = (state) => changes.push(state)
  flow.update(flow.storyStartedAt + FLOW_TIMING.STORY_MIN_MS - 1)
  assert.equal(flow.storyStep, 0)
  flow.update(flow.storyStartedAt + FLOW_TIMING.STORY_MAX_MS)
  assert.equal(flow.storyStep, 1)
  flow.update(flow.storyStartedAt + FLOW_TIMING.STORY_MAX_MS)
  assert.equal(flow.storyStep, 2)
  assert.deepEqual(changes, [APP_STATES.INTRO, APP_STATES.INTRO])
  flow.update(flow.storyStartedAt + FLOW_TIMING.STORY_MAX_MS)
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setState(APP_STATES.ECHO_BRIEFING)
  finishSequence(flow)
  flow.update(1000000)
  assert.equal(flow.state, APP_STATES.ECHO_BRIEFING)
})

test('leaving a confirmation cancels its pending transition', () => {
  const flow = createFlow()
  flow.setState(APP_STATES.TUTORIAL)
  flow.handleHands(hands(GESTURES.FIST), 0)
  assert.ok(flow.pendingTransition)
  flow.setState(APP_STATES.HERO_SELECT, 100)
  flow.update(10000)
  assert.equal(flow.state, APP_STATES.HERO_SELECT)
  assert.equal(flow.pendingTransition, null)
})

test('cosmetic progress restarts per page and cannot mutate the next screen after leaving', () => {
  const elements = Object.fromEntries(['[data-story-progress]', '[data-story-meter]', '[data-story-status]']
    .map((key) => [key, { textContent: '', style: {} }]))
  const flow = new FlowHarness({ stage: { querySelector: (selector) => elements[selector] } })
  flow.setState(APP_STATES.STORY_REVEAL, 1000)
  flow.advanceStory(2000)
  flow.update(2000)
  assert.equal(elements['[data-story-progress]'].textContent, '12%')
  flow.update(2550)
  assert.equal(elements['[data-story-progress]'].textContent, '47%')
  flow.update(3100)
  assert.equal(elements['[data-story-progress]'].textContent, '81%')
  flow.update(3650)
  assert.equal(elements['[data-story-status]'].textContent, 'CORE UNLOCKED')
  assert.equal(flow.storyStep, 1)
  flow.advanceStory(4000)
  elements['[data-story-status]'].textContent = 'NEW PAGE'
  flow.update(9000)
  assert.equal(elements['[data-story-status]'].textContent, 'NEW PAGE')
  flow.setState(APP_STATES.ECHO_BRIEFING, 10000)
  flow.advanceStory(11000)
  flow.update(11000)
  assert.equal(elements['[data-story-progress]'].textContent, '73%')
})


test('held POINT cannot select a hero and then immediately ENGAGE without release', () => {
  const previousDocument = globalThis.document
  const element = () => ({
    classList: { add() {}, remove() {}, toggle() {} },
    style: { setProperty() {} }, setAttribute() {},
  })
  globalThis.document = { createElement: element }
  try {
    const bounds = { left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480 }
    const button = { ...element(), dataset: { navigationValue: 'SELECT_VEX' }, getBoundingClientRect: () => bounds }
    const container = { append() {}, getBoundingClientRect: () => bounds }
    const menu = { addEventListener() {}, querySelectorAll: () => [button] }
    const flow = createFlow()
    flow.setState(APP_STATES.HERO_SELECT)
    const navigation = new GestureNavigation({ container, menu, onSelect: (value) => flow.select(value) })
    flow.onStateChange = () => navigation.lockUntilPointRelease()
    const input = (gesture, timestamp) => navigation.update({ gesture, timestamp,
      indexTip: { x: 0.5, y: 0.5 }, videoElement: { videoWidth: 640, videoHeight: 480 } })
    input(GESTURES.POINT, 0)
    input(GESTURES.POINT, 800)
    assert.equal(flow.state, APP_STATES.BRIEFING)
    button.dataset.navigationValue = 'BEGIN_MISSION'
    input(GESTURES.POINT, 3000)
    input(GESTURES.POINT, 4000)
    assert.equal(flow.state, APP_STATES.BRIEFING)
    input(GESTURES.NONE, 4100)
    input(GESTURES.POINT, 4200)
    input(GESTURES.POINT, 5000)
    assert.equal(flow.state, APP_STATES.WARDEN_COMBAT)
  } finally {
    globalThis.document = previousDocument
  }
})
