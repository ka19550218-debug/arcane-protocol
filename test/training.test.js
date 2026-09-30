import test from 'node:test'
import assert from 'node:assert/strict'
import { TrainingSession } from '../src/training-session.js'
import { GameFlow, APP_STATES } from '../src/game-flow.js'

const hand = (gesture, raw = gesture, quality = 91) => ({ landmarks: [{}], gesture,
  debug: { rawGesture: raw }, feedback: { quality, gesture, attemptedGesture: gesture, state: 'success' } })
const hands = (gesture, raw = gesture) => ({ LEFT: hand(gesture, raw), RIGHT: { landmarks: null, gesture: 'NONE', debug: { rawGesture: 'NONE' }, feedback: {} } })
const hold = (session, start, gesture = session.id) => {
  for (let now = start; now <= start + 700; now += 50) session.update(hands(gesture), now)
}
const release = (session, start) => {
  for (let now = start; now <= start + 300; now += 50) session.update(hands('NONE'), now)
}

test('static Training requires three held repetitions with visible releases and reports measured quality', () => {
  for (const id of ['FIST', 'OPEN_PALM', 'V_SIGN']) {
    const session = new TrainingSession(id)
    session.update(hands(id), 0)
    assert.equal(session.count, 0)
    hold(session, 50)
    assert.equal(session.count, 1)
    hold(session, 800)
    assert.equal(session.count, 1, 'a held gesture must not repeat')
    release(session, 1550)
    hold(session, 1900)
    release(session, 2650)
    hold(session, 3000)
    assert.equal(session.complete, true)
    assert.equal(session.averageQuality, 91)
  }
})

test('stale base output, dropped samples and hand swaps cannot finish a static hold', () => {
  const session = new TrainingSession('FIST')
  for (let now = 0; now <= 1000; now += 50) session.update(hands('FIST', 'NONE'), now)
  assert.equal(session.count, 0)
  session.update(hands('FIST'), 1100)
  session.update(hands('FIST'), 1900)
  assert.equal(session.count, 0)
  session.update({ LEFT: { landmarks: null }, RIGHT: hand('FIST') }, 2200)
  assert.equal(session.progress, 0)
})

test('a camera dropout is not a repetition release', () => {
  const session = new TrainingSession('OPEN_PALM')
  hold(session, 0)
  for (let now = 750; now < 1500; now += 50) session.update({ LEFT: { landmarks: null }, RIGHT: { landmarks: null } }, now)
  hold(session, 1500)
  assert.equal(session.count, 1)
})

test('swipe training accepts motion events, rejects repeated frames and never invents quality', () => {
  for (const id of ['SWIPE_LEFT', 'SWIPE_RIGHT']) {
    const session = new TrainingSession(id)
    session.update(hands(id), 0)
    session.update(hands(id), 50)
    assert.equal(session.count, 1)
    release(session, 100)
    session.update(hands(id), 850)
    release(session, 900)
    session.update(hands(id), 1700)
    assert.equal(session.complete, true)
    assert.equal(session.averageQuality, null)
  }
})

test('POINT requires ordered dwell acquisitions; clicks cannot verify a target', () => {
  const session = new TrainingSession('POINT')
  assert.equal(session.acquireTarget(0, 'click'), false)
  assert.equal(session.acquireTarget(1, 'dwell'), false)
  for (let i = 0; i < 5; i++) assert.equal(session.acquireTarget(i, 'dwell'), true)
  assert.equal(session.complete, true)
  assert.equal(session.acquireTarget(5, 'dwell'), false)
})

class FlowHarness extends GameFlow { render() {} }
test('Training flow is isolated from combat, exits cleanly, and retains session mastery', () => {
  const flow = new FlowHarness({ stage: { querySelector: () => null } })
  flow.trainingView.update = () => {}
  flow.trainingView.targetVerified = () => {}
  flow.select('TRAINING')
  assert.equal(flow.state, APP_STATES.CAMERA)
  flow.setState(APP_STATES.MENU)
  flow.select('TRAINING')
  flow.select('TRAIN_FIST')
  assert.equal(flow.state, APP_STATES.TRAINING)
  assert.equal(flow.isCombat, false)
  for (let rep = 0; rep < 3; rep++) {
    for (let t = 0; t <= 700; t += 50) flow.handleHands(hands('FIST'), rep * 1200 + t)
    for (let t = 750; t <= 1050; t += 50) flow.handleHands(hands('NONE'), rep * 1200 + t)
  }
  assert.equal(flow.state, APP_STATES.TRAINING_COMPLETE)
  assert.ok(flow.masteredGestures.has('FIST'))
  flow.select('TRAIN_NEXT')
  assert.equal(flow.trainingSession.id, 'OPEN_PALM')
  flow.select('TRAINING_MENU')
  flow.select('FREE_PRACTICE')
  flow.handleHands(hands('FIST'), 9000)
  assert.equal(flow.isCombat, false)
  flow.select('MAIN_MENU')
  assert.equal(flow.state, APP_STATES.MENU)
  assert.equal(flow.pendingTransition, null)
})
