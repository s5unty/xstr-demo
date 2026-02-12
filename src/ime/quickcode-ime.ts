import type { CandidateItem, ImeCommitResult, ImeSnapshot } from '../types';
import type { LexiconMap, PunctuationMap } from './lexicon';

const CODE_KEY_RE = /^[a-zA-Z;]$/;
const EN_DIRECT_KEY_RE = /^[\x20-\x7E]$/;
const COMPOSE_BEAM_WIDTH = 8;
const COMPOSE_MAX_TERMINALS = 5;
const COMPOSE_MAX_SEGMENTS = 12;
const PREFIX_SINGLE_LIMIT = 1;
const PREFIX_MIN_WEIGHT = 500000000;
const PREFIX_DOMINANCE_RATIO = 20;
const PREFIX_SCAN_NODE_LIMIT = 600;
const PREFIX_CANDIDATE_LIMIT = 24;
const SEGMENT_BASE_PENALTY = 700000000;
const SEGMENT_EXTRA_CHAR_BONUS = 1000000000;
const PREFIX_SEGMENT_EXTRA_PENALTY = 1200000000;
const LONE_SEMICOLON_PUNCT = '、';

interface TrieNode {
  children: Map<string, TrieNode>;
  entries: CandidateItem[];
}

interface ComposePath {
  text: string;
  score: number;
  segments: number;
  hasUppercaseSegment: boolean;
}

interface ComposeBuildResult {
  candidates: CandidateItem[];
  finalCount: number;
  prefixFallbackHits: number;
}

export class QuickCodeIme {
  private raw = '';
  private page = 0;
  private mode: 'zh' | 'en' = 'zh';
  private pendingShiftToggle = false;
  private readonly lexicon: LexiconMap;
  private readonly pageSize: number;
  private trieRoot: TrieNode = { children: new Map(), entries: [] };
  private prefixSingleCandidates: Map<string, CandidateItem[]> = new Map();
  private leadSingleCandidates: Map<string, CandidateItem[]> = new Map();
  private lexiconRevision = 0;
  private trieBuiltRevision = -1;
  private prefixBuiltRevision = -1;
  private readonly punctuationMap: PunctuationMap;
  private readonly punctPairState: Map<string, number> = new Map();
  private lastDebug = {
    hasUppercase: false,
    directCount: 0,
    composedCount: 0,
    composedFinalCount: 0,
    prefixFallbackHits: 0,
    topComposedText: ''
  };

  constructor(lexicon: LexiconMap, pageSize = 4, punctuationMap: PunctuationMap = new Map()) {
    this.lexicon = lexicon;
    this.pageSize = pageSize;
    this.punctuationMap = punctuationMap;
    this.lexiconRevision = 1;
    this.ensureIndexes();
  }

