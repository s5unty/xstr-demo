import './styles.css';
import ckqmImageUrl from '../cqkm.png';
import { PRACTICE_TEXTS } from './content/practice';
import { DevStats } from './devtools/dev-stats';
import { GameEngine } from './game/game-engine';
import { type LexiconMap, loadLexicon, loadPunctuationMap } from './ime/lexicon';
import { QuickCodeIme } from './ime/quickcode-ime';
import { ThreeScene } from './render/three-scene';
import { InputOverlay } from './ui/input/input-overlay';

async function bootstrap(): Promise<void> {
  const app = document.querySelector<HTMLElement>('#app');
  if (!app) throw new Error('找不到应用根节点');

  const canvasWrap = document.createElement('div');
  canvasWrap.className = 'canvas-wrap';
  const overlay = new InputOverlay();
  const perfBadge = document.createElement('div');
  perfBadge.className = 'perf-badge';
  const ckqmGuide = document.createElement('img');
  ckqmGuide.className = 'ckqm-guide';
  ckqmGuide.src = ckqmImageUrl;
  ckqmGuide.alt = '快码键位图';

  app.append(canvasWrap, overlay.root, perfBadge, ckqmGuide);

  const three = new ThreeScene(canvasWrap);
  const devStats = new DevStats(perfBadge);
  const [lexicon, punctuationMap] = await Promise.all([loadLexicon(), loadPunctuationMap()]);
  const ime = new QuickCodeIme(lexicon, 4, punctuationMap);
  const game = new GameEngine();
  overlay.setCharCodeMap(buildCharCodeVariants(lexicon));
  overlay.setCustomTargetHandler((text) => {
    const normalized = normalizeCustomTarget(text);
    if (!normalized) {
      return { ok: false, message: '内容为空，请粘贴目标文本后再应用。' };
    }
    game.boot(normalized);
    ime.clear();
    three.setTargetLength(normalized.length);
    three.applyProgress(0);
    renderAll();
    return { ok: true, message: `已应用自定义目标（${normalized.length} 字）。按 Enter 开始。` };
  });

  let round = 0;
  const renderAll = (): void => {
    overlay.renderIme(ime.getSnapshot());
    overlay.renderGame(game.getSnapshot());
  };

  function resetRound(): void {
    const target = PRACTICE_TEXTS[round % PRACTICE_TEXTS.length];
    round += 1;
    game.boot(target);
    three.setTargetLength(target.length);
    three.applyProgress(0);
    renderAll();
  }

  resetRound();

  window.addEventListener('keydown', (event) => {
    let gameSnapshot = game.getSnapshot();

    if (event.key === 'Enter') {
      const state = gameSnapshot.state;
      if (state === 'menu' || state === 'result') {
        game.start();
        ime.clear();
        renderAll();
        event.preventDefault();
        return;
      }
    }

    if (gameSnapshot.state !== 'playing') {
      return;
    }

    const imeResult = ime.handleKey(event);

    if (!imeResult.consumed && event.key === 'Backspace') {
      game.backspaceConfirmed();
      gameSnapshot = game.getSnapshot();
      three.applyProgress(gameSnapshot.confirmedText.length);
    }

    if (imeResult.committedText) {
      const result = game.applyCommit(imeResult.committedText);
      gameSnapshot = game.getSnapshot();
      three.applyProgress(gameSnapshot.confirmedText.length);
      if (result.renderEvent) {
        three.onFeedback(result.renderEvent);
      }
      if (gameSnapshot.state === 'result') {
        ime.clear();
      }
    }

    if (imeResult.consumed) {
      event.preventDefault();
    }

    overlay.renderIme(ime.getSnapshot());
    overlay.renderGame(gameSnapshot);
  });

  window.addEventListener('keyup', (event) => {
    const result = ime.handleKeyUp(event);
    if (result.consumed) {
      event.preventDefault();
      overlay.renderIme(ime.getSnapshot());
    }
  });

  function tick(): void {
    devStats.tick();
    requestAnimationFrame(tick);
  }
  tick();

  canvasWrap.addEventListener('click', () => window.focus());
}

bootstrap().catch((error: unknown) => {
  const app = document.querySelector<HTMLElement>('#app');
  if (app) {
    app.textContent = `启动失败: ${error instanceof Error ? error.message : '未知错误'}`;
  }
});

function buildCharCodeVariants(lexicon: LexiconMap): Map<string, string[]> {
  const all = new Map<string, Map<string, number>>();
  for (const [code, entries] of lexicon.entries()) {
    if (code.length < 2 || code.length > 4) continue;
    if (!/^[a-zA-Z;]+$/.test(code)) continue;
    for (const item of entries) {
      if (item.text.length !== 1) continue;
      if (!all.has(item.text)) {
        all.set(item.text, new Map());
      }
      const bucket = all.get(item.text);
      if (!bucket) continue;
      const prev = bucket.get(code) ?? 0;
      if (item.weight > prev) {
        bucket.set(code, item.weight);
      }
    }
  }

  const out = new Map<string, string[]>();
  for (const [char, bucket] of all.entries()) {
    const variants = Array.from(bucket.entries())
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        if (a[0].length !== b[0].length) return a[0].length - b[0].length;
        return a[0].localeCompare(b[0]);
      })
      .slice(0, 8)
      .map(([code]) => code);
    if (variants.length > 0) {
      out.set(char, variants);
    }
  }
  return out;
}

function normalizeCustomTarget(input: string): string {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('');
}
