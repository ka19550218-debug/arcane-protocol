# Final presentation / Training QA

## Scope and verification

Core recognition, Error Mode calculations, combat settings, hero abilities, boss patterns,
scoring, persistence, sound, and existing story progression are unchanged.
Training consumes the existing two-hand results through `GameFlow.handleHands`.

Run:

```sh
npm run build
node --test test/*.test.js
npm run dev
```

Browser QA uses an isolated Chrome profile and a temporary response interceptor outside
this repository. It exposes the real application objects and substitutes recognized hand
samples without changing shipped code. It verifies rendered navigation, actual dwell
callbacks, Training repetitions, combo displays, noncombat isolation, Super presentation,
and target visibility. These checks do **not** verify physical webcam recognition or
MediaPipe performance on the player's hardware.

Checked desktop viewports: 1440×900, 1366×768, 1280×720. The populated top-ten archive,
results, onboarding, Training targets, and screen exits were included at 1280×720.

## Exact manual regression checklist

1. Launch `npm run dev`. Open its URL with a webcam connected. Allow camera access.
   Confirm mirrored video, aligned landmarks, readable connection status, and no errors.
   Repeat with camera denied and with camera unavailable; check the recovery message.
2. Complete Calibration: OPEN PALM, FIST, POINT. Complete the existing Tutorial:
   FIST, OPEN PALM, either SWIPE, V SIGN. Check automatic confirmations and arrival at Menu.
3. POINT to every menu panel. Hold for 0.8 seconds and relax between selections.
   Confirm hover/progress, one activation per hold, and no accidental selection while sweeping.
4. Aim at all stage edges without moving to webcam edges. Hold still, then move quickly.
   Briefly hide the pointing hand, then restore it elsewhere. Check stability and smooth recovery.
   Show two pointing hands; confirm only one cursor and no rapid ownership switching.
5. Enter Training → POINT. Dwell on CENTER, LEFT, RIGHT, TOP, BOTTOM in order.
   A mouse click must not verify a target. Confirm NAVIGATION LINK VERIFIED after all five.
6. Complete FIST, OPEN PALM, and V SIGN Training. Hold each for at least 0.65 seconds,
   relax visibly, and repeat three times. One frame, stale samples, and an uninterrupted held
   pose must not finish all repetitions. Confirm actual average quality and mastery badges.
7. Complete SWIPE LEFT and SWIPE RIGHT Training with three deliberate movements each.
   Return slowly to center between attempts. Confirm no invented swipe quality average.
8. From completion, dwell on Train Again, Next Gesture, and Training Menu. Exit an unfinished
   exercise and re-enter; verify a fresh session and retained session-only mastery badges.
9. In Free Practice, show every gesture with each hand. Show two fists, two palms, and
   fist + palm. Check both CURRENT/BASE/ATTEMPT readings and combination highlights.
   Confirm no combat damage, score, or Super charging occurs here.
10. Intentionally form imperfect fists, palms, POINT, and V SIGN. Verify measured quality,
    real finger states, distinct partial/incorrect styling, specific correction text, and
    fingertip highlights on either hand. A recognized different gesture should be labeled
    as that detected attempt, not falsely scored against the training target.
11. Choose Story, then each operative in separate runs. Confirm distinctive portraits,
    hover/dwell response, synchronization, and the existing briefing/engage flow.
12. Fight Warden as VEX, NEX, and AERIS. Test basic attack, defense, both dodge directions,
    two-hand abilities, actual cooldowns, real floating damage, score changes, and low HP.
    Confirm AERIS freezes time instead of blocking, and NEX's timed barrier reflects.
13. Land five released basic attacks to charge Super. Confirm one readiness cue at 100%.
    Use V SIGN; confirm hero-specific 0.7–1.2-second cinematic and energy reset. Input and
    threat instructions must remain active. A subsequent ordinary input must not cut it short.
14. Let boss warnings appear. Verify attack name, required gesture/direction, readable countdown,
    correct/wrong response feedback, and existing perfect block/dodge and combo behavior.
15. Defeat Warden in Story. Watch the automatic core reveal and ECHO override. Engage ECHO;
    verify its three patterns, fragments, corruption cues, entrance, and low-integrity state.
16. Lose to each boss. Confirm distinct defeat, Retry, full reset, and ECHO checkpoint behavior.
    Win both fights; verify restoration, real final score/statistics, ending, and Main Menu.
17. Run Boss Rush: Warden → automatic transition → ECHO. Confirm restored HP, reset energy,
    cumulative score, victory/defeat results, Retry, and Main Menu.
18. Open the archive; confirm scores/operative/mode and top-record emphasis. Reload and verify
    existing records persist. New Record must appear only when the saved data supports it.
19. Toggle sound using POINT. Verify preference persistence. Where browser autoplay requires
    a trusted click, click once to unlock sound, then check attack/defense/Super/result cues.
20. Repeat a fight with reduced motion enabled. Check readable cinematics and temporary feedback
    cleanup. Run for several minutes on the intended demo laptop and confirm webcam responsiveness.

## Remaining constraints

- Physical camera recognition, lighting tolerance, live cursor feel, and hardware frame rate
  require the manual pass above; automated recognized-input injection is not a substitute.
- MediaPipe still loads its existing runtime/model from CDNs. First launch needs connectivity.
- Browsers may require a trusted click for Web Audio. The existing silent fallback is preserved.
- Training mastery is session-only; local score storage is unchanged. Swipe training validates
  motion events rather than static holds. Error Mode quality belongs to the detected attempt.
- Desktop/laptop is the target. Narrow layouts reflow but may require scrolling.