  handleKey(event: KeyboardEvent): ImeCommitResult {
    if (event.key === 'Shift') {
      this.pendingShiftToggle = true;
      return { committedText: '', consumed: true };
    }

    if (this.pendingShiftToggle) {
      this.pendingShiftToggle = false;
    }

    if (event.key === 'Escape') {
      this.clear();
      return { committedText: '', consumed: true };
    }

    if (event.key === 'Backspace') {
      if (this.raw.length > 0) {
        this.raw = this.raw.slice(0, -1);
        this.page = 0;
        return { committedText: '', consumed: true };
      }
      return { committedText: '', consumed: false };
    }

    if (this.mode === 'en') {
      if (EN_DIRECT_KEY_RE.test(event.key)) {
        return { committedText: event.key, consumed: true };
      }
      if (event.key === 'Enter') {
        return { committedText: '', consumed: false };
      }
      return { committedText: '', consumed: false };
    }

    const key = event.key;
    if (/^[0-9]$/.test(key) && this.raw.length === 0) {
      return { committedText: key, consumed: true };
    }

    if (event.key === '-' || event.key === 'ArrowRight') {
      const total = this.getAllCandidates().length;
      const maxPage = Math.max(0, Math.ceil(total / this.pageSize) - 1);
      this.page = Math.min(maxPage, this.page + 1);
      return { committedText: '', consumed: true };
    }

    if (event.key === '0' || event.key === 'ArrowLeft') {
      this.page = Math.max(0, this.page - 1);
      return { committedText: '', consumed: true };
    }

    // 单独输入分号时，按符号表直接上屏顿号；但 raw 非空时仍可作为码表输入（如 d;）。
    if (event.key === ';' && this.raw.length === 0) {
      return { committedText: LONE_SEMICOLON_PUNCT, consumed: true };
    }

    const punct = this.punctuationMap.get(key);
    if (punct) {
      const symbol = this.pickPunctuation(key, punct);
      let committedText = symbol;
      if (this.raw.length > 0) {
        const candidate = this.getCurrentPageCandidates()[0];
        this.clear();
        if (candidate) {
          committedText = `${candidate.text}${symbol}`;
        }
      }
      return { committedText, consumed: true };
    }

    if (CODE_KEY_RE.test(key)) {
      this.raw += key;
      this.page = 0;
      return { committedText: '', consumed: true };
    }

    if (event.key === ' ') {
      const candidate = this.getCurrentPageCandidates()[0];
      if (candidate) {
        this.clear();
        return { committedText: candidate.text, consumed: true };
      }
      return { committedText: '', consumed: false };
    }

    if (/^[1-4]$/.test(event.key)) {
      const index = Number(event.key) - 1;
      const candidate = this.getCurrentPageCandidates()[index];
      if (candidate) {
        this.clear();
        return { committedText: candidate.text, consumed: true };
      }
      return { committedText: '', consumed: true };
    }

    if (event.key === 'Enter') {
      const candidate = this.getCurrentPageCandidates()[0];
      if (candidate) {
        this.clear();
        return { committedText: candidate.text, consumed: true };
      }
      return { committedText: '', consumed: false };
    }

    return { committedText: '', consumed: false };
  }

  handleKeyUp(event: KeyboardEvent): ImeCommitResult {
    if (event.key !== 'Shift') {
      return { committedText: '', consumed: false };
    }
    if (!this.pendingShiftToggle) {
      return { committedText: '', consumed: false };
    }
    this.pendingShiftToggle = false;
    this.mode = this.mode === 'zh' ? 'en' : 'zh';
    this.clear();
    return { committedText: '', consumed: true };
  }

  private pickPunctuation(key: string, entry: { outputs: string[]; pair: boolean }): string {
    if (entry.outputs.length === 0) {
      return '';
    }
    if (!entry.pair || entry.outputs.length < 2) {
      return entry.outputs[0];
    }
    const idx = this.punctPairState.get(key) ?? 0;
    const output = entry.outputs[idx % entry.outputs.length];
    this.punctPairState.set(key, idx + 1);
    return output;
  }

  getSnapshot(): ImeSnapshot {
    const allCandidates = this.getAllCandidates();
    const start = this.page * this.pageSize;
    return {
      raw: this.raw,
      candidates: allCandidates.slice(start, start + this.pageSize),
      page: this.page,
      pageSize: this.pageSize,
      mode: this.mode,
      debug: this.lastDebug
    };
  }

  clear(): void {
    this.raw = '';
    this.page = 0;
  }

  mergeLexicon(partial: LexiconMap): boolean {
    let changed = false;
    for (const [code, entries] of partial.entries()) {
      const prev = this.lexicon.get(code);
      if (isSameEntries(prev, entries)) {
        continue;
      }
      this.lexicon.set(code, entries);
      changed = true;
    }
    if (changed) {
      this.lexiconRevision += 1;
    }
    return changed;
  }

  getLexicon(): LexiconMap {
    return this.lexicon;
  }

