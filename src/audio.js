export const SOUND_KEY = 'arcane.sound.v1'

const CUES = {
  select: [[660, 0.06, 0.035]],
  attack: [[260, 0.07, 0.035]],
  defense: [[440, 0.13, 0.04]],
  dodge: [[520, 0.08, 0.035]],
  superReady: [[660, 0.1, 0.04], [880, 0.14, 0.04]],
  super: [[180, 0.18, 0.065], [360, 0.23, 0.055]],
  playerHit: [[130, 0.2, 0.055]],
  bossHit: [[330, 0.08, 0.035]],
  bossDefeated: [[520, 0.13, 0.055], [780, 0.2, 0.05]],
  victory: [[660, 0.16, 0.05], [990, 0.24, 0.05]],
  defeat: [[250, 0.16, 0.05], [120, 0.24, 0.05]],
  warning: [[720, 0.08, 0.04], [540, 0.08, 0.04]],
}

export class AudioManager {
  constructor() {
    try { this.enabled = localStorage.getItem(SOUND_KEY) !== 'off' } catch { this.enabled = true }
    this.context = null
  }

  unlock() {
    if (!this.enabled) return
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!AudioContext) return
      this.context ??= new AudioContext()
      if (this.context.state === 'suspended') this.context.resume().catch(() => {})
    } catch { /* Unsupported or blocked browser audio is silent. */ }
  }

  toggle() {
    this.enabled = !this.enabled
    try { localStorage.setItem(SOUND_KEY, this.enabled ? 'on' : 'off') } catch {}
    if (this.enabled) this.unlock()
    return this.enabled
  }

  play(name) {
    if (!this.enabled || !this.context || this.context.state !== 'running') return
    try {
      const start = this.context.currentTime
      for (const [index, [frequency, duration, volume]] of (CUES[name] ?? []).entries()) {
        const at = start + index * 0.09
        const oscillator = this.context.createOscillator()
        const gain = this.context.createGain()
        oscillator.type = name === 'super' || name === 'playerHit' ? 'sawtooth' : 'sine'
        oscillator.frequency.setValueAtTime(frequency, at)
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(volume, at + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + duration)
        oscillator.connect(gain).connect(this.context.destination)
        oscillator.start(at)
        oscillator.stop(at + duration + 0.01)
      }
    } catch { /* Never interrupt combat for audio. */ }
  }
}
