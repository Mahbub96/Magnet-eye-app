import { expect, test } from "@jest/globals";
import { aboutZ, headingOfTop, mean, multiply, rotate, type Quat } from '../utils/quaternion';

const close = (a: number[], b: number[], tol = 1e-9) =>
  a.forEach((v, i) => expect(v).toBeCloseTo(b[i], -Math.log10(tol)));

test('matches the backend convention: yaw +90° maps phone x to world y', () => {
  // Same case as magnet-eye-backend tests/test_physics.py::test_to_world_rotation_order...
  close(rotate(aboutZ(Math.PI / 2), [10, 0, 0]), [0, 10, 0]);
});

test('multiply composes rotations (apply b, then a)', () => {
  const a = aboutZ(0.3);
  const b: Quat = [Math.cos(0.2), Math.sin(0.2), 0, 0]; // 0.4 rad about x
  const v: [number, number, number] = [0.2, -1, 0.5];
  close(rotate(multiply(a, b), v), rotate(a, rotate(b, v)));
});

test('headingOfTop reads back the yaw of a flat phone', () => {
  for (const yaw of [-2.5, -1, 0, 0.7, 3]) expect(headingOfTop(aboutZ(yaw))).toBeCloseTo(yaw, 9);
});

test('aligning by minus the heading points the top along +y', () => {
  const tilt: Quat = [Math.cos(0.05), Math.sin(0.05), 0, 0];
  const q = multiply(aboutZ(1.2), tilt);
  const aligned = multiply(aboutZ(-headingOfTop(q)), q);
  const top = rotate(aligned, [0, 1, 0]);
  expect(top[0]).toBeCloseTo(0, 9);
  expect(top[1]).toBeGreaterThan(0.99);
});

test('mean handles the q / -q sign ambiguity', () => {
  const q = aboutZ(0.4);
  const neg: Quat = [-q[0], -q[1], -q[2], -q[3]];
  close(mean([q, neg, q]), q);
});