  private getAllCandidates(): CandidateItem[] {
    this.ensureIndexes();
    if (!this.raw) {
      this.lastDebug = {
        hasUppercase: false,
        directCount: 0,
        composedCount: 0,
        composedFinalCount: 0,
        prefixFallbackHits: 0,
        topComposedText: ''
      };
      return [];
    }
    const direct = this.lexicon.get(this.raw) ?? [];
    const composed = this.buildComposedCandidates(this.raw);
    const prefixed = this.isSingleLeadInput(this.raw)
      ? this.leadSingleCandidates.get(this.raw) ?? []
      : this.buildPrefixedCandidates(this.raw);
    const longestPrefix = this.buildLongestPrefixCandidates(this.raw);

    this.lastDebug = {
      hasUppercase: containsUppercase(this.raw),
      directCount: direct.length,
      composedCount: composed.candidates.length + prefixed.length,
      composedFinalCount: composed.finalCount,
      prefixFallbackHits: composed.prefixFallbackHits,
      topComposedText: composed.candidates[0]?.text ?? ''
    };

    if (direct.length > 0) {
      return dedupByText(mergeAndSortCandidates(direct, prefixed));
    }

    if (composed.candidates.length === 0 && prefixed.length === 0) {
      if (longestPrefix.length > 0) {
        return longestPrefix;
      }
      return [];
    }

    return dedupByText(mergeAndSortCandidates(composed.candidates, prefixed));
  }

  private getCurrentPageCandidates(): CandidateItem[] {
    const all = this.getAllCandidates();
    const start = this.page * this.pageSize;
    return all.slice(start, start + this.pageSize);
  }

