import test from 'node:test'
import assert from 'node:assert/strict'
import { GestureNavigation } from '../src/gesture-navigation.js'
import { GESTURES } from '../src/gesture-engine.js'
import {
  CURSOR_DEADZONE, CURSOR_X_MIN, CURSOR_X_MAX, CURSOR_Y_MIN, CURSOR_Y_MAX,
  POINT_LOST_GRACE_MS,
} from '../src/cursor-filter.js'

const WIDTH = 960
const HEIGHT = 640

function classes() {
  const values = new Set()
  return {
    add: (...names) => names.forEach((name) => values.add(name)),
    remove: (...names) => names.forEach((name) => values.delete(name)),
    contains: (name) => values.has(name),
    toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name),
  }
}

function navigation(buttons = [], onSelect) {
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => ({ classList: classes(), style: { setProperty() {} }, setAttribute() {} }),
  }
  const bounds = { left: 0, top: 0, right: WIDTH, bottom: HEIGHT, width: WIDTH, height: HEIGHT }
  const container = { append() {}, getBoundingClientRect: () => bounds }
  const menu = {
    addEventListener() {},
    querySelectorAll: (selector) => selector === '[data-navigation-value]' ? buttons : [],
  }
  try {
    return new GestureNavigation({ container, menu, onSelect })
  } finally {
    globalThis.document = previousDocument
  }
}

function button(rect, value = 'SELECT') {
  return {
    classList: classes(),
    style: { setProperty() {} },
    dataset: { navigationValue: value },
    getBoundingClientRect: () => rect,
  }
}

// Test trajectories use stage pixels; the actual update receives camera landmarks.
function cameraTip(x, y) {
  return {
    x: 1 - (CURSOR_X_MIN + x / WIDTH * (CURSOR_X_MAX - CURSOR_X_MIN)),
    y: CURSOR_Y_MIN + y / HEIGHT * (CURSOR_Y_MAX - CURSOR_Y_MIN),
  }
}

function point(nav, x, y, timestamp) {
  nav.update({ gesture: GESTURES.POINT, rawGesture: GESTURES.POINT,
    quality: 80, indexTip: cameraTip(x, y), timestamp, handSide: 'LEFT' })
}

function hand(x, y) {
  const landmarks = Array(21).fill(null)
  landmarks[8] = cameraTip(x, y)
  return { gesture: GESTURES.POINT, debug: { rawGesture: GESTURES.POINT },
    feedback: { quality: 80 }, landmarks }
}

function missingHand() {
  return { gesture: GESTURES.NONE, debug: { rawGesture: GESTURES.NONE },
    feedback: { quality: 0 }, landmarks: null }
}

