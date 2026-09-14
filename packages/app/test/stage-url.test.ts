/**
 * 「从控件条跳去工作台，再回到舞台」（`ui/stage-url.ts` + `ui/return-to.ts`）。
 *
 *  1. 回来的是**同一屏**：物种、叠加、画面、四个开关、种子。
 *  2. `from` 仍然不是开放重定向：舞台那一种只认控件表推出来的键和普通字符，
 *     输出是按白名单**重新拼**的，不是把输入原样还回去。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTROLS, STAGE_KEYS, type ControlValues } from '../src/ui/control-table.ts';
import { stageReturn, workbenchHref } from '../src/ui/stage-url.ts';
import { FROM_PARAM, fromSearch, returnLabel, safeFrom } from '../src/ui/return-to.ts';
import { devNavActions, devNavLink, escapeTarget, WORKBENCH_HREF } from '../dev/devnav-state.ts';
import { readFlags } from '../src/shell/kiosk.ts';

const OVER: ControlValues = {
  form: 'quadruped', scene: 'tide', act: 'resist',
  outline: true, vitality: false, sound: false,
  species: 'xeno', refine: true, post: false,
};
const ARC: ControlValues = { ...OVER, form: null, act: null, vitality: true, post: true, sound: true };
const LINKS = CONTROLS.flatMap((c) => c.links ?? []);
const STAGE = { zh: '返回舞台', en: 'Back to Stage' };

test('舞台 → 工作台 → 舞台：回来的是同一屏', () => {
  for (const v of [OVER, ARC]) {
    const back = stageReturn(v, 2026);
    assert.ok(back);
    for (const link of LINKS) {
      const href = workbenchHref(link, v, 2026);
      const url = new URL(href, 'https://site.invalid');
      assert.equal(url.pathname, link.page);
      assert.equal(fromSearch(url.search), back, `${href}：from 没有被读回来`);
      assert.deepEqual(devNavActions(url.pathname, url.search), ['return', 'exit']);
      const ret = devNavLink('return', url.search);
      assert.equal(ret.href, back);
      assert.deepEqual(ret.label, STAGE);
      assert.equal(escapeTarget(url.pathname, url.search), back, 'Escape 没有回舞台');

      const f = readFlags(new URL(ret.href, 'https://site.invalid').search);
      for (const c of CONTROLS) {
        if (!c.url || !c.fromFlags || c.url.write(v[c.id as keyof ControlValues] as never) === undefined) continue;
        assert.deepEqual(c.fromFlags(f), v[c.id as keyof ControlValues], `回舞台之后 ${c.id} 变了`);
      }
      assert.equal(f.seed, 2026, '种子没带回来 —— 回来的是另一具身体');
    }
  }
});

test('物种那一条带着当前物种过去；别的页不被洒上舞台的参数', () => {
  for (const link of LINKS) {
    const url = new URL(workbenchHref(link, OVER, 1), 'https://site.invalid');
    const keys = [...url.searchParams.keys()].filter((k) => k !== FROM_PARAM);
    if (link.page === '/dev/figure.html' || link.page === '/dev/mass.html') assert.deepEqual(keys, ['theme']);
    else assert.deepEqual(keys, [], `${link.page} 被洒上了 ${keys.join(',')}`);
  }
  assert.equal(new URL(workbenchHref(LINKS.find((l) => l.page === '/dev/figure.html')!, OVER, 1), 'https://x.invalid').searchParams.get('theme'), 'xeno');
});

test('没有物种的舞台不给回程 —— 那一屏是大厅', () => {
  assert.equal(stageReturn({ ...OVER, species: null }, 1), null);
  assert.equal(safeFrom('/'), null);
  assert.equal(safeFrom('/?plan=rig'), null);
});

test('舞台回程拒掉一切不是"白名单键 = 普通字符"的写法', () => {
  const bad = [
    '/?theme=porcelain&next=%2F%2Fevil.example',
    '/?theme=porcelain&next=https://evil.example',
    '/?theme=//evil.example',
    '/?theme=https://evil.example',
    '/?theme=javascript:alert(1)',
    '/?theme=a b',
    '/?theme=a%20b',
    '/?theme=porcelain&theme=xeno',
    '/?theme=porcelain&from=/about',
    '/?theme=porcelain&shading=toon',
    '/?theme=porcelain#x',
    '/?theme=porcelain\n',
    '/?theme=',
    '/?theme=porcelain&&plan=rig',
    `/?theme=${'a'.repeat(49)}`,
    `/?theme=porcelain${'&seed=1'.repeat(40)}`,
    '//?theme=porcelain',
    '/\\?theme=porcelain',
    '/about?theme=porcelain',
    '/dev/?theme=porcelain',
    'https://evil.example/?theme=porcelain',
    ' /?theme=porcelain',
  ];
  for (const raw of bad) {
    assert.equal(safeFrom(raw), null, `safeFrom 放行了 ${JSON.stringify(raw)}`);
    const search = `?${FROM_PARAM}=${encodeURIComponent(raw)}`;
    assert.equal(devNavLink('return', search).href, WORKBENCH_HREF, `from=${JSON.stringify(raw)} 被当成了合法来处`);
    assert.equal(escapeTarget('/dev/lineup.html', search), WORKBENCH_HREF);
  }
  const ok = safeFrom('/?mute=1&theme=porcelain&plan=rig');
  assert.equal(ok, '/?theme=porcelain&plan=rig&mute=1', '输出不是按白名单顺序重新拼的');
  assert.deepEqual(returnLabel(ok), STAGE);
  for (const k of new URLSearchParams(ok!.slice(1)).keys()) assert.ok(STAGE_KEYS.includes(k));
});
