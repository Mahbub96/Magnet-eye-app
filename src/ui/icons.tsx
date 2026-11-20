import Svg, { Circle, Line, Path } from 'react-native-svg';

import { color } from './theme';

/** The Magnet Eye mark (design/mark.svg), cropped to the eye. N pole red, S pole blue. */
export function Mark({ size = 120 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="256 256 512 512" accessibilityLabel="Magnet Eye">
      <Path d="M340.0 392.2 A247.83 247.83 0 0 1 684.0 392.2" fill="none" stroke={color.accent} strokeOpacity={0.6} strokeWidth={18} strokeLinecap="round" />
      <Path d="M684.0 631.8 A247.83 247.83 0 0 1 340.0 631.8" fill="none" stroke={color.accent} strokeOpacity={0.6} strokeWidth={18} strokeLinecap="round" />
      <Path d="M271.2 512 A279.5 279.5 0 0 1 752.8 512 A279.5 279.5 0 0 1 271.2 512 Z" fill="none" stroke={color.text} strokeWidth={30} strokeLinejoin="round" />
      <Circle cx={512} cy={512} r={111.8} fill="none" stroke={color.accent} strokeWidth={12} />
      <Path d="M509 426.05 A86.0 86.0 0 0 0 509 597.95 L509 544.54 A32.68 32.68 0 0 1 509 479.46 Z" fill={color.north} />
      <Path d="M515 426.05 A86.0 86.0 0 0 1 515 597.95 L515 544.54 A32.68 32.68 0 0 0 515 479.46 Z" fill={color.south} />
    </Svg>
  );
}

export type TabIconName = 'scan' | 'saved' | 'settings';

/** Tab bar line icons, 24 × 24, 1.8 px strokes. */
export function TabIcon({ name, tint, size = 24 }: { name: TabIconName; tint: string; size?: number }) {
  const p = { stroke: tint, strokeWidth: 1.8, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'scan' ? (
        <>
          <Path d="M2.5 12 C 6 5.5, 18 5.5, 21.5 12 C 18 18.5, 6 18.5, 2.5 12 Z" {...p} strokeLinejoin="round" />
          <Circle cx={12} cy={12} r={3.2} {...p} />
        </>
      ) : name === 'saved' ? (
        <>
          {[6, 12, 18].map((y) => (
            <Line key={y} x1={9} y1={y} x2={20} y2={y} {...p} />
          ))}
          {[6, 12, 18].map((y) => (
            <Circle key={`d${y}`} cx={4.5} cy={y} r={1.2} fill={tint} />
          ))}
        </>
      ) : (
        <>
          <Line x1={4} y1={7} x2={20} y2={7} {...p} />
          <Line x1={4} y1={17} x2={20} y2={17} {...p} />
          <Circle cx={9} cy={7} r={2.4} {...p} fill={color.bg} />
          <Circle cx={15} cy={17} r={2.4} {...p} fill={color.bg} />
        </>
      )}
    </Svg>
  );
}

/** 20 × 20 Fullscreen / Expand icon. */
export function FullscreenIcon({ size = 20, tint = color.text }: { size?: number; tint?: string }) {
  const p = { stroke: tint, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" {...p} />
    </Svg>
  );
}

/** 20 × 20 Exit Fullscreen / Compress icon. */
export function CompressIcon({ size = 20, tint = color.text }: { size?: number; tint?: string }) {
  const p = { stroke: tint, strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14L3 21" {...p} />
    </Svg>
  );
}
