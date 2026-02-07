import type { CandidateItem } from '../../types';
import type { GameSnapshot } from '../../game/game-engine';
import type { ImeSnapshot } from '../../types';

export class InputOverlay {
  readonly root: HTMLElement;
  private readonly targetLine: HTMLElement;
  private readonly targetPrevLine: HTMLElement;
  private readonly targetContent: HTMLElement;
  private readonly targetNextLine: HTMLElement;
  private readonly targetTopEllipsis: HTMLElement;
  private readonly targetBottomEllipsis: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly imeBubble: HTMLElement;
  private readonly imeRaw: HTMLElement;
  private readonly candidateLine: HTMLElement;
  private readonly statusLine: HTMLElement;
  private readonly modeLine: HTMLElement;
  private readonly metricLine: HTMLElement;
  private readonly customPanel: HTMLElement;
  private readonly customInput: HTMLTextAreaElement;
  private readonly customApplyBtn: HTMLButtonElement;
  private readonly customHint: HTMLElement;
  private readonly charCodeMap = new Map<string, string[]>();
  private gameSnapshot?: GameSnapshot;
  private imeSnapshot?: ImeSnapshot;
  private onApplyCustomTarget?: (text: string) => { ok: boolean; message?: string };
  private lastCursorX = -1;
  private lastCursorY = -1;
  private movingTimer = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'overlay-root';

    this.targetLine = document.createElement('div');
    this.targetLine.className = 'target-line';

    this.targetPrevLine = document.createElement('div');
    this.targetPrevLine.className = 'context-line context-prev';

    this.targetContent = document.createElement('div');
    this.targetContent.className = 'target-content focus-line';

    this.targetNextLine = document.createElement('div');
    this.targetNextLine.className = 'context-line context-next';

    this.targetTopEllipsis = document.createElement('div');
    this.targetTopEllipsis.className = 'target-ellipsis hidden';
    this.targetTopEllipsis.textContent = '…';

    this.targetBottomEllipsis = document.createElement('div');
    this.targetBottomEllipsis.className = 'target-ellipsis hidden';
    this.targetBottomEllipsis.textContent = '…';

    this.cursorEl = document.createElement('span');
    this.cursorEl.className = 'cursor floating-cursor';
    this.cursorEl.textContent = '|';

    this.imeBubble = document.createElement('div');
    this.imeBubble.className = 'ime-bubble';

    this.imeRaw = document.createElement('div');
    this.imeRaw.className = 'ime-raw';

    this.candidateLine = document.createElement('div');
    this.candidateLine.className = 'candidate-line';

    this.statusLine = document.createElement('div');
    this.statusLine.className = 'status-line';

    this.modeLine = document.createElement('div');
    this.modeLine.className = 'mode-line';

    this.metricLine = document.createElement('div');
    this.metricLine.className = 'metric-line';

    this.customPanel = document.createElement('div');
    this.customPanel.className = 'custom-target-panel';
    this.customInput = document.createElement('textarea');
    this.customInput.className = 'custom-target-input';
    this.customInput.placeholder = '粘贴自定义目标文本，点击“应用目标”立即更新当前练习';
    this.customInput.rows = 3;
    this.customApplyBtn = document.createElement('button');
    this.customApplyBtn.className = 'custom-target-apply';
    this.customApplyBtn.type = 'button';
    this.customApplyBtn.textContent = '应用目标';
    this.customHint = document.createElement('div');
    this.customHint.className = 'custom-target-hint';
    this.customHint.textContent = '支持直接粘贴中文句子或段落。';
    this.customPanel.append(this.customInput, this.customApplyBtn, this.customHint);

    this.targetLine.append(
      this.targetTopEllipsis,
      this.targetPrevLine,
      this.targetContent,
      this.targetNextLine,
      this.targetBottomEllipsis,
      this.cursorEl
    );
    this.imeBubble.append(this.imeRaw, this.candidateLine);
    this.root.append(this.targetLine, this.imeBubble, this.statusLine, this.modeLine, this.metricLine, this.customPanel);

