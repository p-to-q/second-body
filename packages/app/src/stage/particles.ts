/**
 * 空场时的呼吸粒子团（docs/05 §5）。
 *
 * **黑屏会让观众以为坏了。** 所以没人的时候屏幕上必须有东西在缓慢地活着：
 * 地面上一团低伏的尘雾，缓慢旋转 + 呼吸。有人进场时它**聚拢成最原始形态的位置**
 * —— 粒子先摆出一具 tier 0 的身体，真身体才在同一个位置长出来。
 *
 * 实现上只有两组静态属性（散开位置 / 聚拢位置）加四个 uniform：
 * 每帧 CPU 开销是 4 次赋值，动画全在顶点着色器里。
 * 帧循环里不 new、不写大数组（docs/02 P5）。
 *
 * 随机全部来自构造时传入的 seed（P1：禁止裸用 Math.random），
 * 所以同一个 seed 的粒子团每次启动完全一样 —— 截图能复现。
 */
import * as THREE from 'three/webgpu';
import {
  attribute, cameraProjectionMatrix, clamp, cos, float, mix, modelViewMatrix,
  positionGeometry, pow, sin, smoothstep, uniform, uv, varying, vec3, vec4,
} from 'three/tsl';
import { mulberry32 } from '../../../core/src/rng.ts';
import { SKELETON, STAGE } from '../../../core/src/tuning.ts';
import type { RGB } from './look.ts';

export interface BreathField {
  readonly object: THREE.Object3D;
  /**
   * @param dt      秒，已被上游钳位
   * @param gather  0 = 散开的雾，1 = 聚成最原始形态
   * @param opacity 0..1，整体不透明度
   * @param timeScale 时间缩放（升档脉冲时的停滞感）
   */
  update(dt: number, gather: number, opacity: number, timeScale: number): void;
  setLook(color: RGB, gain: number, drift: number): void;
  /**
   * 粒子尺寸倍率。**这是"粒子几乎看不见"的直接修法**：
   * 原来的 0.016m 公告牌在 2.8m 外 45° fov 的 1600×900 画面上只有 ~7px，
   * 再乘上 0.35 的基础不透明度，一颗粒子对一个像素的贡献不到 1/255 ——
   * 它不是"淡"，是**在 8bit 输出里根本存不下来**。逆光那套要到 ~2.1 倍才读得出体积。
   */
  setSize(mul: number): void;
  /**
   * 把"聚拢形态"缩放/平移到当前这具身体所在的那个盒子里。
   * 人形以外的方案（四足是横的矮的）如果不缩，粒子会聚成一个和身体对不上的人影。
   * @param scale  相对 1.7m 人形的比例
   * @param centerY 盒子的竖直中心（米）
   */
  setBody(scale: number, centerY: number): void;
  dispose(): void;
}

export interface BreathFieldOptions {
  count?: number;
  seed?: number;
  /** 雾团半径（米） */
  radius?: number;
}

/**
 * 「最原始形态」= tier 0 的一具身体。这里只需要它的**轮廓**，
 * 所以用一组骨段 + 半径来采样，而不是去装配真部件（那是 creature.ts 的事）。
 * 坐标是站姿、身高 1.7m、面朝 +Z，与 docs/04 §2 的关节名同源。
 */
const LIMBS: Array<[[number, number, number], [number, number, number], number]> = [
  [[0, 0.94, 0], [0, 1.38, 0], 0.155],        // 躯干
  [[0, 1.38, 0], [0, 1.49, 0], 0.06],         // 颈
  [[0, 1.49, 0], [0, 1.66, 0], 0.10],         // 头
  [[0.18, 1.37, 0], [0.35, 1.11, 0.02], 0.05],   // 上臂 L
  [[-0.18, 1.37, 0], [-0.35, 1.11, 0.02], 0.05],
  [[0.35, 1.11, 0.02], [0.46, 0.87, 0.04], 0.042], // 前臂 L
  [[-0.35, 1.11, 0.02], [-0.46, 0.87, 0.04], 0.042],
  [[0.09, 0.93, 0], [0.10, 0.52, 0.01], 0.068],    // 大腿 L
  [[-0.09, 0.93, 0], [-0.10, 0.52, 0.01], 0.068],
  [[0.10, 0.52, 0.01], [0.10, 0.09, 0], 0.055],    // 小腿 L
  [[-0.10, 0.52, 0.01], [-0.10, 0.09, 0], 0.055],
];

