# 03 · SPEC · Part Library (`parts.json`)

> **冻结契约。** 运行时与资产流水线之间唯一的接口。改这个文件需要双方同时改，
> 所以：不要改。需要新字段时，加可选字段，不改已有字段的含义。

## 1. 目录布局

```
assets/
  parts/
    parts.json              ← 索引（本文档定义）
    <partId>.glb            ← 已规范化的几何，一个部件一个文件
  raw/                      ← Rodin 原始产物，.gitignore，可随时删
    <taskUuid>/…
    ledger.json             ← 生成台账（见 §5）
```

## 2. `parts.json`

```jsonc
{
  "version": 1,
  "generatedAt": "2026-09-12T05:00:00Z",
  "units": "meters",
  "convention": {                // 冗余写进文件，防止将来读错
    "axis": "+Y",
    "socketA": [0, 0, 0],
    "socketB": [0, 1, 0],
    "length": 1.0
  },
  "materials": [ /* §4 */ ],
  "parts": [ /* §3 */ ]
}
```

## 3. `PartMeta`

```jsonc
{
  "id": "upperArm.plate.a",     // 唯一；命名 = <slot>.<family>.<variant>
  "slot": "upperArm",           // 见 §3.1
  "tier": 1,                    // 0..3，允许出现在哪些演化阶段（含之后的阶段）
  "file": "upperArm.plate.a.glb",
  "family": "plate",            // 同 family 的部件风格一致，用于整体搭配
  "localGirth": 0.32,           // 归一化后 max(sizeX,sizeZ)；运行时据此反算横向缩放，见 04 §4
  "triCount": 2431,
  "aabb": { "min": [-0.11,0,-0.09], "max": [0.11,1.0,0.09] },
  "symmetry": "mirror",         // "mirror" = 左侧用 X 镜像复用；"none" = 左右各生成一个
  "capJoint": true,             // true = 该部件自带关节球，父端不需要额外关节件
  "source": {
    "provider": "hyper3d",
    "model": "Gen-2.5-Low",
    "taskUuid": "…",
    "seed": 4137,
    "recipeId": "upperArm.plate.a"
  }
}
```

### 3.1 `Slot` 枚举（冻结）

```
head | neck | spine | clavicle | upperArm | foreArm | hand | thigh | shin | foot | joint
```

- `clavicle/upperArm/foreArm/hand/thigh/shin/foot` 是**成对**槽位：
  右侧直接用，左侧按 `symmetry` 处理（`mirror` → X 轴镜像实例，`scale.x = -1`，
  **注意同时要翻转法线/正反面剔除**，见 07 §陷阱）。
- `joint` 是通用关节球，挂在每个关节点上盖住穿插缝隙，不属于任何一根骨头。

### 3.2 tier 语义

`tier` 是**最低出现阶段**：`tier: 1` 的部件在演化到 tier ≥ 1 后进入候选池。
- tier 0 = 最原始（素方块、胶囊、无纹理）
- tier 1 = 基础外壳
- tier 2 = 机械化、关节化
- tier 3 = 高频细节 / 异质材料

## 4. `MaterialDef`

```jsonc
{
  "id": "matte.bone",
  "tier": 0,
  "baseColor": [0.92, 0.90, 0.87],
  "roughness": 0.75,
  "metalness": 0.0,
  "clearcoat": 0.0,
  "emissive": [0,0,0]
}
```
运行时**不使用 glb 自带的贴图材质做最终呈现**（各部件贴图风格不可能统一）。
glb 的 PBR 贴图只作为参考/备选；正式渲染统一套 `materials[]` 里的少量材质。
**这是"看起来像一个作品"而不是"素材堆"的关键决定。**

生成时因此可以用 `material=None` 省时间——但先跑一批 `PBR` 看看，
万一某些 family 带贴图更好看（见 09 §U4）。

## 5. `ledger.json`（生成台账）

```jsonc
{
  "entries": {
    "upperArm.plate.a": {
      "recipeHash": "sha256:…",   // recipe 内容哈希，变了才重新生成
      "taskUuid": "…",
      "subscriptionKey": "…",
      "status": "done",           // queued | generating | done | failed | normalized
      "consumed": 0.5,
      "files": ["upperArm.plate.a/model.glb"],
      "submittedAt": "…", "completedAt": "…",
      "error": null
    }
  },
  "totalConsumed": 12.5
}
```

**幂等规则**：`generate` 只提交 `status ∉ {done, normalized}` 或 `recipeHash` 变了的 recipe。
崩溃后重跑不会重复花钱（P9）。

## 6. 规范化契约（`normalize` 的输出保证）

对每个入库部件，流水线保证：

1. 只有一个 mesh，已 weld/dedup/prune。
2. 主轴（OBB 最长边，PCA 求）旋到 **+Y**。
3. 沿主轴的最小端点平移到**原点**；整体缩放使主轴长度 = **1.0**。
4. 横向（X/Z）居中于主轴。
5. 三角形数 ≤ 5000（`meshoptimizer` simplify，误差超阈值则记 warning 不阻断）。
6. 无动画、无骨骼、无相机、无灯光。
7. 生成 `PartMeta`（`triCount` / `aabb` / `localGirth = max(aabbX, aabbZ)`）。

> 规范化**必须幂等**：对已规范化的文件再跑一次，结果不变（允许 1e-5 误差）。
> 这条有测试：`factory/test/normalize.idempotent.test.ts`。

## 7. 占位资产（`parts.json` 不存在时）

运行时内置 5 个程序化部件，覆盖全部槽位：
`capsule`（肢体）、`box`（躯干）、`sphere`(头/关节)、`wedge`(脚)、`plate`(锁骨)。
它们同样满足 §6 的契约（主轴 +Y，长度 1）。
**这保证了 ADR-4：没有资产也能跑。**
