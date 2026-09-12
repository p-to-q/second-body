/**
 * Vite 的 `?url` 资源导入（我们只用这一种），单独声明一下，
 * 免得为了 3 行类型把 `vite/client` 塞进根 tsconfig 的 types 里。
 */
declare module '*?url' {
  const url: string;
  export default url;
}

/**
 * `import './ui/type.css'` —— 排版系统是全部页面的硬约束（docs/23 §0），
 * 所以每个入口都要能直接 import 它。Vite 自己会把它变成一条 <link>；
 * tsc 只需要知道"这个模块存在且没有导出"。
 */
declare module '*.css' {
  const css: void;
  export default css;
}
