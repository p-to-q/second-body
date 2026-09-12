# 04 · SPEC · Rig, Coordinates & Attachment

> 本文档定义坐标系、骨架拓扑与挂载数学。**这是全项目最容易出隐性 bug 的地方，
> 所有相关改动必须先读完本文。**

## 1. 坐标系与单位（唯一定义）

| 项 | 约定 |
|---|---|
| 单位 | **米 (m)**。速度 m/s。角度用弧度。 |
| 世界系 | three.js 右手系：**+X 右，+Y 上，-Z 屏幕内**（相机看向 -Z） |
| 原点 | **地面上、观众正前方**。即 y=0 是地板，角色脚踩在 y≈0 |
| 镜像 | 画面是镜子：观众抬右手，屏幕上的身体也抬（屏幕的）右手 |

### MediaPipe → 世界系

MediaPipe `worldLandmarks` 的约定（**待实测确认，见 09 §U1**）：
原点在两胯中点，单位米，**+X 右、+Y 下、+Z 朝向相机后方**（与图像坐标同向）。

转换 **只允许出现在 `core/skeleton.ts` 的 `mediapipeToWorld()` 里**：

```
world.x = -mp.x      // 取负 = 镜像（P4：镜像只在这里发生）
world.y = -mp.y      // Y 翻转（MediaPipe 向下为正）
world.z = -mp.z      // 深度翻转，让人朝向 +Z 面对相机
```

再做一次**落地平移**：把整具骨架沿 +Y 平移，使 `min(leftFoot.y, rightFoot.y) = 0`。
理由：MediaPipe 的原点在胯，人蹲下时整个人会"陷进地板"；落地平移让影子永远贴地。

### 左右：一个必须写死的事实

**MediaPipe 的 `left_*` 指的是被摄者的左侧，不是图像的左侧。**
人正对相机时，被摄者的左半身出现在**图像右**侧，所以 `left_wrist.x > 0`（world landmarks，原点在胯心）。
经过 `world.x = -mp.x` 之后，`handL` 落在世界 **-X**，`handR` 落在世界 **+X**。

这看起来反直觉，但它正是我们要的。产品级不变式是：

> **观众抬起哪只手，屏幕上就在与镜子一致的那一侧抬起。**
> 观众抬**右**手 → 世界 **+X** → 屏幕右侧。而观众的右手就是 MediaPipe 的 `right_*`。

所以要断言的是 `handR → +X`，不是 `handL → +X`。
（`docs/11` T-02 的验收 (b) 原先写反了，已修正。这条注记保留，是为了让下一个人不要再写反一次。）

> ⚠️ 若实测发现 Y/Z 轴向与上表不符，**改 `mediapipeToWorld` 里那三个具名常量，并更新本节表格**，
> 不要在下游打补丁。左右这一条已经由上面的推导定死，不需要再猜。

## 2. 骨架拓扑（17 根骨头）

MediaPipe 33 点索引 → 关节：

```
LM = { NOSE:0, L_EAR:7, R_EAR:8, L_SHOULDER:11, R_SHOULDER:12,
       L_ELBOW:13, R_ELBOW:14, L_WRIST:15, R_WRIST:16,
       L_PINKY:17, R_PINKY:18, L_INDEX:19, R_INDEX:20,
       L_HIP:23, R_HIP:24, L_KNEE:25, R_KNEE:26,
       L_ANKLE:27, R_ANKLE:28, L_HEEL:29, R_HEEL:30,
       L_FOOT:31, R_FOOT:32 }
```

派生关节：

| 关节 | 定义 |
|---|---|
| `pelvis` | mid(L_HIP, R_HIP) |
| `chest` | mid(L_SHOULDER, R_SHOULDER) |
| `neck` | lerp(chest, headCenter, 0.35) |
| `headCenter` | mid(L_EAR, R_EAR)，缺失时回退 NOSE |
| `handTip.L/R` | mid(L_INDEX, L_PINKY)，缺失时 wrist + (wrist-elbow)·0.3 |

骨头列表（`BoneId`，顺序即数组索引，**不许重排**）：

```
 0 spine        pelvis    → chest
 1 neck         chest     → neck
 2 head         neck      → headCenter
 3 clavicleL    chest     → shoulderL       12 thighL   hipL  → kneeL
 4 clavicleR    chest     → shoulderR       13 thighR   hipR  → kneeR
 5 upperArmL    shoulderL → elbowL          14 shinL    kneeL → ankleL
 6 upperArmR    shoulderR → elbowR          15 shinR    kneeR → ankleR
 7 foreArmL     elbowL    → wristL          16 footL    ankleL→ footIdxL
 8 foreArmR     elbowR    → wristR          17 footR    ankleR→ footIdxR
 9 handL        wristL    → handTipL
10 handR        wristR    → handTipR
11 (保留)
```
> 实际为 17 根（编号 11 空出以便将来插 `abdomen`）。数组长度以 `BONES.length` 为准，
> 不要在别处硬编码 17。

