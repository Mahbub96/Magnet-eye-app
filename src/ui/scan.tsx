import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line as SvgLine, Path, Polygon, Rect } from 'react-native-svg';

import { coverageGrid, extentMm, type Seg } from '../modules/capture/coverage';
import { Text } from './Text';
import { color, type } from './theme';

/** Top-down map of the paper in ruler mode (stands in for the Figma "06 Scan" camera view
 * until camera tracking, Phase 6): the magnet at the origin, recorded lines, the line to do
 * now, and the server's suggested next line. Units: mm on the paper, +y up the map. */
export function PaperMap({ done, current, suggested, height = 230 }: {
  done: Seg[];
  current: Seg | null;
  suggested: Seg | null;
  height?: number;
}) {
  const [w, setW] = useState(0);
  const all = [...done, ...(current ? [current] : []), ...(suggested ? [suggested] : [])];
  const e = extentMm(all);
  const s = Math.min(w, height) / (2 * e); // px per mm
  const X = (x: number) => w / 2 + x * s;
  const Y = (y: number) => height / 2 - y * s;
  const grid = [];
  for (let v = -e; v <= e; v += 20) {
    grid.push(<SvgLine key={`x${v}`} x1={X(v)} y1={Y(-e)} x2={X(v)} y2={Y(e)} stroke={color.border} strokeWidth={v === 0 ? 1.2 : 0.5} />);
    grid.push(<SvgLine key={`y${v}`} x1={X(-e)} y1={Y(v)} x2={X(e)} y2={Y(v)} stroke={color.border} strokeWidth={v === 0 ? 1.2 : 0.5} />);
  }
  const arrow = (l: Seg, c: string) => {
    const ang = Math.atan2(-(l.y1 - l.y0), l.x1 - l.x0);
    const x = X(l.x1);
    const y = Y(l.y1);
    const p = (a: number, r: number) => `${x - r * Math.cos(ang + a)},${y - r * Math.sin(ang + a)}`;
    return <Polygon points={`${x},${y} ${p(0.45, 10)} ${p(-0.45, 10)}`} fill={c} />;
  };
  return (
    <View
      onLayout={(ev) => setW(ev.nativeEvent.layout.width)}
      style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surface }}
      accessibilityLabel={`Map of the paper: ${done.length} lines recorded`}
    >
      {w > 0 ? (
        <Svg width={w} height={height}>
          <Rect x={0} y={0} width={w} height={height} fill={color.surface} />
          <G>{grid}</G>
          {done.map((l, i) => (
            <SvgLine key={i} x1={X(l.x0)} y1={Y(l.y0)} x2={X(l.x1)} y2={Y(l.y1)} stroke={color.good} strokeOpacity={0.6} strokeWidth={3} strokeLinecap="round" />
          ))}
          {suggested ? (
            <G>
              <SvgLine x1={X(suggested.x0)} y1={Y(suggested.y0)} x2={X(suggested.x1)} y2={Y(suggested.y1)} stroke={color.warn} strokeWidth={2} strokeDasharray="6 6" />
              {arrow(suggested, color.warn)}
            </G>
          ) : null}
          {current ? (
            <G>
              <SvgLine x1={X(current.x0)} y1={Y(current.y0)} x2={X(current.x1)} y2={Y(current.y1)} stroke={color.accent} strokeWidth={3} strokeDasharray="10 8" strokeLinecap="round" />
              {arrow(current, color.accent)}
            </G>
          ) : null}
          <Circle cx={X(0)} cy={Y(0)} r={9} fill={color.surface2} stroke={color.text} strokeWidth={1.5} />
          <Path d={`M ${X(0) - 4} ${Y(0)} a 4 4 0 0 1 8 0 Z`} fill={color.north} />
          <Path d={`M ${X(0) - 4} ${Y(0)} a 4 4 0 0 0 8 0 Z`} fill={color.south} />
        </Svg>
      ) : null}
      <Text style={[type.small, { position: 'absolute', right: 10, bottom: 8, color: color.textFaint }]}>
        grid 20 mm · origin = magnet
      </Text>
    </View>
  );
}

/** Figma coverage grid: which parts of the paper the recorded lines have passed over. */
export function CoverageGrid({ done, size = 66 }: { done: Seg[]; size?: number }) {
  const n = 6;
  const g = coverageGrid(done, extentMm(done), n);
  const cell = (size - (n - 1) * 2) / n;
  const covered = g.flat().filter(Boolean).length;
  return (
    <View accessibilityLabel={`Coverage ${covered} of ${n * n} areas`} style={{ width: size, height: size, flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
      {g.flat().map((v, i) => (
        <View key={i} style={{ width: cell, height: cell, borderRadius: 2, backgroundColor: v ? color.good : color.surface2, opacity: v ? 0.9 : 1 }} />
      ))}
    </View>
  );
}

/** Figma speed meter: this phone's good range shaded, the last swipe's speed marked (cm/s). */
export function SpeedMeter({ speed, min, max }: { speed: number | null; min: number; max: number }) {
  const top = max * 1.5;
  const [w, setW] = useState(0);
  const at = (v: number) => (Math.max(0, Math.min(top, v)) / top) * w;
  const good = speed !== null && speed >= min && speed <= max;
  const label =
    speed === null ? `aim for ${min}–${max} cm/s` : `${speed.toFixed(1)} cm/s · ${good ? 'good' : speed < min ? 'faster next time' : 'slower next time'}`;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={type.small}>Swipe speed</Text>
        <Text style={{ fontSize: 11, fontWeight: '500', color: speed === null ? color.textDim : good ? color.good : color.warn }}>
          {label}
        </Text>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 8, borderRadius: 4, backgroundColor: color.surface2 }}>
        {w > 0 ? (
          <>
            <View style={{ position: 'absolute', left: at(min), width: at(max) - at(min), height: 8, borderRadius: 4, backgroundColor: color.good + '59' }} />
            {speed !== null ? (
              <View style={{ position: 'absolute', left: at(speed) - 2, top: -3, width: 4, height: 14, borderRadius: 2, backgroundColor: color.text }} />
            ) : null}
          </>
        ) : null}
      </View>
    </View>
  );
}
