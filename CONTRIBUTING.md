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
