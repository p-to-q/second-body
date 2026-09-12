# 16 · SPEC · Acts —— 留给新玩法的那块空间

> 需求原话："也要留出空间给我们加新玩法，或者做一些新的尝试。"
> 这份文档定义那块空间长什么样。**加一个新玩法 = 新建一个文件 + 在一个数组里加一行，
> 不碰 `main.ts`，不碰帧循环，不碰任何契约。**

## 1. 为什么不是"直接改 main.ts"

`main.ts` 是唯一一处所有契约同时成立或同时失效的地方（`docs/06 §1` 的一帧顺序）。
每加一个玩法就往里塞一段 if，三个玩法之后就没人敢动它了 —— 而黑客松之后
"再试一个想法"的成本，直接决定这件作品还能不能长出新东西。

所以：**帧循环固定，玩法挂在它旁边。**

## 2. 三个概念

```
World      每帧重建的只读快照 + 几个命令。Act 能看到的全部世界。
Act        一个玩法。有生命周期（enter / update / exit）和进入条件。
Director   选谁上场、什么时候换、以及**把出错的 Act 关掉**。
```

## 3. `Act`

```ts
interface Act {
  id: string;
  label: string;                       // 给 ?debug=1 的 HUD 看
  /** 'body' = 决定身体怎么动，同时只能有一个；'ambient' = 常驻叠加，可以有多个 */
  kind: 'body' | 'ambient';
  canEnter?(w: World): boolean;        // 不满足就永远不会被选中
  weight?: number;                     // 随机选择时的权重，默认 1
  minSeconds?: number;                 // 上场后至少演这么久，防止来回横跳
  maxSeconds?: number;                 // 演够就让位
  enter?(w: World): void;
  update(w: World, dt: number): void;
  exit?(w: World): void;
}
```

## 4. `World`

只读快照 + 少量命令。**Act 不允许直接碰 renderer、不允许自己开 rAF、不允许读时钟。**

```ts
interface World {
  readonly t: number;                  // 秒，会话开始至今
  readonly presence: Presence;
  readonly skeleton: Skeleton | null;  // 追踪丢失时是 null
  readonly features: MotionFeatures | null;
  readonly evolution: EvolutionState;
  readonly genome: Genome | null;
  readonly creature: Creature;
  readonly stage: Stage;
  readonly library: PartLibrary;
  readonly capture: Capture;
  readonly flags: Flags;
  readonly rng: Rng;                   // 会话级确定性随机，唯一的随机来源（P1）
  /** 重新抽形态。tier 省略时用当前 tier */
  morph(tier?: Tier): void;
  /** 给 HUD / 日志留一句话，说明现在在演什么 */
  note(s: string): void;
}
```

## 5. `Director` 的三条规则

1. **同时只有一个 `body` Act。** 没有任何候选可进入时，回落到 `follow`（它的 `canEnter` 永远为真）。
2. **出错的 Act 会被关掉，不会带走整件作品。** 连续 3 次抛异常 → 该 Act 被永久禁用并打一条错误，
   Director 立刻回落到 `follow`。这条是 P2/P3 在扩展点上的延伸 ——
   **让"随便试新玩法"变得安全，是这块空间成立的前提。**
3. **换场只发生在 `presence.state === 'ALIVE'` 时**，且受 `minSeconds` 保护。
   观众进场/离场的那几秒不该同时在换玩法。

## 6. 写一个新玩法

```ts
// packages/app/src/acts/my-idea.ts
import type { Act } from './act.ts';

export const myIdea: Act = {
  id: 'my-idea',
  label: '我的新想法',
  kind: 'body',
  weight: 1,
  minSeconds: 20,
  canEnter: (w) => w.evolution.tier >= 2,        // 只在演化到一定程度后出现
  update(w, dt) {
    if (!w.skeleton) return;
    w.creature.pose(w.skeleton, w.presence, dt); // 一个 body Act 至少要做这件事
  },
};
```

然后在 `packages/app/src/acts/index.ts` 的 `ACTS` 数组里加一行。**没有别的步骤。**

## 7. 已有的 Act

| id | kind | 是什么 | 进入条件 |
|---|---|---|---|
| `follow` | body | 基线：身体跟随你。原作的行为 | 永远可进入（兜底） |
| `echo` | body | 身体演的是你 **1.2 秒前**的动作。观众会先以为坏了，然后发现它在回放自己 | tier ≥ 2 且 ALIVE 超过 25 秒 |

`echo` 放在这里主要是**证明这块空间是真的能用的**——它只有一个文件、几十行，
不喜欢直接从 `ACTS` 里删掉那一行即可，其余代码一个字都不用动。

## 8. 明确的边界

- Act **不能**改坐标系、不能改挂载数学、不能改 genome 抽取算法。那些是契约。
- Act **可以**：换姿态来源（echo 就是）、触发 remorph、改舞台参数、决定什么时候不动。
- Act 之间不通信。需要协作就合成一个 Act —— 两个玩法互相依赖时，它们本来就是一个玩法。
