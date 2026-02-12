#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'xstr');
const OUT_DIR = path.join(ROOT, 'public', 'lexicon');
const SHARD_DIR = path.join(OUT_DIR, 'shards');

const SOURCE_FILES = [
  'cqkm_42.dict.yaml',
  'cqkm_42.phrase.dict.yaml',
  'cqkm_42.single.dict.yaml',
  'Dvel-main.dict.yaml'
];

const CODE_RE = /^[a-zA-Z;]+$/;
const CODE_WITH_STEM_RE = /^[a-z;]+[A-Z]$/;
const CHINESE_TEXT_RE = /^[\u3400-\u9fff]+$/;
const PLAIN_SHORT_CODE_RE = /^[a-z](?:[a-z;])?$/;
const WORD_MIN_LEN = 2;
const WORD_MAX_LEN = 8;
const CHAR_CODE_VARIANT_LIMIT = 4;
const WORD_CODE_COMBO_LIMIT = 8;
const PURE_TWO_CODE_RE = /^[a-z]{2}$/;

async function main() {
  const source = await Promise.all(
    SOURCE_FILES.map(async (name) => ({
      name,
      content: await readFile(path.join(SOURCE_DIR, name), 'utf8')
    }))
  );

  const texts = source.map((item) => item.content);
  const lexicon = buildLexiconMap(texts);

  const starter = new Map();
  const shards = new Map();

  for (const [code, entries] of lexicon.entries()) {
    if (code.length <= 2) {
      starter.set(code, entries);
      continue;
    }
    const shardId = toShardId(code);
    if (!shards.has(shardId)) {
      shards.set(shardId, new Map());
    }
    shards.get(shardId).set(code, entries);
  }

  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(SHARD_DIR, { recursive: true });

  const sourceHash = createHash('sha256');
  for (const item of source) {
    sourceHash.update(item.name);
    sourceHash.update(item.content);
  }
  const version = sourceHash.digest('hex').slice(0, 16);

  const starterMeta = await writeLexiconPack(path.join(OUT_DIR, 'starter.json'), starter);

  const shardManifest = [];
  const shardIds = Array.from(shards.keys()).sort();
  for (const shardId of shardIds) {
    const shardLexicon = shards.get(shardId);
    const meta = await writeLexiconPack(path.join(SHARD_DIR, `${shardId}.json`), shardLexicon);
    shardManifest.push({
      id: shardId,
      jsonPath: `shards/${shardId}.json`,
      gzipPath: `shards/${shardId}.json.gz`,
      codeCount: meta.codeCount,
      entryCount: meta.entryCount,
      jsonBytes: meta.jsonBytes,
      gzipBytes: meta.gzipBytes
    });
  }

  const manifest = {
    formatVersion: 1,
    version,
    createdAt: new Date().toISOString(),
    sourceFiles: source.map((item) => item.name),
    starter: {
      jsonPath: 'starter.json',
      gzipPath: 'starter.json.gz',
      codeCount: starterMeta.codeCount,
      entryCount: starterMeta.entryCount,
      jsonBytes: starterMeta.jsonBytes,
      gzipBytes: starterMeta.gzipBytes
    },
    shards: shardManifest
  };

  await writeFile(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8');

  const totalCodes = Array.from(lexicon.keys()).length;
  const totalEntries = Array.from(lexicon.values()).reduce((sum, list) => sum + list.length, 0);
  const totalGzip = starterMeta.gzipBytes + shardManifest.reduce((sum, s) => sum + s.gzipBytes, 0);

  console.log(
    `lexicon build done: version=${version} code=${totalCodes} entry=${totalEntries} ` +
      `starter_gzip=${starterMeta.gzipBytes}B shards=${shardManifest.length} total_gzip=${totalGzip}B`
  );
}

async function writeLexiconPack(outPath, lexicon) {
  const payload = serializeLexicon(lexicon);
  const json = JSON.stringify(payload);
  const gzip = gzipSync(Buffer.from(json), { level: 9, mtime: 0 });

  await writeFile(outPath, json, 'utf8');
  await writeFile(`${outPath}.gz`, gzip);

  return {
    codeCount: payload.codeCount,
    entryCount: payload.entryCount,
    jsonBytes: Buffer.byteLength(json),
    gzipBytes: gzip.byteLength
  };
}

function serializeLexicon(lexicon) {
  const codes = {};
  let entryCount = 0;
  for (const [code, entries] of Array.from(lexicon.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    codes[code] = entries.map((item) => {
      entryCount += 1;
      return item.syntheticShort ? [item.text, item.weight, 1] : [item.text, item.weight];
    });
  }
  return {
    codeCount: Object.keys(codes).length,
    entryCount,
    codes
  };
}

function toShardId(code) {
  const lead = (code[0] ?? '').toLowerCase();
  if (lead >= 'a' && lead <= 'z') return lead;
  if (lead === ';') return 'semicolon';
  return 'misc';
}

function buildLexiconMap(texts) {
  const byCode = new Map();
  const charCodeWeights = new Map();

  const singleDictText = texts[2] ?? '';
  const dvelText = texts[3] ?? '';

  for (const rawText of texts.slice(0, 3)) {
    ingestCodeLines(rawText, byCode);
  }

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
    const prev = codeMap.get(shortCode) ?? 0;
    if (weight > prev) {
      codeMap.set(shortCode, weight);
    }
    pushEntry(byCode, shortCode, text, weight, 'stem_short');
  }

  for (const [code, textMap] of byCode.entries()) {
    if (!PLAIN_SHORT_CODE_RE.test(code)) continue;
    for (const [text, agg] of textMap.entries()) {
      if (text.length !== 1 || !CHINESE_TEXT_RE.test(text)) continue;
      if (!charCodeWeights.has(text)) {
        charCodeWeights.set(text, new Map());
      }
      const codeMap = charCodeWeights.get(text);
      const prev = codeMap.get(code) ?? 0;
      if (agg.weight > prev) {
        codeMap.set(code, agg.weight);
      }
    }
  }

  const preferredCharCodes = new Map();
  for (const [char, codeMap] of charCodeWeights.entries()) {
    const ranked = Array.from(codeMap.entries())
      .map(([code, weight]) => ({ code, weight }))
      .sort((a, b) => {
        if (b.weight !== a.weight) return b.weight - a.weight;
        return a.code.localeCompare(b.code);
      });
    const twoCode = ranked.filter((item) => PURE_TWO_CODE_RE.test(item.code));
    const variants = (twoCode.length > 0 ? twoCode : ranked).slice(0, CHAR_CODE_VARIANT_LIMIT);
    if (variants.length > 0) {
      preferredCharCodes.set(char, variants);
    }
  }

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

    let combos = [{ code: '', score: 0 }];
    let valid = true;
    for (const char of text) {
      const variants = preferredCharCodes.get(char);
      if (!variants || variants.length === 0) {
        valid = false;
        break;
      }
      const next = [];
      for (const combo of combos) {
        for (const variant of variants) {
          next.push({ code: `${combo.code}${variant.code}`, score: combo.score + variant.weight });
        }
      }
      const dedup = new Map();
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

    if (!valid || combos.length === 0) continue;
    for (const combo of combos) {
      if (!CODE_RE.test(combo.code)) continue;
      pushEntry(byCode, combo.code, text, weight, 'direct');
    }
  }

  const map = new Map();
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

function ingestCodeLines(rawText, byCode) {
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

function pushEntry(byCode, code, text, weight, source) {
  if (!byCode.has(code)) {
    byCode.set(code, new Map());
  }
  const textMap = byCode.get(code);
  const prev = textMap.get(text);
  const next = prev
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

main().catch((error) => {
  console.error(`build lexicon failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