    this.customApplyBtn.addEventListener('click', () => this.applyCustomTarget());
  }

  setCharCodeMap(map: Map<string, string[]>): void {
    this.charCodeMap.clear();
    for (const [char, codes] of map.entries()) {
      this.charCodeMap.set(char, codes);
    }
  }

  setCustomTargetHandler(handler: (text: string) => { ok: boolean; message?: string }): void {
    this.onApplyCustomTarget = handler;
  }

  renderGame(snapshot: GameSnapshot): void {
    this.gameSnapshot = snapshot;
    const { targetText, pendingCursorIndex, metrics, state } = snapshot;
    this.renderTargetLine();

    this.statusLine.textContent =
      state === 'menu'
        ? '按 Enter 开始，输入字母或 ; 触发候选，空格上屏首选，1~4 直选，- 下翻，0 上翻，Esc 清空码表。'
        : state === 'result'
          ? '本轮完成，按 Enter 重新开始。'
          : `当前位置: ${pendingCursorIndex + 1}/${targetText.length}`;

    this.metricLine.textContent =
      `CPM ${metrics.cpm} | 正确率 ${metrics.accuracy}% | 连击 ${metrics.combo} | 最高连击 ${metrics.maxCombo}`;
  }

  renderIme(snapshot: ImeSnapshot): void {
    this.imeSnapshot = snapshot;
    const modeLabel = snapshot.mode === 'en' ? '英文' : '中文';
    this.modeLine.textContent = `输入模式：${modeLabel}（Shift 切换）`;
    this.imeRaw.textContent = this.formatRaw(snapshot.raw);
    this.candidateLine.innerHTML = this.formatCandidates(snapshot.candidates, snapshot.page);
    const visible = snapshot.raw.length > 0;
    this.imeBubble.classList.toggle('hidden', !visible);
    this.renderTargetLine();
  }

  private renderTargetLine(): void {
    if (!this.gameSnapshot) {
      return;
    }
    if (this.gameSnapshot.state === 'menu') {
      const menuView = computeLineView(this.targetLine.clientWidth, this.gameSnapshot.targetText, 0);
      this.targetPrevLine.innerHTML = '&nbsp;';
      this.targetContent.innerHTML = '';
      this.targetNextLine.innerHTML = renderContextLine(
        this.gameSnapshot.targetText.slice(menuView.currentStart, menuView.currentEnd),
        this.charCodeMap,
        'context-next-char'
      );
      this.targetTopEllipsis.classList.add('hidden');
      this.targetBottomEllipsis.classList.toggle('hidden', menuView.currentEnd >= this.gameSnapshot.targetText.length);
      this.cursorEl.classList.add('hidden');
      return;
    }
    this.cursorEl.classList.remove('hidden');
    const { targetText, confirmedText, pendingCursorIndex } = this.gameSnapshot;
    const firstCandidate = this.imeSnapshot?.candidates[0]?.text ?? '';
    const raw = this.imeSnapshot?.raw ?? '';
    const rawAlignment = alignRawToTarget(raw, targetText, pendingCursorIndex, this.charCodeMap);
    const candidateMatchLen = getCandidatePrefixMatchLength(targetText, pendingCursorIndex, firstCandidate);
    const candidateWarnLen = getCandidateWarningLength(
      targetText,
      pendingCursorIndex,
      firstCandidate,
      candidateMatchLen
    );
    const rawWarnLen = getRawWarningLength(
      raw,
      targetText,
      pendingCursorIndex,
      rawAlignment,
      this.charCodeMap
    );
    const stableMatchLen = candidateMatchLen > 0 ? candidateMatchLen : rawAlignment.matchedChars;
    const yellowEnd = Math.min(targetText.length, pendingCursorIndex + stableMatchLen);
    const orangeEnd = Math.min(
      targetText.length,
      Math.max(
        pendingCursorIndex + rawAlignment.matchedChars + rawWarnLen,
        pendingCursorIndex + candidateMatchLen + candidateWarnLen
      )
    );
    const virtualCursorIndex = Math.min(
      targetText.length,
      pendingCursorIndex + Math.max(candidateMatchLen, rawAlignment.matchedChars)
    );

    const lineView = computeLineView(this.targetLine.clientWidth, targetText, pendingCursorIndex);
    const parts: string[] = [];
    for (let i = lineView.currentStart; i < lineView.currentEnd; i += 1) {
      const targetChar = targetText[i] ?? '';
      let stateClass = 'pending-char';
      if (i < confirmedText.length) {
        stateClass = confirmedText[i] === targetChar ? 'typed-ok' : 'typed-bad';
      } else if (i < yellowEnd) {
        stateClass = 'preview-match';
      } else if (i < orangeEnd) {
        stateClass = 'preview-warn';
      }
      parts.push(
        `<span class="char-cell focus-char-cell ${stateClass}">` +
          `<span class="char-glyph">${escapeHtml(targetChar)}</span>` +
        '</span>'
      );
    }
    this.targetPrevLine.innerHTML = renderContextLine(
      lineView.prevText,
      this.charCodeMap,
      'context-prev-char'
    );
    this.targetContent.innerHTML = parts.join('');
    this.targetNextLine.innerHTML = renderContextLine(
      lineView.nextText,
      this.charCodeMap,
      'context-next-char'
    );
    this.targetTopEllipsis.classList.toggle('hidden', !lineView.hasMoreAbove);
    this.targetBottomEllipsis.classList.toggle('hidden', !lineView.hasMoreBelow);
    this.positionCursor(virtualCursorIndex, lineView.currentStart, lineView.currentEnd);
    this.positionImeBubble();
  }

  private formatCandidates(candidates: CandidateItem[], page: number): string {
    if (candidates.length === 0) {
      return '';
    }
    const targetText = this.gameSnapshot?.targetText ?? '';
    const cursor = this.gameSnapshot?.pendingCursorIndex ?? 0;
    const rows = candidates
      .map((item, idx) => {
        const isFirstExact = idx === 0 && getPreviewMatchLength(targetText, cursor, item.text) > 0;
        const textHtml = isFirstExact
          ? `<span class="candidate-match">${escapeHtml(item.text)}</span>`
          : escapeHtml(item.text);
        const pendingCode = item.pendingCode ? `(<span class="pending-code">~${escapeHtml(item.pendingCode)}</span>)` : '';
        return `<div class="candidate-row">${idx + 1}. ${textHtml}${pendingCode}</div>`;
      })
      .join('');
    return `${rows}<div class="candidate-page">第 ${page + 1} 页</div>`;
  }

  private formatRaw(raw: string): string {
    if (!raw) return '(空)';
    if (!this.gameSnapshot) {
      return splitByPair(raw).join(' ');
    }

    const { targetText, pendingCursorIndex } = this.gameSnapshot;
    const aligned = alignRawToTarget(raw, targetText, pendingCursorIndex, this.charCodeMap);
    if (aligned.segments.length > 0) {
      if (aligned.matchedLen < raw.length) {
        return [...aligned.segments, raw.slice(aligned.matchedLen)].join(' ');
      }
      return aligned.segments.join(' ');
    }
    return splitByPair(raw).join(' ');
  }

  private positionCursor(virtualCursorIndex: number, visibleStart: number, visibleEnd: number): void {
    const cells = this.targetContent.querySelectorAll<HTMLElement>('.focus-char-cell');
    const lineRect = this.targetLine.getBoundingClientRect();
    const focusRect = this.targetContent.getBoundingClientRect();
    if (cells.length === 0) {
      const fallbackX = Math.max(8, focusRect.left - lineRect.left + 2);
      const fallbackY = Math.max(8, focusRect.top - lineRect.top + 4);
      this.cursorEl.style.left = `${fallbackX}px`;
      this.cursorEl.style.top = `${fallbackY}px`;
      return;
    }
    const visibleLength = Math.max(0, visibleEnd - visibleStart);
    const localCursorIndex = Math.min(Math.max(virtualCursorIndex - visibleStart, 0), visibleLength);
    const idx = Math.min(Math.max(localCursorIndex, 0), cells.length);
    const ref = idx >= cells.length ? cells[cells.length - 1] : cells[idx];
    const refRect = ref.getBoundingClientRect();
    const x = idx >= cells.length ? refRect.right - lineRect.left + 2 : refRect.left - lineRect.left - 4;
    const rawY = refRect.top - lineRect.top + Math.max(0, (refRect.height - this.cursorEl.offsetHeight) / 2);
    const minY = Math.max(4, focusRect.top - lineRect.top + 2);
    const maxY = Math.max(minY, focusRect.bottom - lineRect.top - this.cursorEl.offsetHeight - 2);
    const y = Math.max(minY, Math.min(rawY, maxY));
    if (Math.abs(x - this.lastCursorX) > 1 || Math.abs(y - this.lastCursorY) > 1) {
      this.cursorEl.classList.add('cursor-moving');
      if (this.movingTimer) {
        window.clearTimeout(this.movingTimer);
      }
      this.movingTimer = window.setTimeout(() => {
        this.cursorEl.classList.remove('cursor-moving');
      }, 180);
    }
    this.lastCursorX = x;
    this.lastCursorY = y;
    this.cursorEl.style.left = `${x}px`;
    this.cursorEl.style.top = `${y}px`;
  }

  private positionImeBubble(): void {
    const anchor = this.cursorEl;
    if (this.imeBubble.classList.contains('hidden')) return;
    const rootRect = this.root.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const bubbleWidth = this.imeBubble.offsetWidth || 240;
    const left = anchorRect.left - rootRect.left;
    const top = anchorRect.bottom - rootRect.top + 18;
    const clampedLeft = Math.min(Math.max(8, left), Math.max(8, rootRect.width - bubbleWidth - 8));
    this.imeBubble.style.left = `${clampedLeft}px`;
    this.imeBubble.style.top = `${Math.max(8, top)}px`;
  }

  private applyCustomTarget(): void {
    const text = this.customInput.value;
    if (!this.onApplyCustomTarget) {
      this.customHint.textContent = '目标更新功能未接入。';
      return;
    }
    const result = this.onApplyCustomTarget(text);
    this.customHint.textContent = result.message ?? (result.ok ? '已更新当前目标。' : '目标更新失败。');
    this.customHint.classList.toggle('error', !result.ok);
    if (result.ok) {
      this.customInput.value = '';
    }
  }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function getPreviewMatchLength(targetText: string, cursor: number, firstCandidate: string): number {
  return getCandidatePrefixMatchLength(targetText, cursor, firstCandidate);
}

