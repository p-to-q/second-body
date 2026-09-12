/**
 * 舞台的**最小可用版**：相机、灯、地面、背景。
 * T-09 会把它换成正经的 look dev（软阴影 / 接触阴影 / 轻 bloom / 微 DOF / IDLE 呼吸粒子）。
 * 先有一个能跑的，是为了让 main.ts 现在就能整条链路收口 —— 否则谁都不知道接起来会怎样。
 */
import * as THREE from 'three/webgpu';
import type { MotionFeatures, Presence } from '../../../core/src/types.ts';
import { SKELETON } from '../../../core/src/tuning.ts';

export interface Stage {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  update(p: Presence, m: MotionFeatures | null, dt: number): void;
  resize(w: number, h: number): void;
  dispose(): void;
}

export function createStage(): Stage {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0e0f12);

  // 1:1 等身：相机在人眼高度附近、看向胸口。等身是这类作品的全部魔法（docs/00 §6）
  const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 60);
  camera.position.set(0, SKELETON.referenceHeight * 0.62, 3.1);
  camera.lookAt(0, SKELETON.referenceHeight * 0.55, 0);

  scene.add(new THREE.HemisphereLight(0xdfe6ef, 0x191a1f, 1.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.3);
  key.position.set(1.8, 3.4, 2.6);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8fb4d8, 1.15);
  rim.position.set(-2.4, 1.6, -2.2);
  scene.add(rim);

  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(3.2, 64),
    new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  return {
    scene,
    camera,
    update(p) {
      // IDLE 时压暗，人来了提亮。**不要黑屏** —— 黑屏会让观众以为坏了（docs/05 §5）
      const alive = p.state === 'ALIVE' || p.state === 'ENTERING';
      const target = alive ? 1 : 0.35;
      key.intensity += (2.3 * target - key.intensity) * 0.05;
      rim.intensity += (1.15 * target - rim.intensity) * 0.05;
    },
    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    dispose() {
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
    },
  };
}