function cursorPosition(nav) {
  const match = nav.cursor.style.transform.match(/translate3d\(([^,]+)px, ([^,]+)px/)
  assert.ok(match, 'the actual rendered cursor must be positioned with translate3d')
  return { x: Number(match[1]), y: Number(match[2]) }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

test('the calibrated inner camera region reaches all four stage corners', () => {
  assert.ok(CURSOR_X_MIN >= 0.15 && CURSOR_X_MAX <= 0.85, 'horizontal edges need a comfortable camera margin')
  assert.ok(CURSOR_Y_MIN >= 0.15 && CURSOR_Y_MAX <= 0.85, 'vertical edges need a comfortable camera margin')
  for (const [x, y] of [[0, 0], [WIDTH, 0], [0, HEIGHT], [WIDTH, HEIGHT]]) {
    const nav = navigation()
    point(nav, x, y, 0)
    assert.ok(distance(cursorPosition(nav), { x, y }) < 0.01)
    assert.ok(nav.cursor.classList.contains('is-visible'))
  }
})

for (const fps of [30, 60]) {
  test(`stationary fingertip micro-jitter stays nearly motionless for 3 seconds at ${fps} fps`, () => {
    const nav = navigation()
    const origin = { x: WIDTH / 2, y: HEIGHT / 2 }
    point(nav, origin.x, origin.y, 0)
    let maximumMovement = 0
    for (let frame = 1; frame <= fps * 3; frame += 1) {
      point(nav, origin.x + Math.sin(frame * 2.3) * 1.4,
        origin.y + Math.cos(frame * 1.7) * 1.4, frame * 1000 / fps)
      maximumMovement = Math.max(maximumMovement, distance(cursorPosition(nav), origin))
    }
    assert.ok(maximumMovement <= 1, `stationary jitter moved the rendered cursor by ${maximumMovement}px`)
  })

  test(`slow motion is precise while fast motion catches up immediately at ${fps} fps`, () => {
    const dt = 1000 / fps
    const slow = navigation()
    point(slow, 200, 300, 0)
    let previousX = 200
    for (let frame = 1; frame <= fps; frame += 1) {
      const targetX = 200 + frame * 90 / fps
      point(slow, targetX, 300, frame * dt)
      const rendered = cursorPosition(slow)
      assert.ok(rendered.x >= previousX - 0.01, 'slow aiming should not reverse or oscillate')
      assert.ok(rendered.x <= targetX + 0.01, 'slow aiming should not overshoot')
      assert.ok(targetX - rendered.x < 22, 'slow aiming should retain a small, bounded lag')
      previousX = rendered.x
    }

    const fast = navigation()
    point(fast, 0, 0, 0)
    point(fast, WIDTH, HEIGHT, dt)
    assert.ok(cursorPosition(fast).x >= WIDTH * 0.8, 'a fast sweep should cover most of the distance in one sample')
    assert.ok(cursorPosition(fast).y >= HEIGHT * 0.8)
    for (let frame = 2; frame <= Math.ceil(fps / 10); frame += 1) {
      point(fast, WIDTH, HEIGHT, frame * dt)
    }
    assert.ok(distance(cursorPosition(fast), { x: WIDTH, y: HEIGHT }) < Math.hypot(WIDTH, HEIGHT) * 0.06)
    point(fast, 0, 0, 150)
    assert.ok(cursorPosition(fast).x < WIDTH * 0.2, 'a fast reversal should not retain the previous direction')
  })
}

test('slow and fast input receive different smoothing strengths', () => {
  const slow = navigation()
  const fast = navigation()
  point(slow, 300, 300, 0)
  point(fast, 300, 300, 0)
  point(slow, 306, 300, 1000 / 30)
  point(fast, 500, 300, 1000 / 30)
  const slowFraction = (cursorPosition(slow).x - 300) / 6
  const fastFraction = (cursorPosition(fast).x - 300) / 200
  assert.ok(fastFraction > slowFraction + 0.15, 'fast input should use materially less smoothing')
})

test('the same moving trajectory behaves consistently at 30 and 60 fps', () => {
  const positions = [30, 60].map((fps) => {
    const nav = navigation()
    for (let frame = 0; frame <= fps; frame += 1) {
      const elapsed = frame / fps
      point(nav, 150 + 360 * elapsed, 140 + 180 * elapsed, elapsed * 1000)
    }
    return cursorPosition(nav)
  })
  assert.ok(distance(positions[0], positions[1]) < 12, 'filtering should not depend strongly on webcam cadence')
})

test('dwell completes while coordinates move within the same target', () => {
  const target = button({ left: 300, right: 660, top: 250, bottom: 390 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  point(nav, 480, 320, 0)
  for (let frame = 1; frame <= 32; frame += 1) {
    point(nav, 480 + Math.sin(frame / 6) * 15, 320 + Math.sin(frame / 7) * 8, frame * 1000 / 30)
  }
  assert.deepEqual(selected, ['SELECT'], 'target identity must preserve dwell despite ordinary precision movement')
})

test('the current dwell target survives a few pixels of boundary jitter', () => {
  const target = button({ left: 300, right: 660, top: 250, bottom: 390 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  point(nav, 303, 320, 0)
  for (let frame = 1; frame <= 15; frame += 1) {
    point(nav, 303 - frame * 9 / 15, 320, frame * 1000 / 30)
  }
  assert.equal(nav.activeButton, target)
  assert.ok(nav.dwellElapsed >= 450, 'crossing the visual boundary by a few pixels should not restart dwell')
  for (let frame = 16; frame <= 27; frame += 1) point(nav, 294, 320, frame * 1000 / 30)
  assert.deepEqual(selected, ['SELECT'])
})

test('high-speed movement cancels dwell even while staying over the same button', () => {
  const target = button({ left: 250, right: 710, top: 250, bottom: 390 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  for (let frame = 0; frame <= 9; frame += 1) point(nav, 380, 320, frame * 1000 / 30)
  assert.ok(nav.dwellElapsed >= 290)
  point(nav, 580, 320, 1000 / 3)
  assert.equal(nav.activeButton, null)
  assert.equal(nav.dwellElapsed, 0)
  assert.deepEqual(selected, [])
})

test('sweeping across buttons cannot activate them', () => {
  const targets = [button({ left: 200, right: 440, top: 250, bottom: 390 }, 'FIRST'),
    button({ left: 500, right: 740, top: 250, bottom: 390 }, 'SECOND')]
  const selected = []
  const nav = navigation(targets, (value) => selected.push(value))
  point(nav, 0, 320, 0)
  for (let frame = 1; frame <= 40; frame += 1) {
    const phase = frame % 20
    const x = (phase <= 10 ? phase : 20 - phase) * WIDTH / 10
    point(nav, x, 320, frame * 1000 / 30)
    assert.equal(nav.activeButton, null, 'a fast sweep must not accumulate dwell')
  }
  assert.deepEqual(selected, [])
})

test('brief POINT loss freezes the cursor and pauses, rather than resets, dwell', () => {
  const target = button({ left: 300, right: 660, top: 250, bottom: 390 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  for (let frame = 0; frame <= 9; frame += 1) point(nav, 480, 320, frame * 1000 / 30)
  const before = cursorPosition(nav)
  const elapsed = nav.dwellElapsed
  nav.update({ gesture: GESTURES.NONE, timestamp: 333 })
  assert.ok(nav.cursor.classList.contains('is-visible'))
  assert.deepEqual(cursorPosition(nav), before)
  point(nav, 481, 321, 500)
  assert.ok(distance(cursorPosition(nav), before) <= CURSOR_DEADZONE)
  assert.ok(Math.abs(nav.dwellElapsed - elapsed) < 1, 'missing frames must not count toward dwell')
  for (let frame = 1; frame <= 18; frame += 1) point(nav, 480, 320, 500 + frame * 1000 / 30)
  assert.deepEqual(selected, ['SELECT'])
})

test('prolonged loss hides the cursor and bridges a distant reacquisition without teleporting', () => {
  const nav = navigation()
  point(nav, 200, 150, 0)
  nav.update({ gesture: GESTURES.NONE, timestamp: 33 })
  const resumeAt = 33 + POINT_LOST_GRACE_MS + 34
  nav.update({ gesture: GESTURES.NONE, timestamp: resumeAt - 1 })
  assert.ok(!nav.cursor.classList.contains('is-visible'))
  const before = cursorPosition(nav)
  point(nav, 880, 580, resumeAt)
  assert.ok(distance(cursorPosition(nav), before) < 1, 'the first resumed sample must preserve the last rendered position')
  let previous = cursorPosition(nav)
  for (let frame = 1; frame <= 9; frame += 1) {
    point(nav, 880, 580, resumeAt + frame * 1000 / 30)
    const position = cursorPosition(nav)
    assert.ok(distance(position, previous) < 350, 'recovery should move continuously across several samples')
    previous = position
  }
  assert.ok(distance(cursorPosition(nav), { x: 880, y: 580 }) < 40, 'recovery should finish promptly')
})

test('a stale sample gap gets loss recovery even without an explicit missing-hand frame', () => {
  const target = button({ left: 300, right: 660, top: 250, bottom: 390 })
  const nav = navigation([target])
  point(nav, 480, 320, 0)
  point(nav, 480, 320, 100)
  const before = cursorPosition(nav)
  point(nav, 900, 580, 100 + POINT_LOST_GRACE_MS + 50)
  assert.ok(distance(cursorPosition(nav), before) < 1, 'a stalled camera must not cause a cross-screen jump')
  assert.equal(nav.dwellElapsed, 0, 'a long unobserved gap must invalidate dwell')
})

test('POINT ownership survives brief loss and a later handoff resets dwell and bridges the cursor', () => {
  const target = button({ left: 120, right: 240, top: 250, bottom: 390 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  const both = { LEFT: hand(180, 320), RIGHT: hand(780, 320) }
  const rightOnly = { LEFT: missingHand(), RIGHT: hand(780, 320) }
  nav.updateHands(both, 0)
  nav.updateHands(both, 100)
  assert.ok(distance(cursorPosition(nav), { x: 180, y: 320 }) < 1)
  nav.updateHands(rightOnly, 150)
  nav.updateHands(both, 250)
  assert.ok(distance(cursorPosition(nav), { x: 180, y: 320 }) < 1, 'a brief loss must not switch to the other POINT hand')
  nav.updateHands(rightOnly, 300)
  nav.updateHands(rightOnly, 300 + POINT_LOST_GRACE_MS - 1)
  assert.ok(distance(cursorPosition(nav), { x: 180, y: 320 }) < 1)
  const handoffAt = 300 + POINT_LOST_GRACE_MS + 1
  nav.updateHands(rightOnly, handoffAt)
  assert.ok(distance(cursorPosition(nav), { x: 180, y: 320 }) < 1, 'handoff must preserve the initial rendered position')
  assert.equal(nav.dwellElapsed, 0)
  assert.equal(nav.activeButton, null)
  for (let frame = 1; frame <= 9; frame += 1) nav.updateHands(rightOnly, handoffAt + frame * 1000 / 30)
  assert.ok(distance(cursorPosition(nav), { x: 780, y: 320 }) < 40)
  assert.deepEqual(selected, [])
})
