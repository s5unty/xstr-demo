import '../styles.css';
import { loadLexicon, loadPunctuationMap } from '../ime/lexicon';
import { QuickCodeIme } from '../ime/quickcode-ime';

async function mount(): Promise<void> {
  const root = document.querySelector<HTMLElement>('#debug-root');
  if (!root) throw new Error('调试节点不存在');

  const panel = document.createElement('div');
  panel.className = 'debug-panel';
  const rawEl = document.createElement('div');
  const candEl = document.createElement('div');
  const debugEl = document.createElement('div');
  const commitEl = document.createElement('div');

  panel.append(rawEl, candEl, debugEl, commitEl);
  root.append(panel);

  const [lexicon, punctuationMap] = await Promise.all([loadLexicon(), loadPunctuationMap()]);
  const ime = new QuickCodeIme(lexicon, 4, punctuationMap);

  const render = (): void => {
    const snap = ime.getSnapshot();
    rawEl.textContent = `码表: ${snap.raw || '(空)'}`;
    candEl.textContent =
      snap.candidates.length > 0
        ? snap.candidates
            .map((item, i) => `${i + 1}.${item.text}${item.pendingCode ? `(~${item.pendingCode})` : ''}`)
            .join('  ')
        : '候选: (无)';
    if (snap.debug) {
      debugEl.textContent =
        `调试: 直命中=${snap.debug.directCount} 组合命中=${snap.debug.composedCount}` +
        ` 组合路径=${snap.debug.composedFinalCount} 前缀补全触发=${snap.debug.prefixFallbackHits}` +
        ` 含大写=${snap.debug.hasUppercase ? '是' : '否'} 顶部组合=${snap.debug.topComposedText || '(无)'}`;
    } else {
      debugEl.textContent = '调试: (无)';
    }
  };

  render();

  window.addEventListener('keydown', (event) => {
    const ret = ime.handleKey(event);
    if (ret.consumed) {
      event.preventDefault();
    }
    if (ret.committedText) {
      commitEl.textContent = `上屏: ${ret.committedText}`;
    }
    render();
  });
}

mount().catch((err: unknown) => {
  const root = document.querySelector<HTMLElement>('#debug-root');
  if (root) {
    root.textContent = `调试页面启动失败: ${err instanceof Error ? err.message : '未知错误'}`;
  }
});
