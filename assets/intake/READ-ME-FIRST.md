# 把图丢这儿

```
assets/intake/char.inflate/     ← 大白那张
assets/intake/char.diva/        ← 初音那张
assets/intake/char.line/        ← Chiikawa 那张
assets/intake/guest.keynote/    ← Sam Altman / Tim Cook 那两张
assets/intake/char.tokusatsu/   ← 赛罗那张
assets/intake/char.painting/    ← 蒙娜丽莎（用画本身，不用手办产品照）
```

文件名随意，`.jpg` / `.png` / `.webp` 都行，一个目录最多 5 张（第一张决定材质）。

丢完跑：

```bash
npm run factory:generate -- --theme=<id>
npm run factory:normalize -- --ids=...
npm run factory:index
```

**这里有图，管线就直接拿它做 image-to-3D，不会再去自渲一张锚。**
自渲锚那一步存在的唯一理由就是"没有参考图"。

图不进仓库（`.gitignore` 里挡掉了），只有 `SOURCES.md` 和 `prompt.md` 进。
要求见 `docs/30-ASSET-INTAKE.md`。
