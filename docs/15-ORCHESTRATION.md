# 15 · Orchestration —— 并行推进的规则

> 主线是**代码底座**，由多个子代理在各自 worktree 分支上推。
> 素材工厂是**侧线**，在主目录跑（二进制大文件不适合分支合并）。
> 这份文档是编排者的台账：谁在改什么、按什么顺序合、冲突怎么处理。

## 1. 泳道

| 线 | 分支 | 归属文件 | 卡 |
|---|---|---|---|
| 主线 A · 采集 | worktree | `packages/app/src/capture/**`、`dev/capture.html` | T-01（顺带解 U1/U2） |
| 主线 B · 骨架 | worktree | `packages/core/src/{skeleton,stabilize}.ts` + 对应测试 | T-02 / T-04 |
| 主线 C · 运动 | worktree | `packages/core/src/motion.ts` + 测试 | T-06 |
| 主线 D · 装配 | worktree | `packages/app/src/{assets,creature}/**`、`dev/figure.ts` | T-07 |
| 主线 E · 选择页 | worktree | `packages/app/src/{choose,vendor}/**`、`dev/choose.html` | T-18 |
| 侧线 F · 素材 | **主目录** | `assets/**`、`packages/factory/**` | T-13 + 新物种生成 |

## 2. 三条硬规则

1. **冻结契约谁都不许改**：`packages/core/src/types.ts`、`tuning.ts`、`docs/03`、`docs/04`。
   需要改就**停下来报告**"需要变更契约：<原因>"，由编排者统一改并广播。
   唯一例外：主线 A 可以改 `docs/04 §1` 的轴向表，因为那是它实测出来的结论。
2. **`packages/core/src/index.ts` 谁都不许动。** 它是唯一会被多条线同时碰到的文件，
   由编排者在合并时统一补导出。这条规则让 5 条线的冲突面降到接近 0。
3. **泳道外的文件不要顺手改。** 看到别处有 bug，写进收尾报告，不要动手。

## 3. 合并顺序

```
F 素材   ── 随时合，它只动 assets/ 和 factory/，和谁都不冲突
B 骨架 ─┐
C 运动 ─┼─→ 先合 core（B、C 只碰各自的文件）
        │
A 采集 ─┼─→ 再合 app 里互不重叠的三条（A / D / E）
D 装配 ─┤
E 选择页┘
        └─→ 最后由编排者补 core/index.ts 的导出，跑一次 npm run check
```

每条线合进来之前必须自己 `npm run check` 通过。合完再整体跑一次。

## 4. 合并后才能做的事（依赖已经排好）

- `T-09 Stage`（灯光/后期）依赖 D 装配
- `T-16 kiosk + ?demo=1 回放` 依赖 A 采集
- `T-17 慢回路` 依赖 D 装配（热插拔）+ F 素材（anchor 图要一起送进生成）
- **主程序 `src/main.ts` 的组装**依赖 A+B+C+D+E 全部合完 —— 这是编排者的活，不发给子代理：
  一帧的顺序在 `docs/06 §1` 已经写死了，照抄即可。

## 5. 收尾报告格式（所有线统一）

```
Status:     done / partial / blocked
Scope:      改了什么
Validation: 跑过的确切命令；没跑的写 Not run 加理由
Risks:      可能还不对的地方
Next:       一个具体的下一步
```

**跑过才能说通过。** 没跑的检查写 `Not run` 加理由是完整的答案；说"应该能跑"不是。

## 6. 编排者自己的清单

- [ ] 每条线回来先看 Validation 那一栏，再看 diff
- [ ] 合完补 `core/index.ts` 导出，整体 `npm run check`
- [ ] 更新 `docs/10-SURFACES.md`（唯一可信状态表）
- [ ] 契约变更请求统一处理并广播给还在跑的线
- [ ] 组装 `src/main.ts`，按 `docs/06 §1` 的一帧顺序
