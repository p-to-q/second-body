# 37 · Performance — 30 分钟浸泡

> 这份文档只记**测过的**。每个数字后面都跟着它是怎么来的；
> 测不到的一律写「未测」，不写「应该没问题」（docs/02 P21）。

---

## 0 · 为什么先做浸泡，而不是先做跑分

这是一件要在展厅里**无人值守跑一整天**的装置。它的失败方式不是"帧率不够高"，
是**跑着跑着慢慢坏掉**：某个东西每帧多留一点，两小时后画面开始卡，
而开场那五分钟一切正常 —— 验收的时候正好在那五分钟里。

所以第一个要回答的问题不是"它多快"，是"**它会不会漂**"。

---

## 1 · 结果（2026-09-14）

`http://localhost:4173/?theme=porcelain&demo=1&debug=1&nav=0`，生产构建
（`npm run build` + `vite preview`），每 30 秒采一次页面**自己的** `?debug=1` HUD。

| | 结果 |
|---|---|
| 时长 | **30.5 分钟**，62 个采样 |
| `instances` | **30** —— 62 个采样里只有这一个值 |
| `draws` | **18** —— 只有这一个值 |
| `tris` | **85k** —— 只有这一个值 |
| JS 堆·地板（前半程 / 后半程） | **33 MB / 33 MB** |
| JS 堆·峰值 | 60 MB，期间回落 **22 次** |

**判据是地板，不是峰值。** 堆在 33–60 之间来回是两次 GC 之间的正常锯齿；
泄漏的签名是**地板被抬高**。30 分钟后的地板和第一分钟逐字相同，
所以：**没有泄漏，没有资源爬升。**

`instances` / `draws` / `tris` 三个值在 62 个采样里各自只出现过一个数 ——
这比"平均值很稳"强得多：它说明**根本没有东西被重复创建**。

---

## 2 · 这份结果**不**覆盖什么

写在结果正下方，因为一份不写边界的性能报告会被当成通行证。

1. **它跑的是开描边之前的构建。** 页面是在 `toon` 成为默认之前加载的，
   所以 `draws 18 / tris 85k` 是旧基线。新默认让 draws 翻倍到 36、
   tris 到 232k（`test/outline-budget.test.ts` 钉住）。
   **开描边之后的浸泡还没跑。**
2. **绝对帧率不作数。** 采样期间这台机器同时跑着四到五个子代理，
   负载在 30–50 之间摆，fps 在 7.6 到 110 之间跳。那量的是机器，不是作品。
   漂移（堆、实例、draws）是相对量，在满载机器上依然成立 —— 这也正是
   只报漂移、不报帧率的原因。
3. **走的是回放（`?demo=1`），不是摄像头。** 真实采集多一条
   MediaPipe 推理链路和一条摄像头流。
4. **只测了一个物种**（`porcelain`，`rig`）。`mass` / `swarm` 的团块与点场
   是另一条表达路径，没有浸泡过。
5. **没有跨物种切换。** 观众换一具身体会重载，重载后的累积没测。

---

## 3 · 还没测的

| 项 | 为什么没测 |
|---|---|
| 开描边之后的 30 分钟浸泡 | 新默认刚落地，要重开一次 |
| 真实摄像头下的浸泡 | 内置浏览器窗格挡 `getUserMedia`，只有人在现场才跑得了 |
| 现场屏（1920×1080 @ 75Hz）上的帧率 | 需要把窗口拖到那块屏上全屏 |
| 反复进出作品的累积 | 需要脚本化的重载循环 |
| `mass` / `swarm` 的浸泡 | 同上，且要另一个物种 |

---

## 4 · 怎么重跑

打开生产预览，在控制台里贴：

```js
window.__soak = [];
window.__soakSample = () => {
  const hud = [...document.querySelectorAll('body *')]
    .find(e => e.children.length >= 6 && /fps/.test(e.textContent || '') && /draws/.test(e.textContent || ''));
  const txt = hud ? hud.textContent.replace(/\s+/g, ' ').trim() : '';
  const num = k => { const m = txt.match(new RegExp(k + '\\s+([0-9.]+)')); return m ? +m[1] : null; };
  const s = { t: Math.round(performance.now() / 1000), fps: num('fps'), cpuMs: num('cpu'),
              instances: num('instances'), trisK: num('tris'), draws: num('draws'),
              heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null };
  window.__soak.push(s); return s;
};
setInterval(window.__soakSample, 30000);
```

半小时后看**地板**：

```js
const h = window.__soak.map(x => x.heapMB), half = h.length >> 1;
({ first: Math.min(...h.slice(0, half)), second: Math.min(...h.slice(half)) })
```

两个数相等 = 没有泄漏。第二个明显更大 = 有。

**读的必须是页面自己的 HUD。** 注入一个自己的 rAF 计数器会被浏览器限流 ——
今天有一条 lane 的注入计数器读出 1 fps，而页面实际跑在 120（docs/02 P21）。
