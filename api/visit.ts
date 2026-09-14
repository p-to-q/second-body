/**
 * `POST /api/visit` —— Vercel 函数的壳。
 *
 * 壳子只做一件事：把 Vercel 的一条路径一个函数，接回 `createArchiveHandler`
 * 认得的那个形状（它按 path 分岔，因为 dev server 那一边是一个中间件挂 `/api`）。
 * 逻辑一行都不在这里 —— 在 `packages/archive/src/http.ts`，那里能被单测打到。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createArchiveHandler } from '../packages/archive/src/http.ts';
import { createVisitStore } from '../packages/archive/src/store.ts';

const handler = createArchiveHandler(createVisitStore());

export default function visit(req: IncomingMessage, res: ServerResponse): Promise<void> {
  req.url = '/visit';
  return handler(req, res);
}
