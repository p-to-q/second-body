/**
 * Vite 的 `?url` 资源导入（我们只用这一种），单独声明一下，
 * 免得为了 3 行类型把 `vite/client` 塞进根 tsconfig 的 types 里。
 */
declare module '*?url' {
  const url: string;
  export default url;
}

/**
 * 副作用式 CSS 导入（`import './about.css'`）。打包器负责真正的处理，
 * TS 这边只需要知道这个模块存在、没有导出 —— 这就是全部。
 */
declare module '*.css';