function splitByPair(raw: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    out.push(raw.slice(i, i + 2));
  }
  return out;
}

function formatDisplayCode(variants?: string[]): string {
  if (!variants || variants.length === 0) return '';
  const primary = variants[0] ?? '';
  if (isPunctuationCode(primary)) {
    return '';
  }
  if (isYiJianCode(primary)) {
    return primary.slice(0, 1);
  }
  return primary.slice(0, 2);
}

function isYiJianCode(code: string): boolean {
  return code.length === 2 && /^[a-z]$/.test(code[0] ?? '') && (code[1] === ';' || code[1] === 'z');
}

function isPunctuationCode(code: string): boolean {
  return !/[a-zA-Z;]/.test(code);
}

function alignRawToTarget(
  raw: string,
  targetText: string,
  cursor: number,
  charCodeMap: Map<string, string[]>
): { matchedChars: number; matchedLen: number; segments: string[] } {
  if (!raw) {
    return { matchedChars: 0, matchedLen: 0, segments: [] };
  }

  const memo = new Map<string, { matchedChars: number; matchedLen: number; segments: string[] }>();

  const dfs = (charIndex: number, pos: number): { matchedChars: number; matchedLen: number; segments: string[] } => {
    const key = `${charIndex}:${pos}`;
    const cached = memo.get(key);
    if (cached) return cached;

    let best = { matchedChars: 0, matchedLen: pos, segments: [] as string[] };
    if (pos >= raw.length || charIndex >= targetText.length) {
      memo.set(key, best);
      return best;
    }

    const char = targetText[charIndex] ?? '';
    const variants = charCodeMap.get(char) ?? [];
    for (const code of variants) {
      if (!raw.startsWith(code, pos)) continue;
      const next = dfs(charIndex + 1, pos + code.length);
      const candidate = {
        matchedChars: next.matchedChars + 1,
        matchedLen: next.matchedLen,
        segments: [code, ...next.segments]
      };
      if (
        candidate.matchedChars > best.matchedChars ||
        (candidate.matchedChars === best.matchedChars && candidate.matchedLen > best.matchedLen)
      ) {
        best = candidate;
      }
    }

    memo.set(key, best);
    return best;
  };

  return dfs(cursor, 0);
}

