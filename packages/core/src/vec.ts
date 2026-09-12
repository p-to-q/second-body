/** 极小向量/矩阵工具。零依赖，纯函数，全部就地或返回新值（有 out 参数的就地）。 */
import type { Vec3, Mat4 } from './types.ts';

export const v3 = (x = 0, y = 0, z = 0): Vec3 => [x, y, z];
export const clone = (a: Vec3): Vec3 => [a[0], a[1], a[2]];
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const mid = (a: Vec3, b: Vec3): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 =>
  [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
}

/** 输入不可信（P2）：任何非有限分量都替换成 fallback */
export function sane(a: Vec3, fallback: Vec3 = [0, 0, 0]): Vec3 {
  return [
    Number.isFinite(a[0]) ? a[0] : fallback[0],
    Number.isFinite(a[1]) ? a[1] : fallback[1],
    Number.isFinite(a[2]) ? a[2] : fallback[2],
  ];
}

export const identity = (): Mat4 => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];

/** 列主序 Mat4 × (x,y,z,1) */
export function applyMat4(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const w = m[3] * x + m[7] * y + m[11] * z + m[15] || 1;
  return [
    (m[0] * x + m[4] * y + m[8] * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9] * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

export type Quat = [number, number, number, number]; // x,y,z,w

/** three.js setFromUnitVectors 的等价实现。from/to 必须已归一化。 */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  let r = dot(from, to) + 1;
  let x: number, y: number, z: number;
  if (r < 1e-8) {
    // 反向：任选一条与 from 垂直的轴转 180°
    r = 0;
    if (Math.abs(from[0]) > Math.abs(from[2])) { x = -from[1]; y = from[0]; z = 0; }
    else { x = 0; y = -from[2]; z = from[1]; }
  } else {
    x = from[1] * to[2] - from[2] * to[1];
    y = from[2] * to[0] - from[0] * to[2];
    z = from[0] * to[1] - from[1] * to[0];
  }
  const l = Math.hypot(x, y, z, r) || 1;
  return [x / l, y / l, z / l, r / l];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export const quatFromAxisY = (angle: number): Quat => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];

/** three.js Matrix4.compose，列主序写入 out */
export function compose(pos: Vec3, q: Quat, s: Vec3, out: Mat4): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx;      out[2] = (xz - wy) * sx;      out[3] = 0;
  out[4] = (xy - wz) * sy;       out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy;      out[7] = 0;
  out[8] = (xz + wy) * sz;       out[9] = (yz - wx) * sz;      out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
  out[12] = pos[0];              out[13] = pos[1];             out[14] = pos[2];              out[15] = 1;
  return out;
}
