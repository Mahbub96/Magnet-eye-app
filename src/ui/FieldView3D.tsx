/* eslint-disable react/no-unknown-property -- react-three-fiber elements take three.js props */
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { GLView } from 'expo-gl';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line as SvgLine, Rect as SvgRect } from 'react-native-svg';
import * as THREE from 'three';

import type { FullResult } from '../api/result';
import { ErrorBoundary } from './ErrorBoundary';
import { CompressIcon, FullscreenIcon } from './icons';
import { Text } from './Text';
import { color, space, type } from './theme';

export type FieldViewHandle = { snapshot: () => Promise<string | null> };

const CM = 100;

function strengthColour(t: number): THREE.Color {
  const safeT = isFinite(t) ? Math.max(0, Math.min(1, t)) : 0;
  return new THREE.Color(color.accent).lerp(new THREE.Color(color.warn), safeT);
}

type OrbitState = {
  current: { az: number; el: number; dist: number; panX: number; panY: number };
};

function Scene({ r, orbit }: { r: FullResult; orbit: OrbitState }) {
  const cx = isFinite(r.magnet?.centre_m?.[0]) ? r.magnet.centre_m[0] : 0;
  const cy = isFinite(r.magnet?.centre_m?.[1]) ? r.magnet.centre_m[1] : 0;
  const cz = isFinite(r.magnet?.centre_m?.[2]) ? r.magnet.centre_m[2] : -0.04;

  const to = (p: number[]) => {
    const x = isFinite(p?.[0]) ? p[0] : 0;
    const y = isFinite(p?.[1]) ? p[1] : 0;
    const z = isFinite(p?.[2]) ? p[2] : 0;
    return new THREE.Vector3((x - cx) * CM, (z - cz) * CM, -(y - cy) * CM);
  };

  const linesGroup = useMemo(() => {
    const group = new THREE.Group();
    if (!r.field_lines_m || !Array.isArray(r.field_lines_m) || r.field_lines_m.length === 0) {
      return group;
    }
    const dist = (p: number[]) => Math.hypot((p?.[0] ?? 0) - cx, (p?.[1] ?? 0) - cy, (p?.[2] ?? 0) - cz);
    const validPoints = r.field_lines_m.flatMap((l) => (Array.isArray(l) ? l : [])).filter((p) => p && p.length >= 3);
    if (validPoints.length === 0) return group;

    // Use reduce instead of Math.min(...spread) to avoid call stack overflow on large point sets
    const rawMin = validPoints.reduce((min, p) => {
      const d = dist(p);
      return isFinite(d) && d > 0 ? Math.min(min, d) : min;
    }, Infinity);
    const dMin = isFinite(rawMin) && rawMin > 0 ? Math.max(rawMin, 1e-3) : 1e-3;

    r.field_lines_m
      .filter((l) => Array.isArray(l) && l.length > 1)
      .forEach((l) => {
        try {
          const points = l.map(to);
          const g = new THREE.BufferGeometry().setFromPoints(points);
          const cols: number[] = [];
          for (const p of l) {
            const d = dist(p);
            const ratio = isFinite(d) && d > 0 ? (dMin / Math.max(d, dMin)) ** 3 : 0;
            const c = strengthColour(ratio);
            cols.push(c.r, c.g, c.b);
          }
          g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
          const line = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true }));
          group.add(line);
        } catch (e) {
          console.warn('[FieldView3D] Error building field line:', e);
        }
      });
    return group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, cx, cy, cz]);

  // Clean up lines on unmount or update
  useEffect(() => {
    return () => {
      linesGroup.traverse((child) => {
        if (child instanceof THREE.Line) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    };
  }, [linesGroup]);

  const voxelsGroup = useMemo(() => {
    const group = new THREE.Group();
    const m = r.magnetisation;
    if (!m || !Array.isArray(m.m_a_per_m) || !Array.isArray(m.voxel_centres_m)) {
      return group;
    }
    const mags = m.m_a_per_m.map((v) => (v && v.length >= 3 ? Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) : 0));
    // Use reduce instead of Math.max(...spread) to avoid call stack overflow
    const max = mags.reduce((mx, v) => (isFinite(v) && v > mx ? v : mx), 1);
    const voxelSize = isFinite(m.voxel_size_m) && m.voxel_size_m > 0 ? m.voxel_size_m : 0.005;
    const size = voxelSize * CM;
    const geo = new THREE.BoxGeometry(size * 0.92, size * 0.92, size * 0.92);

    m.voxel_centres_m.forEach((c, i) => {
      if (!c || !m.m_a_per_m[i]) return;
      const s = (mags[i] ?? 0) / max;
      if (s < 0.15) return; // weak voxels would only cloud the picture
      const isNorth = (m.m_a_per_m[i][2] ?? 0) >= 0;
      const mat = new THREE.MeshBasicMaterial({
        color: isNorth ? color.north : color.south,
        transparent: true,
        opacity: Math.min(0.85, 0.25 + 0.6 * s),
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(to(c));
      group.add(mesh);
    });
    return group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, cx, cy, cz]);

  // Clean up voxels on unmount or update
  useEffect(() => {
    return () => {
      voxelsGroup.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    };
  }, [voxelsGroup]);

  const paper = useMemo(() => {
    const g = new THREE.GridHelper(16, 16, color.border, color.surface2);
    g.position.y = isFinite(cz) ? -cz * CM : 0;
    return g;
  }, [cz]);

  const { camera } = useThree();
  useFrame(() => {
    if (!camera) return;
    const { az, el, dist, panX, panY } = orbit.current;
    const safeDist = isFinite(dist) ? dist : 22;
    const safeAz = isFinite(az) ? az : 0.6;
    const safeEl = isFinite(el) ? el : 0.55;
    const safePanX = isFinite(panX) ? panX : 0;
    const safePanY = isFinite(panY) ? panY : 0;

    const eyeX = safePanX + safeDist * Math.cos(safeEl) * Math.sin(safeAz);
    const eyeY = safePanY + safeDist * Math.sin(safeEl);
    const eyeZ = safeDist * Math.cos(safeEl) * Math.cos(safeAz);
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(safePanX, safePanY, 0);
  });

  return (
    <>
      <primitive object={paper} />
      <primitive object={voxelsGroup} />
      <primitive object={linesGroup} />
    </>
  );
}

/** Camera angles, distance and pan targets changed by gestures. */
function createOrbit() {
  const view: OrbitState = { current: { az: 0.6, el: 0.55, dist: 22, panX: 0, panY: 0 } };
  const start = { az: 0, el: 0, dist: 0, panX: 0, panY: 0 };

  const reset = () => {
    view.current.az = 0.6;
    view.current.el = 0.55;
    view.current.dist = 22;
    view.current.panX = 0;
    view.current.panY = 0;
  };

  const orbitGesture = Gesture.Pan()
    .maxPointers(1)
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      view.current.az = start.az - e.translationX * 0.008;
      view.current.el = Math.max(-1.4, Math.min(1.45, start.el + e.translationY * 0.008));
    });

  const panGesture = Gesture.Pan()
    .minPointers(2)
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      const scale = (view.current.dist / 22) * 0.04;
      view.current.panX = start.panX - e.translationX * scale;
      view.current.panY = start.panY + e.translationY * scale;
    });

  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      const s = isFinite(e.scale) && e.scale > 0 ? e.scale : 1;
      view.current.dist = Math.max(4, Math.min(80, start.dist / s));
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .runOnJS(true)
    .onEnd(reset);

  return {
    view,
    reset,
    gesture: Gesture.Race(doubleTap, Gesture.Simultaneous(orbitGesture, panGesture, pinch)),
  };
}

