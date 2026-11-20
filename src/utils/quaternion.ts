/** Quaternions as [w, x, y, z]; a quaternion maps phone-frame vectors to the world frame. */
export type Quat = [number, number, number, number];
export type Vec3 = [number, number, number];

export function multiply(a: Quat, b: Quat): Quat {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return [
    aw * bw - ax * bx - ay * by - az * bz,
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
  ];
}

export function normalize(q: Quat): Quat {
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

/** Rotate v by q (q v q*). */
export function rotate(q: Quat, v: Vec3): Vec3 {
  const [w, x, y, z] = q;
  // t = 2 * cross(q.xyz, v); v' = v + w t + cross(q.xyz, t)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
}

export function aboutZ(angle: number): Quat {
  return [Math.cos(angle / 2), 0, 0, Math.sin(angle / 2)];
}

/** Heading of the phone's +y axis (its top) in the world xy plane, radians from world +y,
 * counter-clockwise. Well defined while the phone is not pointing straight up or down. */
export function headingOfTop(q: Quat): number {
  const top = rotate(q, [0, 1, 0]);
  return Math.atan2(-top[0], top[1]);
}

/** Average of nearby unit quaternions (sign-aligned mean, normalised). */
export function mean(qs: Quat[]): Quat {
  if (qs.length === 0) return [1, 0, 0, 0];
  const ref = qs[0];
  const acc: Quat = [0, 0, 0, 0];
  for (const q of qs) {
    const s = q[0] * ref[0] + q[1] * ref[1] + q[2] * ref[2] + q[3] * ref[3] < 0 ? -1 : 1;
    for (let i = 0; i < 4; i++) acc[i] += s * q[i];
  }
  return normalize(acc);
}
