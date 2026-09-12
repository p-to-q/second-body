#!/usr/bin/env node
import { checkBalance } from './rodin.ts';
import { generate } from './generate.ts';
import { RECIPES, PILOT_IDS } from '../recipes/catalog.ts';
import { load } from './ledger.ts';

const [, , cmd, ...rest] = process.argv;
const flag = (n: string) => rest.includes('--' + n);
const val = (n: string) => rest.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');

switch (cmd) {
  case 'balance':
    console.log(`余额 ${await checkBalance()} credits`);
    break;

  case 'plan': {
    const l = load();
    const rows = RECIPES.map((r) => {
      const e = l.entries[r.id];
      return `${(e?.status ?? '—').padEnd(10)} ${r.tier} ${r.id.padEnd(26)} ${r.slot.padEnd(9)} ${e?.durationSec ?? ''}`;
    });
    console.log('status     T id                         slot      sec');
    console.log(rows.join('\n'));
    console.log(`\n共 ${RECIPES.length} 个配方；pilot = ${PILOT_IDS.join(', ')}`);
    console.log(`已消耗 ${l.totalConsumed ?? 0} credits`);
    break;
  }

  case 'generate':
    await generate({
      pilot: flag('pilot'),
      theme: val('theme'),
      ids: val('ids')?.split(','),
      concurrency: Number(val('concurrency') ?? 3),
      dryRun: flag('dry-run'),
      noAnchor: flag('no-anchor'),
    });
    break;

  case 'roster':
  case 'themes': {
    const { ROSTER } = await import('../recipes/roster.ts');
    const kinds = ['archetype', 'guest', 'character'] as const;
    for (const k of kinds) {
      const rows = ROSTER.filter((e) => e.kind === k);
      if (!rows.length) continue;
      console.log(`\n── ${k} (${rows.length}) ──`);
      for (const t of rows)
        console.log(`${t.id.padEnd(15)} ${t.name.padEnd(5)} ${t.coverage.padEnd(6)} ${t.clearance.padEnd(14)} human=${t.axes.humanLike.toFixed(2)} life=${t.axes.lifeLike.toFixed(2)}  ${t.tagline}`);
    }
    break;
  }

  case 'curate': {
    const { loadCuration, setVerdict, summary } = await import('./curation.ts');
    const id = val('id'), v = val('verdict');
    if (id && v) {
      const c = setVerdict(id, v === 'none' ? null : (v as 'keep' | 'reject'), val('note'));
      console.log(`${id} → ${v}   (${summary(c)})`);
    } else {
      const c = loadCuration();
      const rows = Object.entries(c);
      if (!rows.length) console.log('还没有任何判断。去 /dev/parts.html 点部件评级，或用 --id= --verdict=keep|reject|none');
      for (const [k, e] of rows) console.log(`${e.verdict.padEnd(7)} ${k.padEnd(26)} ${e.note ?? ''}`);
      console.log('\n' + summary(c));
    }
    break;
  }

  case 'normalize': {
    const { normalizeAll } = await import('./normalize.ts');
    await normalizeAll({ only: val('ids')?.split(',') });
    break;
  }

  case 'index': {
    const { buildIndex } = await import('./index-parts.ts');
    await buildIndex();
    break;
  }

  default:
    console.log(`用法:
  npm run factory:balance
  npm run factory:plan
  npm run factory:themes                          # 看六个主题
  npm run factory:generate -- --theme=patrol --pilot   # 一个主题先跑 6 件（3.5 credits，含 anchor）
  npm run factory:generate -- --theme=patrol           # 一个主题全量 20 件（10 credits）
  npm run factory:generate -- --ids=a,b                # 指定
  npm run factory:generate -- --dry-run
  npm run factory:normalize
  npm run factory:index
  npm run factory:curate                                    # 看评级
  npm run factory:curate -- --id=<partId> --verdict=keep    # keep 的永不重生成`);
}