function getRawWarningLength(
  raw: string,
  targetText: string,
  cursor: number,
  alignment: { matchedChars: number; matchedLen: number; segments: string[] },
  charCodeMap: Map<string, string[]>
): number {
  const remain = raw.slice(alignment.matchedLen);
  if (!remain) return 0;

  let charIdx = cursor + alignment.matchedChars;
  let pos = 0;
  let warnChars = 0;

  while (charIdx < targetText.length && pos < remain.length) {
    const char = targetText[charIdx] ?? '';
    const variants = charCodeMap.get(char) ?? [];
    if (variants.length === 0) break;

    let advanced = false;
    for (const code of variants) {
      if (remain.startsWith(code, pos)) {
        pos += code.length;
        warnChars += 1;
        charIdx += 1;
        advanced = true;
        break;
      }
    }
    if (advanced) continue;

    const tail = remain.slice(pos);
    const partial = variants.some((code) => code.startsWith(tail));
    if (partial) {
      warnChars += 1;
    }
    break;
  }

  return warnChars;
}

function getCandidatePrefixMatchLength(targetText: string, cursor: number, candidate: string): number {
  if (!candidate || cursor >= targetText.length) return 0;
  const maxLen = Math.min(candidate.length, targetText.length - cursor);
  let len = 0;
  while (len < maxLen) {
    if ((candidate[len] ?? '') !== (targetText[cursor + len] ?? '')) {
      break;
    }
    len += 1;
  }
  return len;
}

