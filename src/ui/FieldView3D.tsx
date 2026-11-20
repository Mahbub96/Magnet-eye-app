/* eslint-disable react/no-unknown-property -- react-three-fiber elements take three.js props */
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { GLView } from 'expo-gl';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, SafeAreaView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';

import type { FullResult } from '../api/result';
import { CompressIcon, FullscreenIcon } from './icons';
import { Text } from './Text';
import { color, space, type } from './theme';

/** Figma "07 Results": field lines coloured by strength, the magnetisation as voxels (red =
 * north up, blue = south up, opacity = strength) and the paper plane.
 * - 1-finger drag: Orbit in any direction simultaneously
 * - 2-finger drag: Pan / scroll simultaneously in any direction
 * - Pinch: Zoom in and out
 * - Double tap: Reset view to centre
 * - Fullscreen toggle button to view in immersive mode.
 */
export type FieldViewHandle = { snapshot: () => Promise<string | null> };

const CM = 100;

function strengthColour(t: number): THREE.Color {
  // accent (weak) -> warn (strong), the design's two tones for field strength
  return new THREE.Color(color.accent).lerp(new THREE.Color(color.warn), Math.max(0, Math.min(1, t)));
}

type OrbitState = {
  current: { az: number; el: number; dist: number; panX: number; panY: number };
};

function Scene({ r, orbit }: { r: FullResult; orbit: OrbitState }) {
  const centre = r.magnet.centre_m;
  const to = (p: number[]) => new THREE.Vector3((p[0] - centre[0]) * CM, (p[2] - centre[2]) * CM, -(p[1] - centre[1]) * CM);

  const lines = useMemo(() => {
    // A dipole-like field falls off as 1/d³: colour each point by (d_min / d)³, so the
    // strongest part of every line is warm and the far ends cool.
    const dist = (p: number[]) => Math.hypot(p[0] - centre[0], p[1] - centre[1], p[2] - centre[2]);
    const dMin = Math.max(Math.min(...r.field_lines_m.flat().map(dist)), 1e-3);
    return r.field_lines_m
      .filter((l) => l.length > 1)
      .map((l) => {
        const g = new THREE.BufferGeometry().setFromPoints(l.map(to));
        const cols = l.flatMap((p) => {
          const c = strengthColour((dMin / Math.max(dist(p), dMin)) ** 3);
          return [c.r, c.g, c.b];
        });
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        return new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  const voxels = useMemo(() => {
    const m = r.magnetisation;
    const mags = m.m_a_per_m.map((v) => Math.hypot(v[0], v[1], v[2]));
    const max = Math.max(...mags, 1);
    const size = m.voxel_size_m * CM;
    const geo = new THREE.BoxGeometry(size * 0.92, size * 0.92, size * 0.92);
    const group = new THREE.Group();
    m.voxel_centres_m.forEach((c, i) => {
      const s = mags[i] / max;
      if (s < 0.15) return; // weak voxels would only cloud the picture
      const mat = new THREE.MeshBasicMaterial({
        color: m.m_a_per_m[i][2] >= 0 ? color.north : color.south,
        transparent: true,
        opacity: 0.25 + 0.6 * s,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(to(c));
      group.add(mesh);
    });
    return group;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r]);

  const paper = useMemo(() => {
    const g = new THREE.GridHelper(16, 16, color.border, color.surface2);
    g.position.y = -centre[2] * CM;
    return g;
  }, [centre]);

  const { camera } = useThree();
  useFrame(() => {
    const { az, el, dist, panX, panY } = orbit.current;
    const eyeX = panX + dist * Math.cos(el) * Math.sin(az);
    const eyeY = panY + dist * Math.sin(el);
    const eyeZ = dist * Math.cos(el) * Math.cos(az);
    camera.position.set(eyeX, eyeY, eyeZ);
    camera.lookAt(panX, panY, 0);
  });

  return (
    <>
      <primitive object={paper} />
      <primitive object={voxels} />
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
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

  // 1-finger: Orbit in any direction simultaneously
  const orbitGesture = Gesture.Pan()
    .maxPointers(1)
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      view.current.az = start.az - e.translationX * 0.008;
      view.current.el = Math.max(-1.4, Math.min(1.45, start.el + e.translationY * 0.008));
    });

  // 2-finger: Pan / scroll simultaneously in any direction
  const panGesture = Gesture.Pan()
    .minPointers(2)
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      const scale = (view.current.dist / 22) * 0.04;
      view.current.panX = start.panX - e.translationX * scale;
      view.current.panY = start.panY + e.translationY * scale;
    });

  // Pinch: Zoom in and out
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      view.current.dist = Math.max(4, Math.min(80, start.dist / e.scale));
    });

  // Double tap: Reset view
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

export const FieldView3D = forwardRef<FieldViewHandle, { result: FullResult; height?: number }>(function FieldView3D(
  { result, height = 360 },
  ref,
) {
  const [orbit] = useState(createOrbit);
  const [fullscreen, setFullscreen] = useState(false);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      if (!glRef.current) return null;
      const snap = await GLView.takeSnapshotAsync(glRef.current as never, { format: 'png' });
      return typeof snap.uri === 'string' ? snap.uri : null;
    },
  }));

  const canvasContent = (
    <Canvas
      camera={{ fov: 45, near: 0.1, far: 500, position: [10, 10, 15] }}
      onCreated={({ gl }) => {
        glRef.current = gl.getContext() as WebGLRenderingContext;
        gl.setClearColor(new THREE.Color(color.surface));
      }}
    >
      <Scene r={result} orbit={orbit.view} />
    </Canvas>
  );

  return (
    <>
      <GestureDetector gesture={orbit.gesture}>
        <View style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surface }}>
          {canvasContent}

          {/* Top overlay controls */}
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
        </View>
      </GestureDetector>

      {/* Fullscreen Interactive 3D Modal */}
      <Modal visible={fullscreen} animationType="fade" statusBarTranslucent onRequestClose={() => setFullscreen(false)}>
        <SafeAreaView style={styles.fullscreenContainer}>
          <GestureDetector gesture={orbit.gesture}>
            <View style={StyleSheet.absoluteFill}>{canvasContent}</View>
          </GestureDetector>

          {/* Fullscreen Header Overlay */}
          <View style={styles.fullscreenHeader}>
            <Pressable onPress={() => setFullscreen(false)} style={styles.glassButton} hitSlop={10}>
              <CompressIcon size={18} tint={color.text} />
              <Text style={[type.small, { fontWeight: '600' }]}>Close</Text>
            </Pressable>

            <Pressable onPress={orbit.reset} style={styles.glassButton} hitSlop={10}>
              <Text style={[type.small, { color: color.accent, fontWeight: '600' }]}>⟲ Reset</Text>
            </Pressable>
          </View>

          {/* Fullscreen Hint Pill */}
          <View style={styles.fullscreenHint}>
            <Text style={[type.small, { color: color.textDim, fontSize: 12 }]}>
              Drag: Orbit • 2-finger: Pan • Pinch: Zoom • 2-tap: Reset
            </Text>
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  inlineOverlay: {
    position: 'absolute',
    top: space.sm,
    right: space.sm,
    flexDirection: 'row',
    gap: space.xs,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: space.xs + 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: color.surface,
  },
  fullscreenHeader: {
    position: 'absolute',
    top: 48,
    left: space.md,
    right: space.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
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
    position: 'absolute',
    bottom: 36,
    alignSelf: 'center',
    backgroundColor: 'rgba(13, 14, 18, 0.85)',
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
  },
});