  private buildComposedCandidates(raw: string): ComposeBuildResult {
    if (raw.length < 4) {
      return { candidates: [], finalCount: 0, prefixFallbackHits: 0 };
    }
    const boundaries = buildCodeBoundaries(raw);
    const boundarySet = new Set<number>(boundaries);
    if (!boundarySet.has(raw.length)) {
      return { candidates: [], finalCount: 0, prefixFallbackHits: 0 };
    }

    const maxSegments = Math.min(COMPOSE_MAX_SEGMENTS, Math.max(2, Math.floor(raw.length / 2)));
    const hasUppercaseInRaw = containsUppercase(raw);
    const states: ComposePath[][] = Array.from({ length: raw.length + 1 }, () => []);
    states[0] = [{ text: '', score: 0, segments: 0, hasUppercaseSegment: false }];
    let prefixFallbackHits = 0;

    for (const i of boundaries) {
      if (i >= raw.length) continue;
      const paths = states[i];
      if (paths.length === 0) continue;

      for (const path of paths.slice(0, COMPOSE_BEAM_WIDTH)) {
        if (path.segments >= maxSegments) continue;

        let node: TrieNode | undefined = this.trieRoot;
        let segmentHasUppercase = false;
        for (let j = i; j < raw.length; j += 1) {
          const currentChar = raw[j];
          if (isUppercaseChar(currentChar)) {
            segmentHasUppercase = true;
          }
          node = node.children.get(currentChar);
          if (!node) break;
          if (!boundarySet.has(j + 1)) continue;
          if (node.entries.length === 0) continue;
          const segmentCode = raw.slice(i, j + 1);
          const segmentIsYiJian = isYiJianSegmentCode(segmentCode);

          for (const cand of node.entries.slice(0, COMPOSE_MAX_TERMINALS)) {
            if (
              cand.text.length < 2 &&
              !(
                cand.text.length === 1 &&
                (
                  segmentHasUppercase ||
                  segmentIsYiJian ||
                  path.hasUppercaseSegment ||
                  path.text.length > 0 ||
                  (hasUppercaseInRaw && j < raw.length - 1)
                )
              )
            ) {
              continue;
            }
            const next: ComposePath = {
              text: `${path.text}${cand.text}`,
              score: path.score + calcSegmentScore(cand),
              segments: path.segments + 1,
              hasUppercaseSegment: path.hasUppercaseSegment || segmentHasUppercase
            };
            insertPath(states[j + 1], next);
          }

          const prefixSingles = this.prefixSingleCandidates.get(segmentCode) ?? [];
          if (prefixSingles.length > 0 && (j < raw.length - 1 || segmentHasUppercase)) {
            prefixFallbackHits += 1;
            for (const cand of prefixSingles.slice(0, COMPOSE_MAX_TERMINALS)) {
              const next: ComposePath = {
                text: `${path.text}${cand.text}`,
                score: path.score + calcSegmentScore(cand, true),
                segments: path.segments + 1,
                hasUppercaseSegment: path.hasUppercaseSegment || segmentHasUppercase
              };
              insertPath(states[j + 1], next);
            }
          }
        }
      }
    }

    const finals = states[raw.length].filter((item) => item.segments >= 2);
    if (finals.length === 0) {
      return { candidates: [], finalCount: 0, prefixFallbackHits };
    }

    const byText = new Map<string, number>();
    for (const path of finals) {
      const prev = byText.get(path.text) ?? Number.NEGATIVE_INFINITY;
      if (path.score > prev) {
        byText.set(path.text, path.score);
      }
    }

    const candidates = Array.from(byText.entries())
      .map(([text, weight]) => ({ text, code: raw, weight }))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20);
    return {
      candidates,
      finalCount: finals.length,
      prefixFallbackHits
    };
  }

  private buildPrefixedCandidates(raw: string): CandidateItem[] {
    let node: TrieNode | undefined = this.trieRoot;
    for (const ch of raw) {
      node = node.children.get(ch);
      if (!node) {
        return [];
      }
    }

    const dedup = new Map<string, CandidateItem>();
    const queue: Array<{ node: TrieNode; suffix: string }> = [{ node, suffix: '' }];
    let cursor = 0;
    let visited = 0;

    while (cursor < queue.length && visited < PREFIX_SCAN_NODE_LIMIT) {
      const current = queue[cursor];
      cursor += 1;
      if (!current) break;
      visited += 1;

      if (current.suffix.length > 0) {
        if (containsUppercase(current.suffix)) {
          // 补码提示候选仅展示可直接追加的小写补码，避免 ch -> 成(~I) 这类干扰项前置。
        } else {
        for (const entry of current.node.entries) {
          if (entry.text.length !== 1) {
            continue;
          }
          const pendingCode = current.suffix;
          const key = `${entry.text}|${pendingCode}`;
          const cand: CandidateItem = {
            text: entry.text,
            code: entry.code,
            weight: entry.weight,
            pendingCode
          };
          const prev = dedup.get(key);
          if (!prev || cand.weight > prev.weight) {
            dedup.set(key, cand);
          }
        }
        }
      }

      for (const [ch, child] of current.node.children) {
        queue.push({ node: child, suffix: `${current.suffix}${ch}` });
      }
    }

    return Array.from(dedup.values())
      .sort((a, b) => {
        const lenDiff = (a.pendingCode?.length ?? 0) - (b.pendingCode?.length ?? 0);
        if (lenDiff !== 0) return lenDiff;
        return b.weight - a.weight;
      })
      .slice(0, PREFIX_CANDIDATE_LIMIT);
  }

  private buildLongestPrefixCandidates(raw: string): CandidateItem[] {
    const boundaries = buildCodeBoundaries(raw);
    for (let k = boundaries.length - 1; k >= 0; k -= 1) {
      const i = boundaries[k];
      if (i <= 0 || i >= raw.length) continue;
      const code = raw.slice(0, i);
      const entries = this.lexicon.get(code);
      if (!entries || entries.length === 0) continue;
      return entries.slice(0, 20);
    }
    return [];
  }

  private isSingleLeadInput(raw: string): boolean {
    return raw.length === 1 && raw[0] >= 'a' && raw[0] <= 'z';
  }

  private ensureIndexes(): void {
    if (this.trieBuiltRevision !== this.lexiconRevision) {
      this.trieRoot = buildTrie(this.lexicon);
      this.trieBuiltRevision = this.lexiconRevision;
    }
    if (this.prefixBuiltRevision !== this.lexiconRevision) {
      this.prefixSingleCandidates = buildPrefixSingleCandidates(this.lexicon);
      this.leadSingleCandidates = buildLeadSingleCandidates(this.lexicon);
      this.prefixBuiltRevision = this.lexiconRevision;
    }
  }
}

