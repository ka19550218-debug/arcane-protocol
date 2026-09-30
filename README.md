# ARCANE PROTOCOL

## Project description

ARCANE PROTOCOL is a browser-based cyberpunk gesture-controlled game created for Admit Hackathon Motion 2026. The player uses a laptop webcam to navigate the interface, choose an operative, and fight through a complete story without needing a keyboard or mouse after camera permission is granted.

## Hackathon direction

**GAME / Motion**

## Main features

- Real-time webcam gesture control with on-screen hand landmarks
- POINT + dwell navigation for important menu actions
- Simultaneous two-hand tracking and combination gestures
- Three playable heroes: VEX, NEX, and AERIS
- Error Mode with live gesture-quality scoring and corrective feedback
- Training Center with six gesture modules, three deliberate repetitions, and a five-target POINT navigation exercise
- Free Practice with both-hand diagnostics, measured quality, corrections, and combination feedback
- Complete Story Mode with the Warden and ECHO boss fights
- Boss Rush: choose an operative, fight Warden then ECHO with a short automatic transition
- Local top-10 leaderboard for completed Story and Boss Rush runs
- Subtle synthesized sound effects with a gesture-accessible SOUND ON/OFF menu control
- Hero-specific attacks, defenses, dodges, and Super abilities
- HP, live score, combat feedback, victory, defeat, and retry flows

The first page load connects the camera and completes calibration and training, then opens the main menu. Returning to the menu keeps the active tracking setup. Boss Rush restores HP to 100 and resets Super Energy to 0 before ECHO. Each encounter uses the existing combat balance and score rules.

Leaderboard records and the sound preference are stored in this browser's `localStorage`. Records contain the actual score, operative, mode, result, and completion time; the highest 10 scores are retained. Sound cues are generated locally with Web Audio and require browser audio permission through a user interaction. The game remains playable if audio is blocked.

## Supported gestures

- **POINT** — move the virtual cursor with the index fingertip; hold it over a button for about 0.8 seconds to select.
- **FIST** — use the selected hero's basic attack.
- **OPEN_PALM** — activate the selected hero's defensive ability.
- **V_SIGN** — activate the selected hero's Super when Super Energy reaches 100%.
- **SWIPE LEFT / RIGHT** — dodge in the matching direction during combat.

Two-hand combinations are also supported. Two fists trigger the hero's dual attack, two open palms trigger the stronger defensive ability, and one fist plus one open palm activates the hero's Super when energy is full. Held poses trigger once and must be released before they can activate again.

## Error Mode

Error Mode evaluates an attempted static gesture from the same MediaPipe hand landmarks used by the game. It does not return a random generic error. The evaluator measures finger joint extension and curl, fingertip position, finger separation, palm orientation, and short-term hand stability. These geometric measurements are combined into a visible quality score from 0 to 100.

When a pose is close but does not meet the gesture rules, the interface identifies the most useful correction, such as extending a specific finger, curling the other fingers, opening the fingers wider, separating the V sign, turning the palm toward the camera, bringing fingertips toward the palm, or holding the hand steadier. The tracking panel shows whether the gesture is being corrected, confirmed, or successfully recognized while retaining the live gesture and landmark display for demonstration.

## Tech stack

- Vite
- Vanilla JavaScript
- MediaPipe Tasks Vision
- HTML and CSS
- Canvas 2D for the hand-landmark overlay

## Local launch

```bash
npm install
npm run dev
```

Open the local URL printed by Vite in a modern desktop browser.

## Production build

```bash
npm run build
```

The optimized output is written to `dist/`.

## Browser recommendation

Use a current desktop version of Chrome, Edge, or another modern browser with webcam, WebAssembly, and WebGL support. A laptop or desktop webcam is required; mobile is not a supported target for this release.

## Camera permission

Allow webcam permission when the browser prompts. The camera feed is processed in the browser for real-time hand tracking. If permission is denied, no camera is connected, or initialization fails, the application remains on a readable camera status screen and explains how to recover. Reload the page after changing camera permission or connecting a camera.

The MediaPipe runtime and hand-landmark model are loaded from public CDNs, so the first launch requires an internet connection.

## Project structure

- `src/main.js` — application startup, camera/tracker wiring, and the main animation loop
- `src/camera.js` — webcam startup, shutdown, and camera error messages
- `src/hand-tracker.js` — MediaPipe two-hand tracking and Canvas landmark rendering
- `src/gesture-engine.js` and `src/finger-state.js` — custom gesture classification from hand geometry
- `src/gesture-quality.js` — Error Mode quality scoring and specific correction feedback
- `src/gesture-navigation.js` — virtual cursor and POINT + dwell selection
- `src/game-flow.js` and `src/story.js` — calibration, tutorial, Story Mode, results, and retry flow
- `src/training-session.js` and `src/training-view.js` — gesture practice, repetition verification, and live diagnostics
- `src/operative-art.js` and `src/premium.css` — original local vector operatives and final presentation
- `src/leaderboard.js` and `src/audio.js` — local records and centralized sound cues
- `src/game/` — heroes, bosses, combat rules, settings, and combat UI
- `test/` — automated gesture, flow, hero, Super, and combat regression tests
- `docs/` — project requirements, decisions, milestones, and hackathon notes

## Regression checks

Run `node --test test/*.test.js` for the gesture, navigation, Training, story, and combat checks.
See [the final UI manual checklist](docs/FINAL_UI_QA.md) for physical webcam, gesture-only navigation, sound, and full-run verification. Training mastery lasts for the current session; local score persistence is unchanged.

## Hackathon development

The main project logic was created during the hackathon. The implementation uses MediaPipe for landmark detection and project-owned JavaScript rules for gesture interpretation, Error Mode feedback, navigation, game flow, and combat.

## Live Demo

https://arcane-protocol.vercel.app
