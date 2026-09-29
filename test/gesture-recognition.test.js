import test from 'node:test'
import assert from 'node:assert/strict'
import { getFingerStates } from '../src/finger-state.js'
import { GestureEngine, GESTURES } from '../src/gesture-engine.js'
import { GestureQualityEvaluator } from '../src/gesture-quality.js'
import { GestureNavigation } from '../src/gesture-navigation.js'
import { TwoHandInput, assignHands } from '../src/two-hand-input.js'

const SHAPES = {
  extended: [[0, -0.10], [0, -0.20], [0, -0.30]],
  partial: [[0, -0.10], [0.075, -0.155], [0.15, -0.17]],
  curled: [[0, -0.10], [0.065, -0.075], [0.025, -0.01]],
}

function makeHand(fingers, scale = 1) {
  const point = (x, y) => ({ x: 0.5 + (x - 0.5) * scale, y: 0.8 + (y - 0.8) * scale, z: 0 })
  const hand = Array.from({ length: 21 }, () => point(0.5, 0.8))
  hand[0] = point(0.5, 0.9)
  for (let index = 1; index <= 4; index += 1) hand[index] = point(0.25 - index * 0.025, 0.58 - index * 0.02)

  fingers.forEach((shape, fingerIndex) => {
    const x = 0.35 + fingerIndex * 0.10
    const baseIndex = 5 + fingerIndex * 4
    hand[baseIndex] = point(x, 0.55)
    SHAPES[shape].forEach(([dx, dy], jointIndex) => {
      hand[baseIndex + jointIndex + 1] = point(x + dx, 0.55 + dy)
    })
  })
  return hand
}

function recognize(hand) {
  const engine = new GestureEngine()
  const quality = new GestureQualityEvaluator()
  let feedback
  for (let frame = 0; frame < 3; frame += 1) {
    const stable = engine.update([hand], frame * 33)
    feedback = quality.update([hand], frame * 33, engine.rawGesture, stable)
  }
  return { engine, feedback }
}

test('slightly bent and nearly curled fingers remain partial and only attempt FIST', () => {
  for (const fingers of [
    ['partial', 'partial', 'partial', 'partial'],
    ['partial', 'curled', 'curled', 'curled'],
  ]) {
    const hand = makeHand(fingers)
    const { engine, feedback } = recognize(hand)
    assert.equal(getFingerStates(hand).INDEX, 'PARTIAL')
    assert.equal(engine.rawGesture, GESTURES.NONE)
    assert.equal(engine.stableGesture, GESTURES.NONE)
    assert.equal(feedback.attemptedGesture, GESTURES.FIST)
    assert.equal(feedback.state, 'correcting')
    assert.match(feedback.correction, /Curl your .* further/)
  }
})

test('straight visible joints do not become curled from inconsistent depth', () => {
  const hand = makeHand(['extended', 'extended', 'extended', 'extended'])
  for (let finger = 0; finger < 4; finger += 1) {
    const baseIndex = 5 + finger * 4
    hand[baseIndex + 1].z = 0.2
    hand[baseIndex + 3].z = 0.2
  }
  const states = getFingerStates(hand)
  assert.deepEqual(
    [states.INDEX, states.MIDDLE, states.RING, states.PINKY],
    ['EXTENDED', 'EXTENDED', 'EXTENDED', 'EXTENDED'],
  )
  assert.equal(recognize(hand).engine.stableGesture, GESTURES.OPEN_PALM)
})

test('a single bent joint with a straight DIP is partial, not curled', () => {
  const hand = makeHand(['extended', 'extended', 'extended', 'extended'])
  hand[6] = { x: 0.35, y: 0.45, z: 0 }
  hand[7] = { x: 0.42, y: 0.46, z: 0 }
  hand[8] = { x: 0.49, y: 0.47, z: 0 }
  assert.equal(getFingerStates(hand).INDEX, 'PARTIAL')
})

test('all four curled fingers form FIST regardless of thumb and hand scale', () => {
  for (const scale of [0.5, 1, 1.5]) {
    const hand = makeHand(['curled', 'curled', 'curled', 'curled'], scale)
    assert.equal(getFingerStates(hand).THUMB, 'EXTENDED')
    const { engine, feedback } = recognize(hand)
    assert.equal(engine.stableGesture, GESTURES.FIST)
    assert.equal(feedback.state, 'success')
  }
})

