/** `/about` 的入口。真正的内容在 `about.ts` —— 这里只负责把它挂上去。 */
import { renderAbout } from './about.ts';
import { mountNav } from '../ui/nav.ts';

void renderAbout();
// 这一页读完之后原本走不到任何地方 —— 站里的页面之间此前一条链接都没有
mountNav();
