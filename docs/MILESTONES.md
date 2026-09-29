# Development Milestones

## M0 - Foundation

Status: DONE

- Create Vite vanilla JavaScript project
- Verify dev server works
- Initialize Git
- Basic project structure
- Basic README

Definition of done:

npm run dev works without errors.

---

## M1 - Camera

Status: DONE

- Request webcam permission
- Display mirrored webcam feed
- Camera error handling
- Basic camera status UI

Definition of done:

User can open the site and see their webcam.

---

## M2 - Hand Tracking

Status: DONE

- Integrate MediaPipe
- Detect hand landmarks
- Draw landmarks on camera preview
- Keep tracking stable

Definition of done:

Moving a hand in front of the camera updates landmarks in real time.

---

## M3 - Gesture Engine

Status: DONE

Implement:

- POINT
- OPEN_PALM
- FIST
- SWIPE_LEFT
- SWIPE_RIGHT

Show current gesture on screen.

Definition of done:

At least 3 gestures work reliably.

---

## M4 - Gesture UI Navigation

Status: DONE

- Index finger controls virtual cursor
- Cursor position is smoothed
- Dwell selection
- Progress ring
- Buttons can be activated without mouse

Definition of done:

User can navigate a test menu using only their hand.

---

## M5 - Error Mode

Status: DONE

- Gesture quality score
- Specific error feedback
- Open palm corrections
- Fist corrections where practical

Definition of done:

At least one gesture can be intentionally performed incorrectly and
the app explains how to fix it.

---

## M6 - Combat Prototype

Status: DONE

Use VEX first.

- Player HP
- Boss HP
- Fist attack
- Palm shield
- Swipe movement / dodge
- Boss attacks
- Score
- Win / lose

Definition of done:

One full battle can be completed.

---
## M6.1 - Two-Hand Combat

Status: DONE

## M7 - Complete MVP

Status: DONE

- Intro
- Calibration
- Tutorial
- Hero selection
- One complete boss battle
- Result screen

Definition of done:

The project satisfies mandatory hackathon requirements.

DEPLOY AFTER THIS MILESTONE.

---

## M8 - Heroes

Status: TODO

- VEX
- NEX
- AERIS

Reuse the same gesture engine.

Do not duplicate gesture tracking.

---

## M9 - Story Polish

Status: TODO

- ECHO dialogue
- Story reveal
- Final battle if time permits
- transitions

---

## M10 - Visual Polish

Status: TODO

- cyberpunk design
- particles
- screen shake
- attack effects
- improved transitions

---

## M11 - Extras

Status: TODO

Only if time remains:

- Boss Rush
- local leaderboard
- sound effects
- additional combos
- head tracking

---

## Final

- Test clean browser session
- Test camera permission
- Build
- Deploy
- Complete README
- Verify GitHub
- Verify deployed link