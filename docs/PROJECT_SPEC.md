# ARCANE PROTOCOL

## Core concept

ARCANE PROTOCOL is a browser-based 2D cyberpunk gesture RPG.

The user sits in front of a laptop webcam and controls the application
with hand gestures.

After the initial browser camera permission, keyboard and mouse
should not be required for normal gameplay.

## Story

Year: 2057.

The global network has collapsed.

The player is detected by a surviving system called ARCANE PROTOCOL.

An AI assistant named ECHO tells the player that hostile entities
have corrupted the system.

The player selects a combat avatar and destroys the system guardians.

Later it is revealed that the guardians were actually keeping ECHO
contained.

By defeating them, the player has been releasing ECHO.

The final boss is ECHO itself.

## Heroes

### VEX - Assault

Aggressive combat character.

Base abilities:

- FIST -> Pulse Shot
- OPEN PALM -> Energy Shield
- SWIPE LEFT / RIGHT -> Dash
- gesture sequence -> Overdrive combo

### NEX - Hacker

Control and reflection character.

Base abilities:

- FIST -> EMP Attack
- OPEN PALM -> Reflect Barrier
- SWIPE -> Phase Shift
- combo -> System Hack

### AERIS - Chronomancer

Time manipulation character.

Base abilities:

- FIST -> Chrono Bolt
- OPEN PALM -> Time Freeze
- SWIPE LEFT -> Rewind
- SWIPE RIGHT -> Time Dash
- combo -> Time Collapse

Important:

All heroes should reuse the same gesture recognition engine.

Heroes interpret the same gestures differently.

Do NOT build three independent gesture systems.

## Interface control

The interface should be controllable by hand.

POINT gesture:

The index finger acts as a cursor.

Moving the index finger moves an on-screen cursor.

Hovering over a UI button starts a dwell progress indicator.

Keeping the pointer over the button for approximately 0.8 seconds
activates the button.

No hand click gesture is required.

## Base gestures

Initial gesture engine:

- POINT
- OPEN_PALM
- FIST
- SWIPE_LEFT
- SWIPE_RIGHT

Possible later additions:

- head tilt left
- head tilt right

Head tracking is optional and should NOT be implemented until the
core hand system works reliably.

## Camera

The webcam view should be small and not dominate the screen.

Show tracking landmarks over the webcam.

Show the currently detected gesture and confidence/quality feedback.

## Error Mode

The application must recognize imperfect gestures and explain
how to correct them.

Examples:

- Open your fingers wider
- Keep your hand steady
- Move your hand slightly higher
- Move your hand toward the camera center

Where practical, show a gesture quality score from 0 to 100.

Error feedback should be based on understandable geometric rules,
not random messages.

## Combat

Combat is real-time.

The player can use abilities freely.

Bosses also perform timed attacks.

Some boss attacks create reaction moments where the player needs
to perform an appropriate gesture quickly.

Combat contains:

- player HP
- boss HP
- score
- combos
- incoming attack warning
- gesture feedback
- victory
- defeat

## Combo system

Keep a short history of recent gestures.

Example:

FIST -> FIST -> SWIPE_RIGHT

can trigger a special ability.

Combos should be short and reliable.

## Game modes

Required:

- Story Mode

Secondary:

- Boss Rush

Do not build Boss Rush until Story Mode has one complete working boss.

## Story MVP

1. Intro
2. Camera calibration
3. Gesture tutorial
4. Hero selection
5. Chapter / battle
6. Story reveal
7. Final battle
8. Result screen

For the first MVP, one complete boss is enough.

## Scores

Store scores locally with localStorage.

No backend.

## Visual direction

Cyberpunk / sci-fi.

Visual ideas:

- dark background
- holographic interface
- scanner lines
- glitch effects
- particles
- large typography
- progress rings
- screen shake
- attack flashes

Visual effects must not reduce performance or gesture tracking quality.

## Audio

Audio is optional until the gameplay is stable.

Possible later sounds:

- hover
- selection
- attack
- shield
- hit
- combo
- boss warning
- victory

## Scope restrictions

Do NOT implement:

- multiplayer
- backend
- user accounts
- database
- 3D
- custom neural network training
- mobile support before desktop is complete
- large number of levels