test('rotating the hand in the image does not change finger states', () => {
  const rotate = (hand) => hand.map(({ x, y, z }) => ({ x: 0.5 - (y - 0.5), y: 0.5 + (x - 0.5), z }))
  const open = rotate(makeHand(['extended', 'extended', 'extended', 'extended']))
  const fist = rotate(makeHand(['curled', 'curled', 'curled', 'curled']))
  assert.equal(recognize(open).engine.stableGesture, GESTURES.OPEN_PALM)
  assert.equal(recognize(fist).engine.stableGesture, GESTURES.FIST)
})

test('FIST rejects folded-looking joints when tips still extend past the palm', () => {
  const hand = makeHand(['curled', 'curled', 'curled', 'curled'])
  for (let finger = 0; finger < 4; finger += 1) {
    const baseIndex = 5 + finger * 4
    for (let joint = 1; joint <= 3; joint += 1) hand[baseIndex + joint].y -= 0.15
  }
  const states = getFingerStates(hand)
  assert.deepEqual(
    [states.INDEX, states.MIDDLE, states.RING, states.PINKY],
    ['CURLED', 'CURLED', 'CURLED', 'CURLED'],
  )
  const { engine, feedback } = recognize(hand)
  assert.equal(engine.stableGesture, GESTURES.NONE)
  assert.equal(feedback.attemptedGesture, GESTURES.FIST)
  assert.equal(feedback.state, 'correcting')
  assert.equal(feedback.correction, 'Bring your fingertips toward your palm')
  assert.ok(feedback.quality < 100)
})

test('OPEN_PALM and POINT remain valid while a V sign stays NONE', () => {
  assert.equal(recognize(makeHand(['extended', 'extended', 'extended', 'extended'])).engine.stableGesture, GESTURES.OPEN_PALM)
  assert.equal(recognize(makeHand(['extended', 'curled', 'curled', 'curled'])).engine.stableGesture, GESTURES.POINT)
  assert.equal(recognize(makeHand(['extended', 'extended', 'curled', 'curled'])).engine.stableGesture, GESTURES.NONE)
  assert.equal(recognize(makeHand(['extended', 'extended', 'extended', 'curled'])).engine.stableGesture, GESTURES.NONE)
})

test('OPEN_PALM quality is driven by the number of clearly extended main fingers', () => {
  const feedbackFor = (fingers) => recognize(makeHand(fingers)).feedback
  const open = feedbackFor(['extended', 'extended', 'extended', 'extended'])
  const threeExtended = feedbackFor(['extended', 'extended', 'extended', 'curled'])
  const peace = feedbackFor(['extended', 'extended', 'partial', 'partial'])

  assert.equal(open.gesture, GESTURES.OPEN_PALM)
  assert.ok(open.quality >= 90)
  assert.equal(threeExtended.gesture, GESTURES.OPEN_PALM)
  assert.ok(threeExtended.quality >= 70 && threeExtended.quality <= 85)
  assert.equal(peace.gesture, GESTURES.OPEN_PALM)
  assert.ok(peace.quality >= 50 && peace.quality <= 70)
  assert.equal(peace.correction, 'Extend your ring and pinky fingers more')
})

test('POINT accepts partial non-index fingers but requires a clearly extended index', () => {
  const pointing = makeHand(['extended', 'partial', 'curled', 'partial'])
  const states = getFingerStates(pointing)
  assert.deepEqual(
    [states.INDEX, states.MIDDLE, states.RING, states.PINKY],
    ['EXTENDED', 'PARTIAL', 'CURLED', 'PARTIAL'],
  )
  const { engine, feedback } = recognize(pointing)
  assert.equal(engine.rawGesture, GESTURES.POINT)
  assert.equal(engine.stableGesture, GESTURES.POINT)
  assert.equal(feedback.state, 'success')

  assert.equal(recognize(makeHand(['partial', 'curled', 'curled', 'curled'])).engine.stableGesture, GESTURES.NONE)
  assert.equal(recognize(makeHand(['extended', 'extended', 'partial', 'curled'])).engine.stableGesture, GESTURES.NONE)
  assert.equal(recognize(makeHand(['extended', 'curled', 'extended', 'partial'])).engine.stableGesture, GESTURES.NONE)
  assert.equal(recognize(makeHand(['extended', 'curled', 'partial', 'extended'])).engine.stableGesture, GESTURES.NONE)
})

