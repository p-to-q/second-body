/**
 * Worker 的入口 —— `wrangler.toml` 的 `main`。**只许有 `export default`。**
 *
 * workerd 把入口模块的每一个具名导出都当成一个入口（一个 handler 或一个类）。
 * 在这里多导出一个常量，运行时就起不来：
 *   `Incorrect type for map entry 'RATE_KEY': the provided value is not of type
 *    'function or ExportedHandler'`
 * 所以逻辑、常量、类型全在 `handle.ts`，这里只把它交给运行时。
 * `test/archive-worker.test.ts` 扫这个文件钉住它。
 */
import { handle } from './handle.ts';

export default { fetch: handle };
