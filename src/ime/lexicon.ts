import type { CandidateItem } from '../types';

export type LexiconMap = Map<string, CandidateItem[]>;
export type PunctuationMap = Map<string, PunctuationEntry>;

export interface PunctuationEntry {
  outputs: string[];
  pair: boolean;
}

export interface LexiconLoadOptions {
  urls?: string[];
}

export interface PunctuationLoadOptions {
  url?: string;
}

const DEFAULT_URLS = [
  '/xstr/cqkm_42.dict.yaml',
  '/xstr/cqkm_42.phrase.dict.yaml',
  '/xstr/cqkm_42.single.dict.yaml',
  '/xstr/Dvel-main.dict.yaml'
];
const DEFAULT_SYMBOLS_URL = '/xstr/symbols.yaml';
const CODE_RE = /^[a-zA-Z;]+$/;
const CODE_WITH_STEM_RE = /^[a-z;]+[A-Z]$/;
const CHINESE_TEXT_RE = /^[\u3400-\u9fff]+$/;
const PLAIN_SHORT_CODE_RE = /^[a-z](?:[a-z;])?$/;
const KEY_SKIP_RE = /^[a-zA-Z0-9 ;]$/;
const WORD_MIN_LEN = 2;
const WORD_MAX_LEN = 8;
const CHAR_CODE_VARIANT_LIMIT = 4;
const WORD_CODE_COMBO_LIMIT = 8;
const PURE_TWO_CODE_RE = /^[a-z]{2}$/;
type EntrySource = 'direct' | 'stem_short';

interface LexiconEntryAgg {
  weight: number;
  direct: boolean;
  stemShort: boolean;
}

export async function loadLexicon(options: LexiconLoadOptions = {}): Promise<LexiconMap> {
  const urls = options.urls ?? DEFAULT_URLS;
  const texts = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`词库加载失败: ${url} (${response.status})`);
      }
      return response.text();
    })
  );

  const byCode: Map<string, Map<string, LexiconEntryAgg>> = new Map();
  const charCodeWeights = new Map<string, Map<string, number>>();

  const singleDictText = texts[2] ?? '';
  const dvelText = texts[3] ?? '';

  for (const rawText of texts.slice(0, 3)) {
    ingestCodeLines(rawText, byCode);
  }

  // 从 single.dict 提取短码候选（例如 nhE -> nh）。
  for (const line of singleDictText.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const text = (parts[0] ?? '').trim();
    const rawCode = (parts[1] ?? '').trim();
    if (!text || text.length !== 1 || !CHINESE_TEXT_RE.test(text)) continue;

    if (!CODE_WITH_STEM_RE.test(rawCode)) continue;
    const shortCode = rawCode.slice(0, -1).toLowerCase();
    if (!CODE_RE.test(shortCode)) continue;

    const maybeWeight = Number(parts[2] ?? '');
    const weight = Number.isFinite(maybeWeight) ? maybeWeight : 1;

    if (!charCodeWeights.has(text)) {
      charCodeWeights.set(text, new Map());
    }
    const codeMap = charCodeWeights.get(text);
    if (!codeMap) continue;
    const prev = codeMap.get(shortCode) ?? 0;
    if (weight > prev) {
      codeMap.set(shortCode, weight);
    }
    pushEntry(byCode, shortCode, text, weight, 'stem_short');
  }

  // 补充来自已有词典的短码变体（如「有 -> uz」），用于词组连续码组合。
  for (const [code, textMap] of byCode.entries()) {
    if (!PLAIN_SHORT_CODE_RE.test(code)) continue;
    for (const [text, agg] of textMap.entries()) {
      if (text.length !== 1 || !CHINESE_TEXT_RE.test(text)) continue;
      if (!charCodeWeights.has(text)) {
        charCodeWeights.set(text, new Map());
      }
      const codeMap = charCodeWeights.get(text);
      if (!codeMap) continue;
      const prev = codeMap.get(code) ?? 0;
      if (agg.weight > prev) {
        codeMap.set(code, agg.weight);
      }
    }
  }

  const preferredCharCodes = new Map<string, Array<{ code: string; weight: number }>>();
  for (const [char, codeMap] of charCodeWeights.entries()) {
    const ranked = Array.from(codeMap.entries())
      .map(([code, weight]) => ({ code, weight }))
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return a.code.localeCompare(b.code);
      });
    // 词语连续码优先使用纯两码字母，避免被一简/单码挤占，导致常用词码缺失（如 wrmh -> 我们）。
    const twoCode = ranked.filter((item) => PURE_TWO_CODE_RE.test(item.code));
    const variants = (twoCode.length > 0 ? twoCode : ranked).slice(0, CHAR_CODE_VARIANT_LIMIT);
    if (variants.length > 0) {
      preferredCharCodes.set(char, variants);
    }
  }

  // 基于词频词库生成词语连续码（例如 你好 -> nhhb）。
  for (const line of dvelText.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;
    const text = (parts[0] ?? '').trim();
    if (
      !text ||
      text.length < WORD_MIN_LEN ||
      text.length > WORD_MAX_LEN ||
      !CHINESE_TEXT_RE.test(text)
    ) {
      continue;
    }

    const maybeWeight = Number(parts[1] ?? '');
    const weight = Number.isFinite(maybeWeight) ? maybeWeight : 1;

    let combos: Array<{ code: string; score: number }> = [{ code: '', score: 0 }];
    let valid = true;
    for (const char of text) {
      const variants = preferredCharCodes.get(char);
      if (!variants || variants.length === 0) {
        valid = false;
        break;
      }
      const next: Array<{ code: string; score: number }> = [];
      for (const combo of combos) {
        for (const variant of variants) {
          next.push({ code: `${combo.code}${variant.code}`, score: combo.score + variant.weight });
        }
      }
      const dedup = new Map<string, number>();
      for (const item of next) {
        const prevScore = dedup.get(item.code) ?? Number.NEGATIVE_INFINITY;
        if (item.score > prevScore) {
          dedup.set(item.code, item.score);
        }
      }
      combos = Array.from(dedup.entries())
        .map(([code, score]) => ({ code, score }))
        .sort((a, b) => b.score - a.score)
        .slice(0, WORD_CODE_COMBO_LIMIT);
    }
    if (!valid || combos.length === 0) {
      continue;
    }
    for (const combo of combos) {
      if (!CODE_RE.test(combo.code)) continue;
      pushEntry(byCode, combo.code, text, weight);
    }
  }

  const map: LexiconMap = new Map();
  for (const [code, textMap] of byCode.entries()) {
    const entries = Array.from(textMap.entries())
      .map(([text, agg]) => ({
        text,
        code,
        weight: agg.weight,
        syntheticShort: agg.stemShort && !agg.direct
      }))
      .sort((a, b) => b.weight - a.weight);
    map.set(code, entries);
  }
  return map;
}

