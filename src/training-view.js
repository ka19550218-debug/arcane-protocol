import { TRAINING_MODULES, POINT_TARGETS } from './training-session.js'
import { gestureArt } from './gesture-art.js'
import { createGestureButton } from './gesture-navigation.js'
import { detectCombo } from './game/combat.js'

const FINGERS = ['INDEX', 'MIDDLE', 'RING', 'PINKY']
const label = (value) => (value ?? '—').replaceAll('_', ' ')

// Presentation only: every reading and correction comes from the shared engine.
export class TrainingView {
  constructor(stage) {
    this.stage = stage
    this.lastReadoutAt = -Infinity
    this.swipeUntil = { LEFT: 0, RIGHT: 0 }
    this.swipe = {}
  }

  renderMenu(mastered) {
    this.stage.innerHTML = `<section class="training-screen training-menu scene-enter">
      <header class="lab-heading"><div><p class="screen-kicker">ARCANE // NEURAL INPUT LAB</p><h2>TRAINING <span>CENTER</span></h2></div><p class="lab-counter">${mastered.size}<span>/ 06 VERIFIED</span></p></header>
      <p class="lab-copy">Your hands are the interface. Build precision, one command at a time.</p>
      <div class="training-modules">${TRAINING_MODULES.map((module, i) => `<div class="training-module" data-module="${module.id}">
        <div class="module-top"><span>0${i + 1} // ${module.category}</span><span>${mastered.has(module.id) ? '✓ VERIFIED' : 'AVAILABLE'}</span></div>
        <div class="module-art">${gestureArt(module.id)}</div><p>${module.description}</p><div data-module-action="${module.id}"></div></div>`).join('')}</div>
      <footer class="lab-footer"><div data-practice-action></div><div data-exit-action></div></footer>
      <p class="navigation-hint">POINT + HOLD 0.8s TO SELECT · RELAX BETWEEN SELECTIONS</p></section>`
    for (const module of TRAINING_MODULES) this.add(`[data-module-action="${module.id}"]`, module.name, `TRAIN_${module.id}`)
    this.add('[data-practice-action]', 'FREE PRACTICE ↗', 'FREE_PRACTICE')
    this.add('[data-exit-action]', '← MAIN MENU', 'MAIN_MENU')
  }

