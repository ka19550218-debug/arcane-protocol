import test from 'node:test'
import assert from 'node:assert/strict'
import { GestureNavigation } from '../src/gesture-navigation.js'
import { GESTURES } from '../src/gesture-engine.js'

function classes() {
  const values = new Set()
  return {
    add: (name) => values.add(name),
    remove: (name) => values.delete(name),
    contains: (name) => values.has(name),
    toggle: (name, enabled) => enabled ? values.add(name) : values.delete(name),
  }
}

function navigation(buttons = [], onSelect) {
  const previousDocument = globalThis.document
  globalThis.document = {
    createElement: () => ({ classList: classes(), style: { setProperty() {} }, setAttribute() {} }),
  }
  const bounds = { left: 0, top: 0, right: 640, bottom: 480, width: 640, height: 480 }
  const container = { append() {}, getBoundingClientRect: () => bounds }
  const menu = {
    addEventListener() {},
    querySelectorAll: (selector) => selector === '[data-navigation-value]' ? buttons : [],
  }
  const instance = new GestureNavigation({ container, menu, onSelect })
  globalThis.document = previousDocument
  return instance
}

function button(rect) {
  return {
    classList: classes(),
    style: { setProperty() {} },
    dataset: { navigationValue: 'SELECT' },
    getBoundingClientRect: () => rect,
  }
}

function point(nav, x, y, timestamp) {
  nav.update({ gesture: GESTURES.POINT, rawGesture: GESTURES.POINT,
    quality: 80, indexTip: { x, y }, timestamp })
}

function cursorPosition(nav) {
  const [, x, y] = nav.cursor.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px/)
  return { x: Number(x), y: Number(y) }
}

test('mirrored inner camera area reaches stage edges and ignores tiny jitter', () => {
  const leftTop = navigation()
  point(leftTop, 0.9, 0.1, 0)
  assert.deepEqual(cursorPosition(leftTop), { x: 0, y: 0 })

  const rightBottom = navigation()
  point(rightBottom, 0.1, 0.9, 0)
  assert.deepEqual(cursorPosition(rightBottom), { x: 640, y: 480 })

  const still = navigation()
  point(still, 0.5, 0.5, 0)
  point(still, 0.502, 0.503, 33)
  assert.deepEqual(cursorPosition(still), { x: 320, y: 240 })
  point(still, 0.2, 0.5, 66)
  assert.ok(cursorPosition(still).x > 450, 'fast motion should quickly catch up')
})

test('dwell pauses through a brief POINT loss and resets after prolonged loss', () => {
  const target = button({ left: 250, right: 390, top: 180, bottom: 300 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  point(nav, 0.5, 0.5, 0)
  point(nav, 0.501, 0.5, 300)
  nav.update({ gesture: GESTURES.NONE, timestamp: 350 })
  assert.ok(nav.cursor.classList.contains('is-visible'))
  point(nav, 0.5, 0.5, 450)
  point(nav, 0.5, 0.5, 950)
  assert.deepEqual(selected, ['SELECT'])

  const lost = navigation([target])
  point(lost, 0.5, 0.5, 0)
  lost.update({ gesture: GESTURES.NONE, timestamp: 100 })
  lost.update({ gesture: GESTURES.NONE, timestamp: 300 })
  assert.ok(!lost.cursor.classList.contains('is-visible'))
  point(lost, 0.1, 0.5, 333)
  const firstRecoveryX = cursorPosition(lost).x
  assert.ok(firstRecoveryX - 320 <= 90, 'recovery should not teleport across the stage')
  point(lost, 0.1, 0.5, 366)
  assert.ok(cursorPosition(lost).x - firstRecoveryX <= 90, 'recovery should remain gradual')
})

test('fast movement across a button does not start dwell until the cursor settles', () => {
  const target = button({ left: 250, right: 390, top: 180, bottom: 300 })
  const selected = []
  const nav = navigation([target], (value) => selected.push(value))
  point(nav, 0.9, 0.5, 0)
  point(nav, 0.5, 0.5, 33)
  assert.equal(nav.activeButton, null)
  assert.deepEqual(selected, [])
  point(nav, 0.5, 0.5, 66)
  assert.equal(nav.activeButton, null)
  point(nav, 0.5, 0.5, 99)
  assert.equal(nav.activeButton, target)
})
