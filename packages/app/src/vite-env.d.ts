/**
 * Vite 的 `?url` 资源导入（我们只用这一种），单独声明一下，
 * 免得为了 3 行类型把 `vite/client` 塞进根 tsconfig 的 types 里。
 */
declare module '*?url' {
  const url: string;
  export default url;
}