/** Native 2D Top-Down Projection fallback when WebGL is unavailable or encounters context errors. */
export function FieldView2D({ result, height = 360 }: { result: FullResult; height?: number }) {
  const [w, setW] = useState(300);
  const H = height;
  const cx = w / 2;
  const cy = H / 2;
  const scale = 1800; // mm to screen pixels

  const voxels = useMemo(() => {
    const m = result.magnetisation;
    if (!m?.voxel_centres_m || !m.m_a_per_m) return [];
    const mags = m.m_a_per_m.map((v) => (v ? Math.hypot(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0) : 0));
    const max = mags.reduce((mx, v) => (isFinite(v) && v > mx ? v : mx), 1);
    return m.voxel_centres_m
      .map((c, i) => {
        const s = (mags[i] ?? 0) / max;
        if (s < 0.15) return null;
        const isNorth = (m.m_a_per_m[i]?.[2] ?? 0) >= 0;
        return {
          x: cx + (c[0] ?? 0) * scale,
          y: cy - (c[1] ?? 0) * scale,
          color: isNorth ? color.north : color.south,
          opacity: Math.min(0.9, 0.3 + 0.6 * s),
          size: Math.max(4, (m.voxel_size_m ?? 0.005) * scale * 0.9),
        };
      })
      .filter(Boolean);
  }, [result, cx, cy, scale]);

  return (
    <View
      style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surface, justifyContent: 'center' }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
    >
      <Svg width={w} height={H}>
        {/* Grid lines */}
        {[-80, -40, 0, 40, 80].map((offset) => (
          <SvgLine
            key={`h-${offset}`}
            x1={0}
            y1={cy + offset}
            x2={w}
            y2={cy + offset}
            stroke={color.border}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}
        {[-80, -40, 0, 40, 80].map((offset) => (
          <SvgLine
            key={`v-${offset}`}
            x1={cx + offset}
            y1={0}
            x2={cx + offset}
            y2={H}
            stroke={color.border}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}

        {/* 2D Voxel projections */}
        {voxels.map((v, i) =>
          v ? (
            <SvgRect
              key={i}
              x={v.x - v.size / 2}
              y={v.y - v.size / 2}
              width={v.size}
              height={v.size}
              fill={v.color}
              opacity={v.opacity}
              rx={2}
            />
          ) : null,
        )}

        {/* Magnet Centre Indicator */}
        <Circle cx={cx} cy={cy} r={4} fill={color.warn} />
      </Svg>

      <View style={styles.fallbackPill}>
        <Text style={[type.small, { color: color.textDim, fontSize: 11 }]}>
          2D Projection Mode (WebGL Fallback)
        </Text>
      </View>
    </View>
  );
}

const FieldView3DInner = forwardRef<FieldViewHandle, { result: FullResult; height?: number }>(
  function FieldView3DInner({ result, height = 360 }, ref) {
    const [orbit] = useState(createOrbit);
    const [fullscreen, setFullscreen] = useState(false);
    const [webglFailed, setWebglFailed] = useState(false);
    const glRef = useRef<WebGLRenderingContext | null>(null);

    useImperativeHandle(ref, () => ({
      snapshot: async () => {
        if (!glRef.current) return null;
        try {
          const snap = await GLView.takeSnapshotAsync(glRef.current as never, { format: 'png' });
          return typeof snap.uri === 'string' ? snap.uri : null;
        } catch {
          return null;
        }
      },
    }));

    if (webglFailed) {
      return <FieldView2D result={result} height={height} />;
    }

    return (
      <View
        style={
          fullscreen
            ? styles.fullscreenOverlay
            : { height, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surface }
        }
      >
        {/* Single persistent GestureDetector & Canvas: NEVER unmounts during fullscreen toggles */}
        <GestureDetector gesture={orbit.gesture}>
          <View style={StyleSheet.absoluteFill}>
            <Canvas
              camera={{ fov: 45, near: 0.1, far: 500, position: [10, 10, 15] }}
              onCreated={({ gl }) => {
                try {
                  glRef.current = gl.getContext() as WebGLRenderingContext;
                  gl.setClearColor(new THREE.Color(color.surface));
                } catch (e) {
                  console.warn('[FieldView3D] WebGL onCreated error:', e);
                  setWebglFailed(true);
                }
              }}
            >
              <Scene r={result} orbit={orbit.view} />
            </Canvas>
          </View>
        </GestureDetector>

        {/* Inline expand controls (visible when not fullscreen) */}
        {!fullscreen ? (
          <View style={styles.inlineOverlay}>
            <Pressable
              onPress={() => setFullscreen(true)}
              style={styles.iconButton}
              hitSlop={8}
              accessibilityLabel="Open Fullscreen"
            >
              <FullscreenIcon size={18} tint={color.text} />
            </Pressable>
          </View>
        ) : (
          /* Fullscreen In-Tree Overlay Controls (No native Modal = Zero context destruction crash) */
          <SafeAreaView style={styles.fullscreenControls} pointerEvents="box-none">
            <View style={styles.fullscreenHeader}>
              <Pressable onPress={() => setFullscreen(false)} style={styles.glassButton} hitSlop={10}>
                <CompressIcon size={18} tint={color.text} />
                <Text style={[type.small, { fontWeight: '600' }]}>Close</Text>
              </Pressable>

              <Pressable onPress={orbit.reset} style={styles.glassButton} hitSlop={10}>
                <Text style={[type.small, { color: color.accent, fontWeight: '600' }]}>⟲ Reset</Text>
              </Pressable>
            </View>

            <View style={styles.fullscreenHint}>
              <Text style={[type.small, { color: color.textDim, fontSize: 12 }]}>
                Drag: Orbit • 2-finger: Pan • Pinch: Zoom • 2-tap: Reset
              </Text>
            </View>
          </SafeAreaView>
        )}
      </View>
    );
  },
);

/** Exported bulletproof FieldView3D wrapped in ErrorBoundary with automatic 2D fallback */
export const FieldView3D = forwardRef<FieldViewHandle, { result: FullResult; height?: number }>(
  function SafeFieldView3D(props, ref) {
    return (
      <ErrorBoundary fallback={<FieldView2D result={props.result} height={props.height} />}>
        <FieldView3DInner {...props} ref={ref} />
      </ErrorBoundary>
    );
  },
);

const styles = StyleSheet.create({
  inlineOverlay: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    flexDirection: 'row',
    gap: space.xs,
    zIndex: 5,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: space.xs + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    zIndex: 99999,
    elevation: 99,
    backgroundColor: color.surface,
  },
  fullscreenControls: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: space.md,
  },
  fullscreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: space.sm,
  },
  glassButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(13, 14, 18, 0.85)',
    paddingVertical: space.xs + 2,
    paddingHorizontal: space.sm + 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
  },
  fullscreenHint: {
    alignSelf: 'center',
    backgroundColor: 'rgba(13, 14, 18, 0.85)',
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.sm,
  },
  fallbackPill: {
    position: 'absolute',
    bottom: space.sm,
    alignSelf: 'center',
    backgroundColor: 'rgba(20, 22, 28, 0.85)',
    paddingVertical: 4,
    paddingHorizontal: space.sm,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
  },
});
