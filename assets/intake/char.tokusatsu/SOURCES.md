# 参考图来源 —— `char.tokusatsu`

> 抓取日期 **2026-09-13** · 来源：MiniMax Design 图片生成

| 文件 | 来源 | 版权 | 说明 |
|---|---|---|---|
| `chrome-armoured-hero.png` | MiniMax Design 图片生成（Design Image 2.5 Sunburst），2026-09-13 | AI 生成，无第三方权利 | 1664×2496。生成 2 次，采用第 2 次。 |

**提交的 prompt 原文（任务给定，原样提交）：**

> A full-body studio product photograph of a tokusatsu-style suited hero figure, standing straight facing camera in a neutral pose. Mirror-polished chrome armour plates over a smooth matte red and cobalt-blue bodysuit, sharp angular silver crest lines down the chest and limbs, a glowing amber gem at the sternum, smooth featureless helmet with a silver fin crest. High-gloss lacquer finish, crisp colour boundaries, no weathering, no logo, no text. Plain flat light-grey seamless studio background, soft even diffuse lighting, no hard shadows, no props, single subject, whole figure inside frame with margin.

**生成记录：** 第 1 次被 MiniMax 的内容安全审核直接拒绝（「图片内容未通过安全审核」，已退回 200 积分）—— 应该是 `tokusatsu` 这个词触发了 IP 相关过滤。MiniMax 的 agent 自动重写成「original-design / futuristic armored humanoid mannequin」再跑了第 2 次，通过。硬要求全部满足：单主体、浅灰无缝背景、平光、全身留边、正面站立、长边 2496。

**⚠️ 需要人来判断的一点：** 出图和奥特曼（円谷制作）在造型上非常接近 —— 头部鳍冠、胸口发光晶体、银红配色都撞上了。图只在本地做 image-to-3D 参考、不进仓库（`.gitignore` 挡掉），但如果这一支最后要对外展示，**这张不能用**，应该改 prompt（去掉「胸口晶体 + 头鳍」这两个最像的特征）重生成。这是我没法替你决定的事，所以留在这里。


## 2026-09-13 · 编排者裁定：整图删除，只保留两块局部

生成出来的整图和奥特曼撞得很厉害 —— 头鳍冠、胸口琥珀晶体、银红蓝配色、
那张无面孔的脸，四个特征全中。执行这条线的代理自己标了出来，判断是对的。

**裁定：删掉整图，改成两块局部。**

| 文件 | 取自 | 为什么 |
|---|---|---|
| `suit-limb-detail.png` | 原图大腿到小腿（y 52%–93%） | 镀铬甲片 + 红蓝分色 + 高光漆面 —— **材质语言全在，零可识别特征** |
| `suit-shoulder-volume.png` | 原图左肩到上臂（y 13%–42%） | 圆转的甲片给**体积**。同样没有头、没有胸徽 |

理由不是谨慎，是 `docs/30 §5.5` 那条用 30 credits 换来的规律：
**参考图要回答"这东西是什么做的"和"它怎么鼓起来的"，不是"它是谁"。**
给整只角色的全身照，多半会得到一个小号的它挂在躯干上 —— 蒙娜丽莎那次
躯干件上直接长出了一张脸。

而对这一条，"小号的它"恰好就是我们明确不做的那个东西
（`recipes/invited.ts` 的文件头写了为什么）。删整图不是退让，是把参考图
调回它该起的作用。
