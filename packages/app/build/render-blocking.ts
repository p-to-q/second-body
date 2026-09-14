/**
 * 构建后的 html：入口模块脚本挡住第一帧（`blocking="render"`），首页除外。纯函数，`vite.config.ts` 调它。
 *
 * 为什么（docs/47 §4.3）：展出页与工作台页的内容全是入口模块建出来的。跨页过渡在新页**第一帧**截图，
 * 模块脚本却是延迟执行的 —— 有头 Chrome 实测 `/making`、`/lineage` 的第一帧早于模块：过渡淡到一块空的深底，
 * 横带和字标在过渡结束后才出现，字标也就挪不过去。挡住第一帧之后，第一帧就是建好的页。
 *
 * 首页不挡：它的模块图带着 three.webgpu（600 KB+），冷开时挡住等于空屏更久；
 * 首页第一帧的底色由 `index.html` 行内那一行负责。
 *
 * 为什么是构建后改：Vite 重写入口 `<script>` 时会丢掉手写的 `blocking` 属性（实测）。
 * 单独一个文件：`vite.config.ts` 进不了 node 测试，而"首页不挡、别的都挡"值得有仪表。
 */

/** `filename` 是 Vite 给的 html 绝对路径 */
export function isHomeHtml(filename: string): boolean {
  const p = filename.replace(/\\/g, '/');
  return /\/index\.html$/.test(p) && !/\/dev\/index\.html$/.test(p);
}

/** Vite 构建产出的入口标签形状：`<script type="module" crossorigin src="/assets/x.js"></script>` */
export function blockRender(html: string, filename: string): string {
  if (isHomeHtml(filename)) return html;
  return html.replace(
    /<script type="module" crossorigin src="([^"]+)"><\/script>/g,
    '<script type="module" crossorigin blocking="render" src="$1"></script>',
  );
}
