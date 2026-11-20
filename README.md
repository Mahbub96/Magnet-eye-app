# Magnet Eye – Android app

See the magnetic field around any magnet with your phone and a few swipes. This app records
the phone's sensors; the [backend](../magnet-eye-backend) rebuilds the 3D field.

**Status:** Phase 2, the swipe recorder. Ruler mode only. The app measures a baseline, records
swipes along lines you mark on paper, and saves each one as a [swipe format v1](docs/swipe-format-v1.md)
JSON file you can share. Calibration, ARCore tracking, the guided scanning loop and the 3D
viewer come in later phases (see the roadmap).

## Stack

Expo SDK 58 (development build, not Expo Go), Expo Router, TypeScript, Zustand, expo-sqlite,
and a local Kotlin Expo module, `modules/magnet-capture`, that reads the uncalibrated
magnetometer, game rotation vector, accelerometer and gyroscope at the fastest rate the phone
allows, keeping each reading's hardware timestamp.

## Run it

Needs Node, JDK 17 and the Android SDK.

```bash
npm install
npx expo run:android          # builds, installs on a connected phone, starts Metro
```

Standalone APK (bundled JavaScript, no Metro needed):

```bash
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a
# android/app/build/outputs/apk/release/app-release.apk
```

`android/` is generated from `app.json` and the config plugins (Continuous Native Generation);
do not edit it by hand.

## Checks

```bash
npm run typecheck
npm run lint
npm test
```

## Recording a swipe (ruler mode)

1. Tape a sheet of paper to a wooden or plastic table, away from steel and laptops. Draw x and y axes.
2. With the magnet at least 50 cm away, lay the phone flat with its top edge pointing along +y
   and press **Measure baseline and start**. Keep it still for 2 seconds.
3. Put the magnet at the origin. Enter the swipe line in millimetres, place the centre of the
   phone's top edge on the start mark, press record, slide steadily along the ruler to the end
   mark, press stop.
4. The next parallel line is filled in for you. **Finish** measures the end baseline.
5. Saved → open the scan → share a swipe or the full scan as JSON.

## Layout

```
src/app/             Expo Router screens (tabs: Scan, Saved, Settings; scan/[id])
src/modules/capture/ swipe format v1 types, builder, validator, baseline
src/db/              SQLite schema and repositories
src/store/           Zustand recorder store
src/ui/              theme tokens and shared components
src/utils/           quaternions
modules/magnet-capture/  Kotlin sensor module
```

## Licence

MIT
