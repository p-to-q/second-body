/**
 * 启动失败时观众看见的那一屏（docs/23 §S0）。
 *
 * 这是整件作品里**唯一**一个观众可能撞上的错误界面，所以它的要求和别处相反：
 * 不要信息量。一个人站在装置前面，看到堆栈只会觉得"坏了、走吧"；
 * 看到一句人话会觉得"它在等我"，然后给现场的人留出几十秒去救。
 *
 * 详情不丢，只是换一个收件人：观众得到一行字，控制台得到全部。
 */
export function showBootError(err: unknown): void {
  console.error('[main] boot failed:', err);
  console.info('[main] 兜底：?demo=1 用录制回放（不需要摄像头）；?selftest=1 逐项自检。');

  // 加载态还挂着的话先摘掉：两块浮层叠在一起时，观众会同时读到
  // 「正在准备零件 62%」和「稍等一下」—— 那比只有后面那一句更像坏了。
  document.querySelector('.sb-loading')?.remove();

  const el = document.createElement('div');
  el.className = 'sb-bootfail';
  el.setAttribute('role', 'alert');
  // 不用 innerHTML：err.message 里可能带任何东西，而这一屏正是最不该再出错的地方。
  const zh = document.createElement('p');
  zh.className = 'sb-zh';
  zh.textContent = '稍等一下';
  const en = document.createElement('p');
  en.className = 'sb-en';
  en.textContent = 'One moment';
  el.append(zh, en);

  // 样式内联而不是走 type.css：走到这里说明启动链断了，
  // 而样式表本身也可能是没加载成功的那一环 —— 这一屏必须自带全部依赖。
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:9999',
    'display:flex', 'flex-direction:column',
    'align-items:center', 'justify-content:center', 'gap:0.15em',
    'background:#0e0f12', 'color:#dfe4ea',
    'font:400 1.5rem/1.25 "Helvetica Neue",Helvetica,Arial,sans-serif',
    'letter-spacing:-0.01em', 'text-align:center', 'padding:48px',
  ].join(';');
  (en as HTMLElement).style.cssText = 'font-size:0.82em;color:#9aa0a6;margin:0.15em 0 0';
  (zh as HTMLElement).style.cssText = 'margin:0';

  document.body.appendChild(el);
}
