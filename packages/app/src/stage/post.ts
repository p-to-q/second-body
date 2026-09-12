/**
 * 后期：轻 bloom / 微 DOF / AO / 暗角 / 一点点颗粒。
 *
 * **轻是关键词。** 这件作品的气质是克制的影棚感，不是赛博朋克：
 * 后期在这里的任务只有一个 —— 让一具刚体拼起来的身体看上去是被**拍下来**的，
 * 而不是被渲染出来的。任何一项调到能被单独看见，就已经过了。
 *
 * `?nopost=1` 整条关掉（排查性能用），此时 `createPost` 根本不会被调用。
 *
 * 用的是 three 自带 addons 里的节点（不是新依赖，import 路径写全）：
 *   - `three/examples/jsm/tsl/display/BloomNode.js`
 *   - `three/examples/jsm/tsl/display/DepthOfFieldNode.js`
 *   - `three/examples/jsm/tsl/display/GTAONode.js`
 *
 * ⚠️ 接入方式：RenderPipeline 必须**替代** `renderer.render(scene, camera)`。
 * 所以后期只有在 `stage.render(renderer)` 被调用时才生效（见 stage.ts 的说明）。
 */
import * as THREE from 'three/webgpu';
import { POST } from '../../../core/src/tuning.ts';
import type Node from 'three/src/nodes/core/Node.js';
import {
  clamp, float, mix, mrt, nodeObject, normalView, output, pass, rand, screenUV, uniform, vec2, vec4,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { dof } from 'three/examples/jsm/tsl/display/DepthOfFieldNode.js';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { fxaa } from 'three/examples/jsm/tsl/display/FXAANode.js';
import type { LookProfile } from './look.ts';

export interface PostOptions {
  /** 对焦距离（米）。等于相机到身体的距离 */
  focusDistance: number;
  bloomRadius: number;
  /** 焦深范围（米）：离焦平面这么远才完全糊掉 */
  focalLength: number;
  bokehScale: number;
  vignette: number;
  grain: number;
  /** AO 半分辨率 + 少采样，这一项最容易吃掉预算 */
  aoSamples: number;
  aoRadius: number;
  aoResolutionScale: number;
}

export const POST_DEFAULTS: PostOptions = POST;


export interface PostChain {
  render(): void;
  setLook(look: LookProfile): void;
  /** 每帧推进一点，只用来给颗粒换种子 */
  tick(dt: number): void;
  dispose(): void;
}

/**
 * @returns 建好的后期链；**任何一步失败都返回 null**（调用方退回直出）。
 *          现场白屏是最糟的失败（P3），后期不值得为它冒险。
 */
export function createPost(
  renderer: THREE.Renderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  opt: PostOptions = POST_DEFAULTS,
): PostChain | null {
  try {
    // ⚠️ `samples: 0` 不是随手写的。默认这一趟会继承渲染器的 MSAA，
    // 于是深度贴图变成 `texture_depth_multisampled_2d`，GTAO 里的 `textureGather`
    // 对它没有重载 —— WebGPU 会把整条 AO 管线判为无效，控制台刷
    // 「Invalid ShaderModule "fragment_GTAO"」，画面**不报错、只是没有 AO**。
    // 这种"悄悄坏掉"最贵：查了半小时才看见。单采样 + 末尾 FXAA 是标准解法。
    const scenePass = pass(scene, camera, { samples: 0 });
    // 一趟几何：颜色 + 法线一起出，AO 拿它们算。
    // GTAO 的官方例子用两趟（prepass + scene pass），那是为了把 AO 喂进光照；
    // 我们只要"轻 AO"，多一趟几何不值这个价钱（30 实例 89k 三角也是钱）。
    scenePass.setMRT(mrt({ output, normal: normalView }));

    const color = scenePass.getTextureNode('output');
    const depth = scenePass.getTextureNode('depth');
    const normal = scenePass.getTextureNode('normal');

    const uAo = uniform(0.5);
    const uBloom = uniform(0.16);
    const uVignette = uniform(opt.vignette);
    const uGrain = uniform(opt.grain);
    const uNoise = uniform(0);
    const uFocus = uniform(opt.focusDistance);
    const uFocal = uniform(opt.focalLength);
    const uBokeh = uniform(opt.bokehScale);

    const aoPass = ao(depth, normal, camera);
    aoPass.resolutionScale = opt.aoResolutionScale;
    aoPass.samples.value = opt.aoSamples;
    aoPass.radius.value = opt.aoRadius;
    aoPass.distanceExponent.value = 1.4;
    aoPass.scale.value = 1.0;
    const aoValue = aoPass.getTextureNode().sample(screenUV).r;
    const occluded = color.mul(mix(float(1), aoValue, uAo));

    // 微 DOF：焦平面就是身体所在的那个平面，地面近端和背景各糊一点点。
    // 这是"等身"读数的关键之一 —— 全画面全焦的图像看上去永远像 CG。
    // ⚠️ `dof()` 在 @types/three 里的返回类型是**裸的** `DepthOfFieldNode`，
    // 不带 `Node<'vec4'>` 那套运算扩展，所以 `.add()` / `vec4()` 都接不上它
    // （T-09 中断时剩下的那个红点就是这个）。这是上游类型的缺口，不是我们的用法不对：
    // DOF 的输出在着色器里确实是一个 vec4 颜色。所以这里**只在这一处**标注回来。
    const dofNode = dof(occluded, scenePass.getViewZNode(), uFocus, uFocal, uBokeh) as unknown as Node<'vec4'>;
    const focused = vec4(nodeObject(dofNode));

    // bloom 取的是原始场景色（没过 AO/DOF）：这是标准接法，也避免把计算节点
    // 再喂进一条多级降采样链
    const bloomPass = bloom(color, 0.16, opt.bloomRadius, 0.8);
    bloomPass.strength = uBloom;

    let out = focused.add(vec4(nodeObject(bloomPass)));

    // 升档脉冲（docs/23 §S5）**不在这里做**：那是"全身亮 8%"，靠灯的强度实现（stage.ts）。
    // 在后期里给整屏加一个常数会把背景也一起提亮，读起来是"闪光灯"而不是"身体在发光"。

    // 暗角：影棚的镜头就是这样，不是滤镜
    const d = screenUV.sub(vec2(0.5, 0.5));
    const vig = clamp(float(1).sub(d.dot(d).mul(uVignette)), 0, 1);
    out = out.mul(vig);

    // 抗锯齿：上面把这一趟改成了单采样，所以 MSAA 没了，这里补回来。
    // 放在颗粒**之前**：FXAA 靠亮度边缘判断，先撒颗粒会让它把噪点当边缘去抹。
    out = vec4(nodeObject(fxaa(out) as unknown as Node<'vec4'>));

    // 一点点颗粒：主要作用是打散背景渐变上的色带（banding），不是做旧
    const grain = rand(screenUV.add(vec2(uNoise, uNoise.mul(0.73)))).sub(0.5).mul(uGrain);
    out = out.add(grain);

    const pipeline = new THREE.RenderPipeline(renderer);
    pipeline.outputNode = out;

    let noise = 0;
    return {
      render() { pipeline.render(); },
      setLook(look) {
        uAo.value = look.aoStrength;
        uBloom.value = look.bloomStrength;
        bloomPass.threshold.value = look.bloomThreshold;
      },
      tick(dt) {
        noise = (noise + dt * 61.7) % 1000;
        uNoise.value = noise;
      },
      dispose() {
        (pipeline as { dispose?: () => void }).dispose?.();
      },
    };
  } catch (e) {
    console.warn('[stage] 后期链没建起来 → 退回直出（?nopost=1 的效果）', e);
    return null;
  }
}
