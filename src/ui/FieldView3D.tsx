/* eslint-disable react/no-unknown-property -- react-three-fiber elements take three.js props */
import { Canvas, useFrame, useThree } from '@react-three/fiber/native';
import { GLView } from 'expo-gl';
import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import * as THREE from 'three';

import type { FullResult } from '../api/result';
import { color } from './theme';

/** Figma "07 Results": field lines coloured by strength, the magnetisation as voxels (red =
 * north up, blue = south up, opacity = strength) and the paper plane. Drag to rotate, pinch
 * to zoom. Scene units are centimetres around the magnet's centre. */
export type FieldViewHandle = { snapshot: () => Promise<string | null> };

const CM = 100;

function strengthColour(t: number): THREE.Color {
  // accent (weak) -> warn (strong), the design's two tones for field strength
  return new THREE.Color(color.accent).lerp(new THREE.Color(color.warn), Math.max(0, Math.min(1, t)));
}

function Scene({ r, orbit }: { r: FullResult; orbit: { current: { az: number; el: number; dist: number } } }) {
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
    const { az, el, dist } = orbit.current;
    camera.position.set(dist * Math.cos(el) * Math.sin(az), dist * Math.sin(el), dist * Math.cos(el) * Math.cos(az));
    camera.lookAt(0, 0, 0);
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

/** Camera angles and distance (radians, cm) changed by drag and pinch. Kept outside React
 * state: the gestures write it and the render loop reads it every frame. */
function createOrbit() {
  const view = { current: { az: 0.6, el: 0.55, dist: 22 } };
  const start = { az: 0, el: 0, dist: 0 };
  const pan = Gesture.Pan()
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      view.current.az = start.az - e.translationX * 0.008;
      view.current.el = Math.max(-0.1, Math.min(1.45, start.el + e.translationY * 0.008));
    });
  const pinch = Gesture.Pinch()
    .runOnJS(true)
    .onBegin(() => Object.assign(start, view.current))
    .onUpdate((e) => {
      view.current.dist = Math.max(6, Math.min(60, start.dist / e.scale));
    });
  return { view, gesture: Gesture.Simultaneous(pan, pinch) };
}

export const FieldView3D = forwardRef<FieldViewHandle, { result: FullResult; height?: number }>(function FieldView3D(
  { result, height = 360 },
  ref,
) {
  const [orbit] = useState(createOrbit);
  const glRef = useRef<WebGLRenderingContext | null>(null);

  useImperativeHandle(ref, () => ({
    snapshot: async () => {
      if (!glRef.current) return null;
      const snap = await GLView.takeSnapshotAsync(glRef.current as never, { format: 'png' });
      return typeof snap.uri === 'string' ? snap.uri : null;
    },
  }));

  return (
    <GestureDetector gesture={orbit.gesture}>
      <View style={{ height, borderRadius: 20, overflow: 'hidden', backgroundColor: color.surface }}>
        <Canvas
          camera={{ fov: 45, near: 0.1, far: 500, position: [10, 10, 15] }}
          onCreated={({ gl }) => {
            glRef.current = gl.getContext() as WebGLRenderingContext;
            gl.setClearColor(new THREE.Color(color.surface));
          }}
        >
          <Scene r={result} orbit={orbit.view} />
        </Canvas>
      </View>
    </GestureDetector>
  );
});