function mergeAndSortCandidates(primary: CandidateItem[], secondary: CandidateItem[]): CandidateItem[] {
  const merged = new Map<string, CandidateItem>();
  for (const item of primary) {
    merged.set(makeCandidateKey(item), item);
  }
  for (const item of secondary) {
    const key = makeCandidateKey(item);
    const prev = merged.get(key);
    if (!prev || item.weight > prev.weight) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    const aRank = candidateSortRank(a);
    const bRank = candidateSortRank(b);
    if (aRank !== bRank) return aRank - bRank;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.text.localeCompare(b.text, 'zh-Hans-CN');
  });
}

function candidateSortRank(item: CandidateItem): number {
  if (!item.pendingCode && !item.syntheticShort) return 0;
  if (item.pendingCode) return 1;
  return 2;
}

function dedupByText(items: CandidateItem[]): CandidateItem[] {
  // 候选栏同字/同词去重：优先保留排序更靠前的条目，避免「仍」和「仍(~b)」同时出现。
  const byText = new Map<string, CandidateItem>();
  for (const item of items) {
    if (!byText.has(item.text)) {
      byText.set(item.text, item);
    }
  }
  return Array.from(byText.values());
}

function isSameEntries(prev: CandidateItem[] | undefined, next: CandidateItem[]): boolean {
  if (!prev || prev.length !== next.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i += 1) {
    const a = prev[i];
    const b = next[i];
    if (
      a.text !== b.text ||
      a.code !== b.code ||
      a.weight !== b.weight ||
      a.pendingCode !== b.pendingCode ||
      a.syntheticShort !== b.syntheticShort
    ) {
      return false;
    }
  }
  return true;
}

function insertPath(bucket: ComposePath[], path: ComposePath): void {
  const prevIndex = bucket.findIndex(
    (item) => item.text === path.text && item.hasUppercaseSegment === path.hasUppercaseSegment
  );
  if (prevIndex >= 0) {
    if (path.score > bucket[prevIndex].score) {
      bucket[prevIndex] = path;
    }
  } else {
    bucket.push(path);
  }
  bucket.sort((a, b) => b.score - a.score);
  if (bucket.length > COMPOSE_BEAM_WIDTH) {
    bucket.length = COMPOSE_BEAM_WIDTH;
  }
}

function buildTrie(lexicon: LexiconMap): TrieNode {
  const root: TrieNode = { children: new Map(), entries: [] };
  for (const [code, entries] of lexicon.entries()) {
    if (!code || entries.length === 0) continue;
    let node = root;
    for (const ch of code) {
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map(), entries: [] };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.entries = entries;
  }
  return root;
}

function calcSegmentScore(item: CandidateItem, prefixFallback = false): number {
  const lenBonus = (Math.max(item.text.length, 1) - 1) * SEGMENT_EXTRA_CHAR_BONUS;
  const fallbackPenalty = prefixFallback ? PREFIX_SEGMENT_EXTRA_PENALTY : 0;
  return item.weight + lenBonus - SEGMENT_BASE_PENALTY - fallbackPenalty;
}

function buildCodeBoundaries(raw: string): number[] {
  const result: number[] = [0];
  let i = 0;
  while (i < raw.length) {
    if (!isLowercaseChar(raw[i])) break;
    if (i + 1 >= raw.length || !isSecondCodeChar(raw[i + 1])) break;
    if (i + 2 < raw.length && isUppercaseChar(raw[i + 2])) {
      i += 3;
      result.push(i);
      continue;
    }
    i += 2;
    result.push(i);
  }
  return result;
}

function isUppercaseChar(char: string): boolean {
  return char >= 'A' && char <= 'Z';
}

