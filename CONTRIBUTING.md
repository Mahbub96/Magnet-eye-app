# Contributing

## Commands

```bash
npx expo install <package>  # add packages this way: it picks SDK-compatible versions
npx expo run:android        # development build on a connected phone
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npm test                    # unit tests
npx expo-doctor             # diagnose dependency and config issues
```

Run lint, typecheck and tests before opening a pull request.

## Expo

- Expo changes its APIs between SDK releases. Check the `expo` version in `package.json` and use
  the matching docs: `https://docs.expo.dev/versions/v<major>.0.0/`.
- Routes live in `src/app/` (Expo Router): every file there is a screen and `_layout.tsx` files
  define navigators. Keep components, hooks and utilities outside `src/app/`.
- `android/` is generated from `app.json` and the config plugins (Continuous Native Generation).
  Never edit it by hand.
- This app has a custom native module, so it needs a development build; Expo Go cannot run it.

## Screens and navigation

Screens follow the Figma file "Magnet Eye – App UI" (numbers below are its frame numbers). Each
screen is built in the roadmap phase that delivers its feature; see `../docs/Magnet Eye – UI
Completion Plan.md`.

| Route | Figma | Reached from |
| --- | --- | --- |
| `/welcome` | 01 Welcome | first launch (the tabs redirect here until the first run is done) |
| `/device-check` | 02 Checking your phone | Welcome → Get started; Settings → Re-run phone check |
| `/no-magnetometer` | 11 Phone limitation | phone check, when the phone has no magnetometer |
| `/` (tab Scan) | 06 Scan | tabs; shows 11 in place when there is no magnetometer |
| Scan → Start a scan | 05 Before you scan (sheet) | Scan tab, before the baseline |
| `/saved` (tab Saved) | 08 Saved scans | tabs; 11 → View saved scans |
| `/scan/[id]` | 08 detail, 14 Export (JSON only) | a saved scan |
| `/settings` (tab Settings) | 09 Settings | tabs |

Not built yet: 03 Your phone can scan and 04 Calibrate (Phase 5), 07 Results (Phase 8),
10 Camera access is off (Phase 6), 12 Needs a connection (Phase 4), 13 Did the magnet move?
(Phase 7).

UI building blocks live in `src/ui/`: `theme.ts` (tokens and the Inter font), `Text.tsx`
(always use this `Text`, it sets Inter), `components.tsx` (buttons, cards, chips, fields),
`patterns.tsx` (sheet, edge-state screen, list card, stepper, metric card, warning strip) and
`icons.tsx` (the eye mark and tab icons as SVG).

## Project rules

- Planning documents (PRD, SRS, Architecture, Roadmap, Challenges) live in `../docs/`. The swipe
  file format is `docs/swipe-format-v1.md`; once frozen, any change bumps `FORMAT_VERSION`.
- Sensor capture is the local Kotlin module `modules/magnet-capture`. Do not use expo-sensors: it
  lacks the game rotation vector and hardware timestamps.
- Never use the standard rotation vector (it uses the magnetometer, which the magnet disturbs).
  Orientation comes from the game rotation vector, or ARCore from Phase 6.
- No device value, threshold or grid size may be hard-coded; derive them from measurement
  (SRS NF-11).
- Units are fixed at the capture boundary: µT, metres, nanoseconds, radians; world frame z up;
  quaternions w x y z, phone to world. Convert once there, never inside calculations.
