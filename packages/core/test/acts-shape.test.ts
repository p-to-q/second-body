/**
 * 玩法的形状约束。
 *
 * 这些不是在测某个玩法好不好玩 —— 那没法自动测。
 * 它们测的是**每个玩法都必须满足的契约**，否则 Director 的故障隔离会被触发，
 * 而一个总是被禁用的玩法等于不存在（docs/16 §5）。
 */
import test from 'node:test';
import assert from 'node:assert/strict';

// core 不许 import app（依赖只能向下，docs/01 §2）。
// 所以这里只能做静态检查：读源码，确认每个玩法文件遵守了几条硬规矩。
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ACTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../app/src/acts');
const files = readdirSync(ACTS_DIR).filter((f) => f.endsWith('.ts') && !['act.ts', 'index.ts'].includes(f));

test('玩法目录里确实有东西（扩展点不能是空的）', () => {
  assert.ok(files.length >= 4, `只有 ${files.length} 个玩法：扩展点建好了却没人用，等于没建`);
});

for (const f of files) {
  const src = readFileSync(resolve(ACTS_DIR, f), 'utf8');

  test(`${f}: 不碰 three、不开 rAF、不读时钟（docs/16 §4）`, () => {
    assert.ok(!/from ['"]three/.test(src), '玩法不许 import three —— 表达层的事交给 BodyInstance');
    assert.ok(!/requestAnimationFrame/.test(src), '玩法不许自己开帧循环');
    assert.ok(!/Date\.now\(\)|performance\.now\(\)/.test(src), '时间从 dt 来，不从时钟来（P1）');
    assert.ok(!/Math\.random\(\)/.test(src), '随机从 w.rng 来（P1）');
  });

  test(`${f}: 不就地修改 World.skeleton`, () => {
    // World.skeleton 是共享的：就地改会污染同帧的其它消费者（HUD、导出、慢回路）
    assert.ok(!/w\.skeleton\.(joints|bones)\s*\[[^\]]*\]\s*=/.test(src),
      '不要就地改 w.skeleton —— 它是共享的，要改就构造一份新的');
  });

  test(`${f}: 是一个 body 或 ambient 玩法，且声明了 id/label`, () => {
    assert.ok(/kind:\s*'(body|ambient)'/.test(src), '必须声明 kind');
    assert.ok(/id:\s*'[a-z][a-z0-9-]*'/.test(src), 'id 必须是小写短横线');
    assert.ok(/label:\s*'/.test(src), 'label 给 ?debug=1 的 HUD 看');
  });
}