export async function loadPunctuationMap(
  options: PunctuationLoadOptions = {}
): Promise<PunctuationMap> {
  const url = options.url ?? DEFAULT_SYMBOLS_URL;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`标点映射加载失败: ${url} (${response.status})`);
  }
  return parseHalfShapePunctuation(await response.text());
}

function ingestCodeLines(rawText: string, byCode: Map<string, Map<string, LexiconEntryAgg>>): void {
  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 2) continue;

    const text = (parts[0] ?? '').trim();
    const code = (parts[1] ?? '').trim();
    if (!text || !CODE_RE.test(code)) continue;

    const maybeWeight = Number(parts[2] ?? '');
    const weight = Number.isFinite(maybeWeight) ? maybeWeight : 1;
    pushEntry(byCode, code, text, weight, 'direct');
  }
}

function parseHalfShapePunctuation(raw: string): PunctuationMap {
  const lines = raw.split(/\r?\n/);
  const map: PunctuationMap = new Map();
  let inHalfShape = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed === 'half_shape:') {
      inHalfShape = true;
      continue;
    }
    if (!inHalfShape) continue;

    if (/^[a-zA-Z_]+:/.test(trimmed) && !trimmed.startsWith('"')) {
      break;
    }
    if (!trimmed.startsWith('"')) continue;

    const parsed = parseHalfShapeLine(trimmed);
    if (!parsed) continue;
    if (KEY_SKIP_RE.test(parsed.key)) continue;
    if (parsed.outputs.length === 0) continue;
    map.set(parsed.key, parsed);
  }

  return map;
}

function parseHalfShapeLine(line: string): { key: string; outputs: string[]; pair: boolean } | null {
  const match = line.match(/^"((?:\\.|[^"])*)":\s*(.+)$/);
  if (!match) return null;

  const key = decodeQuoted(match[1]);
  const value = match[2].trim();
  if (!key || !value) return null;

  const commitMatch = value.match(/^\{commit:\s*"((?:\\.|[^"])*)"\s*\}$/);
  if (commitMatch) {
    return { key, outputs: [decodeQuoted(commitMatch[1])], pair: false };
  }

  const pairMatch = value.match(
    /^\{pair:\s*\[\s*"((?:\\.|[^"])*)"\s*,\s*"((?:\\.|[^"])*)"\s*\]\s*\}$/
  );
  if (pairMatch) {
    return { key, outputs: [decodeQuoted(pairMatch[1]), decodeQuoted(pairMatch[2])], pair: true };
  }

  const plainMatch = value.match(/^"((?:\\.|[^"])*)"$/);
  if (plainMatch) {
    return { key, outputs: [decodeQuoted(plainMatch[1])], pair: false };
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    const outputs: string[] = [];
    const re = /"((?:\\.|[^"])*)"/g;
    let token = re.exec(value);
    while (token) {
      outputs.push(decodeQuoted(token[1]));
      token = re.exec(value);
    }
    return { key, outputs, pair: false };
  }

  return null;
}

function decodeQuoted(input: string): string {
  try {
    return JSON.parse(`"${input}"`);
  } catch {
    return input;
  }
}

function pushEntry(
  byCode: Map<string, Map<string, LexiconEntryAgg>>,
  code: string,
  text: string,
  weight: number,
  source: EntrySource = 'direct'
): void {
  if (!byCode.has(code)) {
    byCode.set(code, new Map());
  }
  const textMap = byCode.get(code);
  if (!textMap) return;
  const prev = textMap.get(text);
  const next: LexiconEntryAgg = prev
    ? {
        weight: Math.max(prev.weight, weight),
        direct: prev.direct || source === 'direct',
        stemShort: prev.stemShort || source === 'stem_short'
      }
    : {
        weight,
        direct: source === 'direct',
        stemShort: source === 'stem_short'
      };
  textMap.set(text, next);
}