  renderSession(session) {
    this.session = session
    this.lastReadoutAt = -Infinity
    const module = TRAINING_MODULES.find(({ id }) => id === session?.id)
    const point = session?.id === 'POINT'
    this.stage.innerHTML = `<section class="training-screen lab-session ${point ? 'point-session' : ''} scene-enter">
      <header class="lab-heading"><div><p class="screen-kicker">${module ? `TRAINING // ${module.category}` : 'LIVE DIAGNOSTICS // COMBAT DISABLED'}</p><h2>${module ? module.name : 'FREE'} <span>${module ? 'PROTOCOL' : 'PRACTICE'}</span></h2></div><div data-lab-exit></div></header>
      <p class="lab-copy">${module?.instruction ?? 'Try any command with either hand. Combine both hands to inspect synchronized inputs.'}</p>
      ${point ? `<div class="point-field" aria-label="Five POINT dwell targets">${POINT_TARGETS.map((target, index) => `<div class="point-position" style="left:${target.x}%;top:${target.y}%" data-point-slot="${index}"></div>`).join('')}<span class="point-axis axis-x"></span><span class="point-axis axis-y"></span><p data-point-counter>TARGET 1 / 5 · CENTER</p></div>` : module ? `<div class="pose-exercise"><div class="pose-art">${gestureArt(module.id)}</div><div class="pose-coaching"><span class="screen-kicker">${session.isSwipe ? 'DELIBERATE MOTION' : 'STABLE HOLD // 0.65 SEC'}</span><strong data-rep-status>AWAITING INPUT</strong><div class="repetition-pips">${[0, 1, 2].map((i) => `<i data-rep="${i}"></i>`).join('')}</div><div class="hold-track"><span data-hold-progress></span></div><span data-rep-count>0 / 3 VERIFIED</span></div></div>` : `<div class="gesture-roster">${TRAINING_MODULES.map(({ id, name }) => `<div data-roster="${id}">${gestureArt(id)}<span>${name}</span></div>`).join('')}</div><div class="lab-combos"><span data-combo="DUAL_PULSE">2 FISTS // DUAL ATTACK</span><span data-combo="FULL_BARRIER">2 PALMS // DEFENSE</span><span data-combo="OVERDRIVE">FIST + PALM // SUPER INPUT</span></div>`}
      <div class="hand-analyzers">${['LEFT', 'RIGHT'].map((side) => `<article class="hand-analyzer" data-analyzer="${side}"><div class="analyzer-heading"><span>${side} HAND</span><strong data-quality>—</strong></div><div class="analyzer-readings"><span>CURRENT <b data-stable>NONE</b></span><span>BASE <b data-base>NONE</b></span><span>ATTEMPT <b data-attempt>—</b></span></div><div class="analyzer-fingers">${FINGERS.map((name) => `<span data-lab-finger="${name}"><small>${name}</small><b>—</b></span>`).join('')}</div><p class="analyzer-correction" data-correction>Show your hand to begin analysis.</p></article>`).join('')}</div>
      <p class="lab-footnote">LIVE CAMERA + LANDMARKS → NEURAL HAND LINK · QUALITY MEASURES THE DETECTED ATTEMPT</p></section>`
    this.add('[data-lab-exit]', '← TRAINING MENU', 'TRAINING_MENU')
    if (point) {
      for (let i = 0; i < POINT_TARGETS.length; i++) {
        const button = this.add(`[data-point-slot="${i}"]`, `<b>${String(i + 1).padStart(2, '0')}</b><small>${POINT_TARGETS[i].name}</small>`, `POINT_TARGET_${i}`)
        button.classList.add('point-target')
        button.dataset.continuousDwell = 'true'
        button.disabled = i !== 0
      }
    }
    this.handNodes = Object.fromEntries(['LEFT', 'RIGHT'].map((side) => {
      const root = this.stage.querySelector(`[data-analyzer="${side}"]`)
      return [side, { root, quality: root.querySelector('[data-quality]'), stable: root.querySelector('[data-stable]'), base: root.querySelector('[data-base]'), attempt: root.querySelector('[data-attempt]'), correction: root.querySelector('[data-correction]'),
        fingers: FINGERS.map((name) => ({ name, root: root.querySelector(`[data-lab-finger="${name}"]`), value: root.querySelector(`[data-lab-finger="${name}"] b`) })) }]
    }))
    this.roster = [...this.stage.querySelectorAll('[data-roster]')]
    this.combos = [...this.stage.querySelectorAll('[data-combo]')]
    this.repStatus = this.stage.querySelector('[data-rep-status]')
    this.holdProgress = this.stage.querySelector('[data-hold-progress]')
    this.repCount = this.stage.querySelector('[data-rep-count]')
  }

  update(hands, now, verified) {
    const session = this.session
    if (this.repStatus) {
      text(this.repStatus, session.needsRelease ? 'INPUT VERIFIED · RELAX HAND' : session.progress > 0 ? 'HOLD STEADY' : 'AWAITING INPUT')
      this.holdProgress.style.transform = `scaleX(${session.progress})`
      text(this.repCount, `${session.count} / 3 VERIFIED`)
      if (verified) this.stage.querySelector(`[data-rep="${session.count - 1}"]`)?.classList.add('is-verified')
    }
    // Remember brief swipe events long enough to read them; label them as events.
    for (const side of ['LEFT', 'RIGHT']) {
      if (hands[side]?.debug.rawGesture?.startsWith('SWIPE_')) {
        this.swipe[side] = hands[side].debug.rawGesture
        this.swipeUntil[side] = now + 650
      }
    }
    if (now - this.lastReadoutAt < 80) return
    this.lastReadoutAt = now
    const active = new Set()
    for (const side of ['LEFT', 'RIGHT']) {
      const hand = hands[side]
      const feedback = hand?.feedback ?? {}
      const nodes = this.handNodes[side]
      nodes.root.dataset.state = feedback.state ?? 'neutral'
      text(nodes.quality, Number.isFinite(feedback.quality) ? `${feedback.quality}%` : '—')
      const swipe = now < this.swipeUntil[side] ? this.swipe[side] : null
      text(nodes.stable, label(hand?.gesture ?? 'NONE'))
      text(nodes.base, swipe ? `${label(swipe)} · EVENT` : label(hand?.debug.rawGesture ?? 'NONE'))
      text(nodes.attempt, label(feedback.attemptedGesture))
      text(nodes.correction, feedback.correction ?? (feedback.state === 'success' ? 'Pose aligned and recognized.' : feedback.state === 'pending' ? 'Confirming stable input…' : 'Show a static pose for quality analysis.'))
      for (const finger of nodes.fingers) {
        const state = feedback.fingerStates?.[finger.name]
        text(finger.value, state ?? '—')
        finger.root.dataset.state = state ?? 'NONE'
        const extended = feedback.gesture === 'OPEN_PALM' || (feedback.gesture === 'POINT' && finger.name === 'INDEX') ||
          (feedback.gesture === 'V_SIGN' && ['INDEX', 'MIDDLE'].includes(finger.name))
        const opposite = extended ? state === 'CURLED' : state === 'EXTENDED'
        finger.root.classList.toggle('needs-adjustment', Boolean(feedback.gesture && opposite))
      }
      if (hand?.landmarks) active.add(swipe ?? hand.gesture)
    }
    this.roster.forEach((node) => node.classList.toggle('is-active', active.has(node.dataset.roster)))
    const combo = detectCombo(hands.LEFT?.gesture, hands.RIGHT?.gesture)
    this.combos.forEach((node) => node.classList.toggle('is-active', node.dataset.combo === combo))
  }

  targetVerified(session) {
    this.stage.querySelector(`[data-navigation-value="POINT_TARGET_${session.count - 1}"]`).disabled = true
    this.stage.querySelector(`[data-point-slot="${session.count - 1}"]`).classList.add('is-verified')
    const next = this.stage.querySelector(`[data-navigation-value="POINT_TARGET_${session.count}"]`)
    if (next) next.disabled = false
    text(this.stage.querySelector('[data-point-counter]'), session.complete ? 'NAVIGATION LINK VERIFIED' : `TARGET ${session.count + 1} / 5 · ${POINT_TARGETS[session.count].name}`)
  }

  renderComplete(session) {
    this.stage.innerHTML = `<section class="training-screen training-complete scene-enter"><p class="screen-kicker">NEURAL INPUT // VERIFIED</p><div class="mastery-seal">${gestureArt(session.id)}</div><h2>${session.id === 'POINT' ? 'NAVIGATION LINK' : 'GESTURE'}<br><span>${session.id === 'POINT' ? 'VERIFIED' : 'MASTERED'}</span></h2><p class="mastery-name">${label(session.id)}</p><p class="lab-copy">${session.total} / ${session.total} ${session.id === 'POINT' ? 'TARGETS ACQUIRED' : 'REPETITIONS VERIFIED'}${session.averageQuality !== null ? ` · AVERAGE QUALITY ${session.averageQuality}%` : ''}</p><div class="completion-actions" data-completion-actions></div><p class="navigation-hint">RELAX YOUR HAND, THEN POINT + DWELL TO CONTINUE</p></section>`
    this.add('[data-completion-actions]', 'TRAIN AGAIN', 'TRAIN_AGAIN')
    this.add('[data-completion-actions]', 'NEXT GESTURE →', 'TRAIN_NEXT')
    this.add('[data-completion-actions]', 'TRAINING MENU', 'TRAINING_MENU')
  }

  add(selector, label, value) {
    const button = createGestureButton({ label, value })
    this.stage.querySelector(selector).append(button)
    return button
  }
}

function text(node, value) { if (node && node.textContent !== value) node.textContent = value }
