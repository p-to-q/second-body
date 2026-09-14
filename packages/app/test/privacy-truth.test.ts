/**
 * **隐私说明里的每一句都必须在印出来的那一刻为真。**
 *
 * `docs/26 §G`：全站的诚实集中在三处，而那三处的要求不是"说得好听"，是**逐字为真**。
 * `i18n.ts` 的 `privacy.long` 自己的注释里就写着：
 * 「一句写在隐私说明里的假话比没有隐私说明更糟」—— 这条测试让那句话对它自己生效。
 *
 * ## 它防的是一个**时序**上的假话，不是一个措辞上的
 *
 * 存档（`docs/43 §8`）要作品负责人本人去开通存储，而网站会**先于**存储上线。
 * 在那个窗口里：`/api/visits` 404、一行都不会留下，
 * 而「每一次到访只在服务端留下一行」照常印在 `/about` 上。
 * 那不是写错了字，是那句话在那几天里根本不成立。
 *
 * 靠"发布的时候记得改文案"是不行的 —— 那等于把一句真话托付给一次人工步骤，
 * 而这个仓库今天已经抓到过两次过期的陈述（`docs/41 §7.1` 声称弧线没接，
 * 它已经接了一整天；`/making` 的提交数越过截止时间还在涨）。
 *
 * 所以断言分两条：**那句话必须是可以被单独扣下来的**，
 * 并且 **`/about` 必须先问 `/api/visits` 再决定印不印**。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const i18n = readFileSync(resolve(SRC, 'ui/i18n.ts'), 'utf8');
const about = readFileSync(resolve(SRC, 'about/about.ts'), 'utf8');

/** `privacy.long` 的字面量（那一段是 bi(…) 里若干个 '…' 相加） */
const longBlock = i18n.slice(i18n.indexOf('    long: bi('), i18n.indexOf('archiveRow: bi('));

test('隐私说明：存档那一句不许长回 privacy.long 里', () => {
  for (const claim of ['留下一行', 'leaves a single line']) {
    assert.ok(
      !longBlock.includes(claim),
      `privacy.long 里出现了「${claim}」。这句话只在存档真的在的时候才成立，` +
        '而 privacy.long 是无条件渲染的 —— 存储没配通的那几天它就是一句假话。' +
        '它属于 privacy.archiveRow，由 about.ts 问过 /api/visits 之后再决定印不印',
    );
  }
  assert.match(i18n, /archiveRow: bi\(/, 'privacy.archiveRow 不见了');
});

/**
 * 2026-09-14 起存档可能住在两处（同源 `/api`，或线上那个 Cloudflare Worker，`docs/43 §9.3`），
 * 所以 `/about` 不再自己敲 `/api/visits`，而是问 `archive/endpoint.ts` 的 `findVisits()` ——
 * 和 `/lineage` 同一个函数。这条测试钉的仍然是原来那件事：**问在前，印在后，没答就不印。**
 * `findVisits()` 只在某一处真的答了时才返回东西，那一半的行为钉在 `archive-worker.test.ts`
 * （「哪一处都不答 → null」）。
 */
test('隐私说明：/about 印存档那一句之前必须先问存档在不在', () => {
  const sec = about.slice(about.indexOf('function privacySection'), about.indexOf('function creditsSection'));
  assert.match(
    sec,
    /await findVisits\(\)/,
    'privacySection 没有去问存档在不在 —— 那它就是在无条件断言每一次到访都留下了一行',
  );
  assert.match(
    about,
    /import \{ findVisits \} from '\.\.\/archive\/endpoint\.ts';/,
    'findVisits 不是 archive/endpoint.ts 那一个 —— /about 和 /lineage 必须对「存档在不在」给同一个答案',
  );
  assert.match(
    sec,
    /COPY\.privacy\.archiveRow/,
    'privacySection 没有渲染 privacy.archiveRow',
  );
  // 顺序：问在前，印在后。两者都在但顺序反了，等于没问。
  assert.ok(
    sec.indexOf('await findVisits()') < sec.indexOf('COPY.privacy.archiveRow'),
    '先印了再问 —— 那一句会在存档不存在的时候也出现',
  );
  assert.ok(
    /if \(!found\) return;/.test(sec),
    '没有在存档缺席时提前返回：缺席时应当**什么都不印**，' +
      '而不是印一句「存档暂未开启」—— 观众不需要知道我们的部署顺序',
  );
});