每根骨头：
```ts
interface Bone {
  id: BoneId;
  p0: Vec3;        // 起点（世界系，米）
  p1: Vec3;        // 终点
  length: number;  // |p1-p0|，稳定化之后的值
  roll: number;    // 绕主轴的扭转，弧度；v1 全部为 0，见 §5
  confidence: number; // 0..1，两端关节 visibility 的较小值
}
```

## 3. 骨长稳定化（必做，否则角色会"呼吸"）

单目姿态每帧给出的骨长会抖 ±15%。做法：

1. 每帧测量 17 个骨长。
2. 每根骨头维护一个 **90 帧滑动中位数**（中位数不是均值：抗跳变）。
3. 稳定长度 `L̂ = median`，且用 `L̂` 做**前向运动学重建**：
   从 `pelvis` 出发，沿测得的方向、用 `L̂` 的长度，逐级重算所有关节位置。
4. 前 30 帧（热身期）直接用测量值，并标记 `warmingUp = true`。
5. **重建之后必须重新落地**：骨长换成中位数后，腿链从胯往下累积的长度差会让脚离地或陷地几厘米，
   影子就不贴地了。所以 FK 之后再沿 Y 平移一次，使最低的脚 y = 0。
   这不违反 P4 —— P4 管的是坐标系转换，这里是对 FK 输出的修正，**允许且只允许发生在 `stabilize.ts`**。

**结果**：方向来自模型，长度来自统计 → 身体比例锁死，动作依然跟手。

## 4. 挂载数学（项目的心脏）

部件在入库时已被规范化（见 `03-SPEC-part-library.md`）：
**主轴 = +Y，socketA 在原点 (0,0,0)，socketB 在 (0,1,0)，长度 = 1.0**。

因此挂载矩阵是：

```
M = T(bone.p0) · R(+Y → dir) · S(rx, bone.length, rz) · Roll(bone.roll)
```

```ts
// core/attach.ts —— 纯函数，返回列主序 number[16]
export function attachMatrix(bone: Bone, part: PartMeta, out: Mat4): Mat4 {
  const dx = bone.p1[0]-bone.p0[0], dy = ..., dz = ...;
  const len = Math.hypot(dx,dy,dz) || 1e-6;
  const dir = [dx/len, dy/len, dz/len];
  // R: 把 +Y 旋到 dir（退化情况 dir ≈ -Y 时用 +X 作为旋转轴）
  // S: 横向不拉伸，只沿 Y 拉到 len；横向用 part.girth × bodyScale
  ...
}
```

**退化情况必须处理**：`dir` 与 `+Y` 反向时 `cross` 为零向量 → 旋转轴退化。
用 `if (dot < -0.9999) axis = [1,0,0], angle = π`。这个 case 在人倒立/抬腿时真的会出现。

### 两种挂载模式（`SLOT_FIT`）

不是所有部件都该被拉长。

| 模式 | 槽位 | 缩放 | 理由 |
|---|---|---|---|
| `stretch` | clavicle / upperArm / foreArm / thigh / shin | `S(g, boneLength, g)` | 四肢是"可以被拉长的管子"，长度必须跟骨头走 |
| `uniform` | head / neck / spine / hand / foot / joint | `S(g, g, g)` | 这些是"有固有比例的物体"。用 stretch 挂头，颈骨多长头就多高 —— 装配预览里它会变成一坨压扁的东西（真踩过） |

`uniform` 模式下部件**仍然**以 socketA 落在 `bone.p0`、主轴对齐骨头方向，
只是尺寸由 `SLOT_WIDTH[slot]` 决定而不是骨长。

### 横向缩放 `girth`
不要用 `S(len, len, len)`（部件会随骨长变胖变瘦，很假）。
用 `S(g, len, g)`，其中
```
g = (SLOT_WIDTH[slot] * bodyScale) / part.localGirth
bodyScale = 观测身高 / 1.7
```
（`stretch` 槽位的 `SLOT_WIDTH` 读作"横向宽度"，`uniform` 槽位读作"整体大小"，都是米。）
`SLOT_WIDTH` 是一张"这个槽位在标准身材上应该有多宽（米）"的表（运行时常量）。
这样：胖瘦只跟人体尺寸走，不跟单根骨头长度走；换一个更胖的部件也不会突然变粗。

## 5. Roll（绕轴扭转）——v1 显式不做

单目姿态给不出可靠的肢体扭转。v1 全部 `roll = 0`。
**后果**：前臂旋转时部件不跟着转——在硬表面机器人造型上几乎看不出来。
v2 若要做：用 `wrist→index` 与 `elbow→wrist` 的叉积估计前臂 roll。**不要在 v1 花时间。**

## 6. 验收测试（`core/test/attach.test.ts` 必须覆盖）

1. 单位骨头 `p0=(0,0,0), p1=(0,1,0)` → `M` ≈ 单位阵。
2. 任意骨头：`M · (0,0,0,1) ≈ p0`，`M · (0,1,0,1) ≈ p1`。（**这条是核心不变式**）
3. 退化：`p1 = p0 - (0,1,0)` 不产生 NaN，且不变式 2 仍成立。
4. 零长骨头 `p1 == p0` 不产生 NaN。
5. 1000 个随机骨头，输出矩阵全部有限。
