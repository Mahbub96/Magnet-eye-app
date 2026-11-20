import { CenteredState, StatusPill } from './patterns';
import { color } from './theme';

/** Figma "11 Phone limitation": the phone has no magnetometer, so it cannot scan. */
export function NoMagnetometer({ onViewSaved }: { onViewSaved: () => void }) {
  return (
    <CenteredState
      tint={color.bad}
      glyph="!"
      title="This phone has no magnetometer"
      text="That’s a hardware limitation of this phone, not a problem with the app. Scanning isn’t possible, but you can still open scans shared with you."
      extra={<StatusPill tint={color.bad} text="Magnetometer: not found" />}
      primary={{ title: 'View saved scans', onPress: onViewSaved }}
    />
  );
}
