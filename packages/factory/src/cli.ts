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

  case 'themes': {
    const { THEMES } = await import('../recipes/themes.ts');
    for (const t of THEMES)
      console.log(`${t.id.padEnd(12)} ${t.name.padEnd(4)} ${t.source.padEnd(10)} ${t.tagline}\n${' '.repeat(13)}${t.tension}\n`);
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
  npm run factory:index`);
}