/** 上面那副 LIMBS 的竖直中心（米）。缩放聚拢形态时绕它缩 */
const HUMAN_CENTER_Y = 0.845;

export function createBreathField(opt: BreathFieldOptions = {}): BreathField {
  const count = Math.max(16, opt.count ?? 760);
  const radius = opt.radius ?? 1.75;
  const rng = mulberry32(opt.seed ?? 0x5EC0D1);
  const scale = SKELETON.referenceHeight / 1.7;    // 比例表是按 1.7m 写的

  // 骨段按长度加权，粒子才会均匀铺在身体上而不是全挤在头上
  const lengths = LIMBS.map(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  const total = lengths.reduce((s, x) => s + x, 0);

  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const position = new Float32Array(count * 4 * 3);
  const uvs = new Float32Array(count * 4 * 2);
  const dispersed = new Float32Array(count * 4 * 3);
  const gathered = new Float32Array(count * 4 * 3);
  const rand = new Float32Array(count * 4 * 3);
  const index = new Uint32Array(count * 6);

  for (let i = 0; i < count; i++) {
    // ── 散开：地面上的一摊雾。sqrt 保证面积均匀，y 用高次幂压在地面附近 ──
    const a = rng.next() * Math.PI * 2;
    const r = radius * Math.sqrt(rng.next());
    const dy = 0.012 + 0.62 * Math.pow(rng.next(), 2.6);
    const dx = Math.cos(a) * r;
    const dz = Math.sin(a) * r * 0.8;          // 稍扁，贴合观众视角下的地面透视

    // ── 聚拢：最原始形态上的一点 ──
    let pick = rng.next() * total;
    let li = 0;
    while (li < LIMBS.length - 1 && pick > lengths[li]) { pick -= lengths[li]; li++; }
    const [p0, p1, rad] = LIMBS[li];
    const t = rng.next();
    const jx = (rng.next() * 2 - 1) * rad;
    const jy = (rng.next() * 2 - 1) * rad * 0.5;
    const jz = (rng.next() * 2 - 1) * rad;
    const gx = (p0[0] + (p1[0] - p0[0]) * t + jx) * scale;
    const gy = (p0[1] + (p1[1] - p0[1]) * t + jy) * scale;
    const gz = (p0[2] + (p1[2] - p0[2]) * t + jz) * scale;

    const phase = rng.next();
    const sizeVar = 0.55 + rng.next() * 0.9;
    const delay = rng.next();

    for (let c = 0; c < 4; c++) {
      const v = i * 4 + c;
      position[v * 3] = corners[c][0];
      position[v * 3 + 1] = corners[c][1];
      position[v * 3 + 2] = 0;
      uvs[v * 2] = (corners[c][0] + 1) / 2;
      uvs[v * 2 + 1] = (corners[c][1] + 1) / 2;
      dispersed[v * 3] = dx; dispersed[v * 3 + 1] = dy; dispersed[v * 3 + 2] = dz;
      gathered[v * 3] = gx; gathered[v * 3 + 1] = gy; gathered[v * 3 + 2] = gz;
      rand[v * 3] = phase; rand[v * 3 + 1] = sizeVar; rand[v * 3 + 2] = delay;
    }
    const o = i * 4;
    index.set([o, o + 1, o + 2, o, o + 2, o + 3], i * 6);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('aDispersed', new THREE.BufferAttribute(dispersed, 3));
  geo.setAttribute('aGathered', new THREE.BufferAttribute(gathered, 3));
  geo.setAttribute('aRand', new THREE.BufferAttribute(rand, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  // 顶点是"角偏移"不是世界坐标，包围球算出来会是个 1m 的球 —— 交给 three 剔除一定剔错
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), radius * 2.2);

  const uTime = uniform(0);
  const uGather = uniform(0);
  const uOpacity = uniform(1);
  const uSize = uniform(STAGE.particleSize);
  const uDrift = uniform(1);
  const uColor = uniform(new THREE.Vector3(0.8, 0.86, 1));   // 线性 RGB，直接当 vec3 用
  const uGain = uniform(1);
  // 聚拢形态的缩放与中心。默认 1 / 人形中心 —— 没人调 setBody 时表现和以前一模一样
  const uGatherScale = uniform(1);
  const uGatherCenter = uniform(HUMAN_CENTER_Y);

  const aDisp = attribute('aDispersed', 'vec3');
  const aGath = attribute('aGathered', 'vec3');
  const aRand = attribute('aRand', 'vec3');

  const phase = aRand.x;
  const seedAngle = phase.mul(6.2832);

  // 慢旋 + 呼吸：全部由 uTime 驱动，uTime 只从上游 dt 累加（P1：模块内不读时钟）
  const spin = uTime.mul(uDrift.mul(0.05).add(phase.mul(0.03)));
  const breath = float(1).add(sin(uTime.mul(0.33).add(seedAngle)).mul(0.09));
  const cs = cos(spin);
  const sn = sin(spin);
  const driftY = sin(uTime.mul(0.5).add(seedAngle.mul(1.5))).mul(0.03);
  const dispersedPos = vec3(
    aDisp.x.mul(cs).sub(aDisp.z.mul(sn)).mul(breath),
    aDisp.y.add(driftY),
    aDisp.x.mul(sn).add(aDisp.z.mul(cs)).mul(breath),
  );

  // 每颗粒子各自延迟一点点再出发 —— 同时到位会像一次开关，不像"聚拢"
  const k = smoothstep(aRand.z.mul(0.45), aRand.z.mul(0.45).add(0.55), uGather);
  // 聚拢位置按当前身体的盒子缩放（绕人形中心缩，再挪到身体中心）
  const gathered3 = vec3(
    aGath.x.mul(uGatherScale),
    aGath.y.sub(float(HUMAN_CENTER_Y)).mul(uGatherScale).add(uGatherCenter),
    aGath.z.mul(uGatherScale),
  );
  const center = mix(dispersedPos, gathered3, k);

  const mv = modelViewMatrix.mul(vec4(center, 1));
  const size = uSize.mul(aRand.y).mul(float(0.6).add(k.mul(0.5)));
  // position 里存的是"角偏移"(±1,±1,0) 而不是世界坐标：
  // 在视图空间里加这一个偏移 = 永远正对镜头的公告牌，不需要每帧算朝向
  const corner = positionGeometry.mul(size);

  const mat = new THREE.MeshBasicNodeMaterial();
  mat.vertexNode = cameraProjectionMatrix.mul(vec4(mv.xyz.add(corner), 1));
  const vPhase = varying(phase);
  const vK = varying(k);
  const d = uv().sub(0.5).mul(2).length();
  const falloff = pow(clamp(float(1).sub(d), 0, 1), 2.4);
  mat.colorNode = uColor.mul(uGain).mul(float(0.55).add(vPhase.mul(0.7)));
  // 聚拢的时候亮一点：它正在变成一具身体，应该看得出在"用力"
  mat.opacityNode = falloff.mul(uOpacity).mul(float(0.35).add(vPhase.mul(0.45))).mul(float(1).add(vK.mul(0.6)));
  mat.transparent = true;
  mat.depthWrite = false;
  mat.blending = THREE.AdditiveBlending;
  mat.side = THREE.DoubleSide;
  mat.toneMapped = true;

  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'breath-field';
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.matrixAutoUpdate = false;

  let t = 0;
  return {
    object: mesh,
    update(dt, gather, opacity, timeScale) {
      t += dt * timeScale;
      uTime.value = t;
      uGather.value = gather;
      uOpacity.value = opacity;
      mesh.visible = opacity > 0.002;
    },
    setBody(scale, centerY) {
      uGatherScale.value = scale;
      uGatherCenter.value = centerY;
    },
    setLook(color, gain, drift) {
      uColor.value.set(color[0], color[1], color[2]);
      uGain.value = gain;
      uDrift.value = drift;
    },
    setSize(m) { uSize.value = STAGE.particleSize * Math.max(0.1, m); },
    dispose() {
      geo.dispose();
      mat.dispose();
    },
  };
}