function getCandidateWarningLength(
  targetText: string,
  cursor: number,
  candidate: string,
  matchedPrefix: number
): number {
  if (!candidate || cursor >= targetText.length) return 0;
  const remainTarget = targetText.length - cursor - matchedPrefix;
  if (remainTarget <= 0) return 0;
  const remainCandidate = candidate.length - matchedPrefix;
  if (remainCandidate <= 0) return 0;
  return Math.min(remainTarget, remainCandidate);
}

function computeLineView(
  containerWidth: number,
  targetText: string,
  cursorIndex: number
): {
  currentStart: number;
  currentEnd: number;
  prevText: string;
  nextText: string;
  hasMoreAbove: boolean;
  hasMoreBelow: boolean;
} {
  const estimateCharWidth = 42;
  const safeWidth = Math.max(360, containerWidth);
  const charsPerLine = Math.max(1, Math.floor((safeWidth - 56) / estimateCharWidth));
  const totalChars = targetText.length;
  const safeCursor = Math.min(Math.max(cursorIndex, 0), Math.max(0, totalChars - 1));
  const cursorLine = Math.floor(safeCursor / charsPerLine);
  const currentStart = Math.min(totalChars, cursorLine * charsPerLine);
  const currentEnd = Math.min(totalChars, currentStart + charsPerLine);
  const prevStart = Math.max(0, currentStart - charsPerLine);
  const prevEnd = currentStart;
  const nextStart = currentEnd;
  const nextEnd = Math.min(totalChars, currentEnd + charsPerLine);
  return {
    currentStart,
    currentEnd,
    prevText: targetText.slice(prevStart, prevEnd),
    nextText: targetText.slice(nextStart, nextEnd),
    hasMoreAbove: prevStart > 0,
    hasMoreBelow: nextEnd < totalChars
  };
}

function renderContextLine(
  text: string,
  charCodeMap: Map<string, string[]>,
  charClass: string
): string {
  if (!text) return '&nbsp;';
  const out: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i] ?? '';
    const code = formatDisplayCode(charCodeMap.get(ch));
    out.push(
      `<span class="char-cell context-char-cell ${charClass}">` +
        `<span class="char-code">${escapeHtml(code)}</span>` +
        `<span class="char-glyph">${escapeHtml(ch)}</span>` +
      '</span>'
    );
  }
  return out.join('');
}
