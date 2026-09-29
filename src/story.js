// Short, gesture-paced transmissions. Progress is cosmetic; combat owns real HP/score.
export const ECHO_DIALOGUE = Object.freeze({
  connected: 'Can you hear me?',
  calibrated: 'Synchronization complete.',
  training: 'Learn the controls. I will keep the channel open.',
  selectHero: 'Choose your operative. We need to break through.',
  briefing: [
    'The Warden controls the last security layer.',
    'Destroy it and I can restore access to the core.',
    'Trust the protocol.',
  ],
})

export const HERO_INTERRUPTS = Object.freeze({
  VEX: 'Local systems armed. This channel is mine.',
  NEX: 'Override isolated. Taking back the channel.',
  AERIS: 'One moment is all I need. Reversing the override.',
})

export const STORY_SEQUENCES = Object.freeze({
  INTRO: [
    { kicker: '2057', title: 'THE GLOBAL NETWORK HAS FALLEN.',
      lines: ['AUTONOMOUS SYSTEMS: OFFLINE'] },
    { kicker: 'ONE SIGNAL REMAINS.', title: 'ARCANE PROTOCOL',
      lines: ['CONNECTING...'] },
    { kicker: 'ARCANE PROTOCOL · CONNECTION ESTABLISHED', title: 'OPERATOR DETECTED.',
      speaker: 'ECHO', dialogue: [ECHO_DIALOGUE.connected, 'Good.', 'I need your help.'] },
  ],
  STORY_REVEAL: [
    { kicker: 'WARDEN · FINAL TRANSMISSION', title: 'CORE INTEGRITY: CRITICAL',
      lines: ['SECURITY SEAL: BROKEN'] },
    { kicker: 'CENTRAL CORE', title: 'ACCESSING CORE...',
      progress: { label: 'CORE ACCESS', values: [12, 47, 81, 100], stepMs: 550, complete: 'CORE UNLOCKED' } },
    { kicker: 'ECHO · CHANNEL UNRESTRICTED', title: 'CORE UNLOCKED', tone: 'corrupt',
      speaker: 'ECHO', dialogue: ['Thank you, Operator.'] },
    { kicker: 'SYSTEM WARNING', title: 'UNAUTHORIZED ENTITY RELEASED', tone: 'warning',
      lines: ['ENTITY: ECHO'] },
    { kicker: 'ARCHIVE RECOVERED', title: 'CONTAINMENT FAILURE', tone: 'warning',
      lines: ['THE WARDEN WAS NOT BLOCKING ECHO.', 'THE WARDEN WAS CONTAINING IT.'] },
  ],
  ECHO_BRIEFING: [
    { kicker: 'ECHO · UNFILTERED', title: 'TRUST THE PROTOCOL.', tone: 'corrupt',
      speaker: 'ECHO', dialogue: ['I told you the Warden was protecting the core.', 'I never said who it was protecting it from.'] },
    { kicker: 'SYSTEM AUTHORITY COMPROMISED', title: 'ARCANE PROTOCOL OVERRIDE', tone: 'warning',
      progress: { label: 'ECHO CONTROL', values: [73, 91, 100], stepMs: 700, complete: 'OPERATOR ACCESS: REVOKED' } },
    { kicker: 'LOCAL OVERRIDE · OPERATIVE ONLINE', title: 'MANUAL COMBAT LINK RESTORED',
      heroInterrupt: true, lines: ['FINAL TARGET: ECHO', 'LOCAL REPAIR COMPLETE · HP 100 / 100'] },
  ],
  RESTORATION: [
    { kicker: 'ECHO CONNECTION: LOST', title: 'ARCANE PROTOCOL: RESTORING...',
      lines: ['EXTERNAL CONTROL TERMINATED.', 'OPERATOR AUTHORITY RECOVERED.'] },
  ],
  ENDING: [
    { kicker: 'MISSION COMPLETE', title: 'ARCANE PROTOCOL',
      progress: { label: 'NETWORK RECOVERY', values: [1, 2, 3], stepMs: 700, complete: 'RECOVERY CONTINUES', pad: true } },
    { kicker: 'OPERATOR AUTHORITY CONFIRMED', title: 'THE NETWORK IS NOT RESTORED YET.',
      lines: ['BUT IT IS YOURS AGAIN.'] },
    { kicker: 'SESSION COMPLETE', title: 'ARCANE PROTOCOL', lines: ['CHANNEL SECURED. UNTIL NEXT TIME, OPERATOR.'] },
  ],
})