function isLowercaseChar(char: string): boolean {
  return char >= 'a' && char <= 'z';
}

function isSecondCodeChar(char: string): boolean {
  return isLowercaseChar(char) || char === ';';
}

function containsUppercase(text: string): boolean {
  for (const char of text) {
    if (isUppercaseChar(char)) {
      return true;
    }
  }
  return false;
}

function makeCandidateKey(item: CandidateItem): string {
  return `${item.text}|${item.pendingCode ?? ''}`;
}

function isYiJianSegmentCode(code: string): boolean {
  if (code.length !== 2) return false;
  const [a, b] = code;
  return a >= 'a' && a <= 'z' && (b === ';' || b === 'z');
}

function buildPrefixSingleCandidates(lexicon: LexiconMap): Map<string, CandidateItem[]> {
  const index: Map<string, Map<string, CandidateItem>> = new Map();

  for (const [code, entries] of lexicon.entries()) {
    if (code.length < 3) continue;
    const singles = entries.filter((entry) => entry.text.length === 1);
    if (singles.length === 0) continue;

    for (let i = 2; i < code.length; i += 1) {
      const prefix = code.slice(0, i);
      if (!index.has(prefix)) {
        index.set(prefix, new Map());
      }
      const bucket = index.get(prefix);
      if (!bucket) continue;
      for (const entry of singles) {
        const prev = bucket.get(entry.text);
        if (!prev || entry.weight > prev.weight) {
          bucket.set(entry.text, entry);
        }
      }
    }
  }

  const result = new Map<string, CandidateItem[]>();
  for (const [prefix, bucket] of index.entries()) {
    if (prefix.length !== 2) continue;
    const sorted = Array.from(bucket.values()).sort((a, b) => b.weight - a.weight);
    if (sorted.length === 0) continue;
    const top = sorted[0];
    const secondWeight = sorted[1]?.weight ?? 1;
    const ratio = top.weight / Math.max(secondWeight, 1);
    if (top.weight < PREFIX_MIN_WEIGHT || ratio < PREFIX_DOMINANCE_RATIO) {
      continue;
    }
    result.set(prefix, sorted.slice(0, PREFIX_SINGLE_LIMIT));
  }
  return result;
}

function buildLeadSingleCandidates(lexicon: LexiconMap): Map<string, CandidateItem[]> {
  const index = new Map<string, Map<string, CandidateItem>>();

  for (const [code, entries] of lexicon.entries()) {
    if (code.length !== 2) continue;
    const a = code[0] ?? '';
    const b = code[1] ?? '';
    if (!(a >= 'a' && a <= 'z')) continue;
    if (!((b >= 'a' && b <= 'z') || b === ';')) continue;

    if (!index.has(a)) {
      index.set(a, new Map());
    }
    const bucket = index.get(a);
    if (!bucket) continue;

    for (const entry of entries) {
      if (entry.text.length !== 1) continue;
      const key = `${entry.text}|${b}`;
      const cand: CandidateItem = {
        text: entry.text,
        code: entry.code,
        weight: entry.weight,
        pendingCode: b
      };
      const prev = bucket.get(key);
      if (!prev || cand.weight > prev.weight) {
        bucket.set(key, cand);
      }
    }
  }

  const out = new Map<string, CandidateItem[]>();
  for (const [lead, bucket] of index.entries()) {
    const items = Array.from(bucket.values()).sort((x, y) => {
      // 一简优先，再按权重降序。
      const xYi = x.pendingCode === ';' || x.pendingCode === 'z' ? 0 : 1;
      const yYi = y.pendingCode === ';' || y.pendingCode === 'z' ? 0 : 1;
      if (xYi !== yYi) return xYi - yYi;
      if (x.weight !== y.weight) return y.weight - x.weight;
      return x.text.localeCompare(y.text, 'zh-Hans-CN');
    });
    if (items.length > 0) {
      out.set(lead, items.slice(0, PREFIX_CANDIDATE_LIMIT));
    }
  }
  return out;
}
