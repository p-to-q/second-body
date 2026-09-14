/**
 * `GET /api/visits?limit=` —— Vercel 函数的壳。见 `api/visit.ts` 的说明。
 *
 * 查询串要留着（`limit=`），所以这里只换 pathname，不换整条 url。
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createArchiveHandler } from '../packages/archive/src/http.ts';
import { createVisitStore } from '../packages/archive/src/store.ts';

const handler = createArchiveHandler(createVisitStore());

export default function visits(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const query = (req.url ?? '').split('?')[1];
  req.url = query ? `/visits?${query}` : '/visits';
  return handler(req, res);
}