test('the existing cursor appears when POINT becomes stable', () => {
  const previousDocument = globalThis.document
  const classes = () => {
    const values = new Set()
    return {
      add: (value) => values.add(value),
      remove: (value) => values.delete(value),
      contains: (value) => values.has(value),
      toggle: (value, force) => force ? values.add(value) : values.delete(value),
    }
  }
  globalThis.document = {
    createElement: () => ({ classList: classes(), style: { setProperty() {} }, setAttribute() {} }),
  }
  try {
    const container = {
      append() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 480 }),
    }
    const menu = { addEventListener() {}, querySelectorAll: () => [] }
    const navigation = new GestureNavigation({ container, menu })
    const engine = new GestureEngine()
    const hand = makeHand(['extended', 'partial', 'curled', 'partial'])
    const videoElement = { videoWidth: 640, videoHeight: 480 }
    for (let frame = 0; frame < 3; frame += 1) {
      const timestamp = frame * 33
      const gesture = engine.update([hand], timestamp)
      navigation.update({ gesture, indexTip: hand[8], timestamp, videoElement })
      assert.equal(navigation.cursor.classList.contains('is-visible'), frame === 2)
    }
  } finally {
    globalThis.document = previousDocument
  }
})

test('a new static gesture needs three consistent frames', () => {
  const engine = new GestureEngine()
  const open = makeHand(['extended', 'extended', 'extended', 'extended'])
  const partial = makeHand(['partial', 'partial', 'partial', 'partial'])
  const fist = makeHand(['curled', 'curled', 'curled', 'curled'])

  for (let frame = 0; frame < 3; frame += 1) engine.update([open], frame * 33)
  assert.equal(engine.stableGesture, GESTURES.OPEN_PALM)
  for (let frame = 3; frame < 6; frame += 1) engine.update([partial], frame * 33)
  assert.equal(engine.stableGesture, GESTURES.NONE)
  assert.equal(engine.update([fist], 198), GESTURES.NONE)
  assert.equal(engine.update([fist], 231), GESTURES.NONE)
  assert.equal(engine.update([fist], 264), GESTURES.FIST)
})

test('handedness is swapped for the mirrored preview and both classifiers keep state when result order changes', () => {
  const input = new TwoHandInput()
  const fist = makeHand(['curled', 'curled', 'curled', 'curled'])
  const palm = makeHand(['extended', 'extended', 'extended', 'extended'])
  let hands
  for (let frame = 0; frame < 3; frame += 1) {
    const reversed = frame % 2 === 1
    hands = input.update(
      reversed ? [palm, fist] : [fist, palm],
      reversed ? [[{ categoryName: 'Left' }], [{ categoryName: 'Right' }]]
        : [[{ categoryName: 'Right' }], [{ categoryName: 'Left' }]],
      frame * 33,
    )
  }
  assert.equal(hands.LEFT.gesture, GESTURES.FIST)
  assert.equal(hands.RIGHT.gesture, GESTURES.OPEN_PALM)
  assert.equal(hands.LEFT.feedback.state, 'success')
  assert.equal(hands.RIGHT.feedback.state, 'success')

  hands = input.update([palm], [[{ categoryName: 'Left' }]], 100)
  assert.equal(hands.LEFT.gesture, GESTURES.NONE)
  assert.equal(hands.RIGHT.gesture, GESTURES.OPEN_PALM)
})

test('missing handedness uses mirrored positions and a known label when available', () => {
  const left = makeHand(['extended', 'curled', 'curled', 'curled']).map((point) => ({ ...point, x: point.x + 0.2 }))
  const right = makeHand(['curled', 'curled', 'curled', 'curled']).map((point) => ({ ...point, x: point.x - 0.2 }))
  assert.equal(assignHands([right, left]).LEFT, left)
  assert.equal(assignHands([right, left]).RIGHT, right)
  assert.equal(assignHands([right, left], [[{ categoryName: 'Left' }], []]).RIGHT, right)
  assert.equal(assignHands([left]).LEFT, left)
})
