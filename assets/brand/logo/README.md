# Logo

**名字只有 `SEE-ME SEE-U`。** 「看我看你」是中文说明，不是名字的一部分，不进 logo。

| 文件 | 用途 |
|---|---|
| `logo-dark.svg` | 两行，浅色字 —— 深底上用（作品默认是深底） |
| `logo-light.svg` | 两行，深色字 —— 浅底/白展厅/印刷品上用 |
| `logo-dark-onpaper.svg` | 两行 + 自带深色底 —— 需要独立成块时用（社交头像、贴纸） |
| `logo-1line-dark.svg` / `logo-1line-light.svg` | 单行 —— 页眉、窄横幅、署名行 |

## 三条构造参数

- **字体** `ZKMSerendipity-Medium`（`assets/fonts/`）。Medium 是这套字体里最粗的一档，没有 Bold。
- **字距 −0.055em**。`type.css` 的 display 级是 −0.025em；logo 再紧一档 ——
  grotesk 的规矩是**大字号收紧**，而 logo 是全站最大的字号。
- **行距 0.94em**（两行版）。小于 1.0，两行因此读成**一块**而不是两行字。

## 字形已转成轮廓

SVG 里是 `<path>`，不是 `<text>` —— **不依赖任何字体安装**，在任何地方打开都一样。
代价是改不了字：要改文字就重跑生成脚本（见 `docs/27-BRAND.md`）。

## 颜色

只有两个值，取自 `type.css`：`#0e0f12`（纸）与 `#dfe4ea`（墨）。
**不要给 logo 上别的颜色** —— 全站只有一处用颜色承担语义，logo 不是那一处（`docs/26 §F`）。
