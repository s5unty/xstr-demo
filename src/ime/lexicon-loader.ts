import type { CandidateItem } from '../types';
import type { LexiconMap } from './lexicon';

interface LexiconPackManifest {
  jsonPath: string;
  gzipPath: string;
  codeCount: number;
  entryCount: number;
}

interface LexiconManifest {
  formatVersion: number;
  version: string;
  starter: LexiconPackManifest;
  shards: Array<LexiconPackManifest & { id: string }>;
}

interface EncodedLexiconPack {
  codeCount: number;
  entryCount: number;
  codes: Record<string, Array<[string, number] | [string, number, number]>>;
}

interface CachedPackRecord {
  key: string;
  version: string;
  payload: string;
}

export interface LazyLexiconLoaderOptions {
  baseUrl?: string;
}

export function resolveLexiconBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.endsWith('/lexicon/')) {
    return normalized.slice(0, -1);
  }
  return normalized === '/' ? '/lexicon' : `${normalized}lexicon`;
}

export class LazyLexiconLoader {
  private readonly baseUrl: string;
  private readonly lexicon: LexiconMap = new Map();
  private manifest: LexiconManifest | null = null;
  private starterLoaded = false;
  private readonly loadedShards = new Set<string>();
  private readonly pendingShards = new Map<string, Promise<LexiconMap | null>>();

  constructor(options: LazyLexiconLoaderOptions = {}) {
    this.baseUrl = options.baseUrl ? resolveLexiconBaseUrl(options.baseUrl) : '/lexicon';
  }

  async loadStarter(): Promise<LexiconMap> {
    if (this.starterLoaded) {
      return this.lexicon;
    }
    const manifest = await this.loadManifest();
    const payload = await this.loadPack('starter', manifest.starter);
    this.mergePack(payload);
    this.starterLoaded = true;
    return this.lexicon;
  }

  async ensureForRaw(raw: string): Promise<LexiconMap | null> {
    if (!raw) {
      return null;
    }
    const manifest = await this.loadManifest();
    const shardId = toShardId(raw);
    const shard = manifest.shards.find((item) => item.id === shardId);
    if (!shard) {
      return null;
    }
    if (this.loadedShards.has(shardId)) {
      return null;
    }
    const inflight = this.pendingShards.get(shardId);
    if (inflight) {
      return inflight;
    }

    const task = (async () => {
      const payload = await this.loadPack(`shard:${shardId}`, shard);
      const partial = decodeLexiconPack(payload);
      for (const [code, entries] of partial.entries()) {
        this.lexicon.set(code, entries);
      }
      this.loadedShards.add(shardId);
      return partial;
    })().finally(() => {
      this.pendingShards.delete(shardId);
    });

    this.pendingShards.set(shardId, task);
    return task;
  }

  getManifest(): LexiconManifest | null {
    return this.manifest;
  }

  private async loadManifest(): Promise<LexiconManifest> {
    if (this.manifest) {
      return this.manifest;
    }
    const response = await fetch(`${this.baseUrl}/manifest.json`);
    if (!response.ok) {
      throw new Error(`压缩词库清单加载失败: ${response.status}`);
    }
    const data = (await response.json()) as LexiconManifest;
    if (!data?.starter || !Array.isArray(data.shards)) {
      throw new Error('压缩词库清单格式非法');
    }
    this.manifest = data;
    return data;
  }

  private async loadPack(cacheKey: string, pack: LexiconPackManifest): Promise<EncodedLexiconPack> {
    const manifest = this.manifest;
    if (!manifest) {
      throw new Error('词库清单尚未加载');
    }

    const cached = await readCachedPack(cacheKey, manifest.version);
    if (cached) {
      return JSON.parse(cached) as EncodedLexiconPack;
    }

    const content = await this.fetchPackText(pack);
    await writeCachedPack(cacheKey, manifest.version, content);
    return JSON.parse(content) as EncodedLexiconPack;
  }

  private async fetchPackText(pack: LexiconPackManifest): Promise<string> {
    if (supportsGzipDecompression()) {
      const gzipResponse = await fetch(`${this.baseUrl}/${pack.gzipPath}`);
      if (gzipResponse.ok) {
        const text = await tryDecodeGzip(gzipResponse);
        if (text !== null) {
          return text;
        }
      }
    }

    const rawResponse = await fetch(`${this.baseUrl}/${pack.jsonPath}`);
    if (!rawResponse.ok) {
      throw new Error(`词库分片加载失败: ${pack.jsonPath} (${rawResponse.status})`);
    }
    return rawResponse.text();
  }

  private mergePack(pack: EncodedLexiconPack): void {
    const partial = decodeLexiconPack(pack);
    for (const [code, entries] of partial.entries()) {
      this.lexicon.set(code, entries);
    }
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  const input = baseUrl.trim();
  if (!input) {
    return '/';
  }
  const withLead = input.startsWith('/') ? input : `/${input}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

function decodeLexiconPack(pack: EncodedLexiconPack): LexiconMap {
  const out: LexiconMap = new Map();
  const codes = pack.codes ?? {};
  for (const [code, list] of Object.entries(codes)) {
    const entries: CandidateItem[] = list.map((item) => ({
      text: item[0],
      code,
      weight: item[1],
      syntheticShort: item[2] === 1
    }));
    out.set(code, entries);
  }
  return out;
}

function toShardId(raw: string): string {
  const lead = (raw[0] ?? '').toLowerCase();
  if (lead >= 'a' && lead <= 'z') {
    return lead;
  }
  if (lead === ';') {
    return 'semicolon';
  }
  return 'misc';
}

function supportsGzipDecompression(): boolean {
  return typeof DecompressionStream !== 'undefined';
}

async function tryDecodeGzip(response: Response): Promise<string | null> {
  if (!response.body) {
    return null;
  }
  try {
    const stream = response.body.pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  } catch {
    return null;
  }
}

const CACHE_DB_NAME = 'xstr-lexicon-cache';
const CACHE_STORE_NAME = 'packs';
const CACHE_DB_VERSION = 1;

async function readCachedPack(key: string, version: string): Promise<string | null> {
  const db = await openCacheDb();
  if (!db) {
    return null;
  }

  return new Promise((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readonly');
    const store = tx.objectStore(CACHE_STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      const record = request.result as CachedPackRecord | undefined;
      if (!record || record.version !== version) {
        resolve(null);
        return;
      }
      resolve(record.payload);
    };
    request.onerror = () => resolve(null);
  });
}

async function writeCachedPack(key: string, version: string, payload: string): Promise<void> {
  const db = await openCacheDb();
  if (!db) {
    return;
  }

  await new Promise<void>((resolve) => {
    const tx = db.transaction(CACHE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(CACHE_STORE_NAME);
    store.put({ key, version, payload } satisfies CachedPackRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

let cacheDbPromise: Promise<IDBDatabase | null> | null = null;

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  if (cacheDbPromise) {
    return cacheDbPromise;
  }

  cacheDbPromise = new Promise((resolve) => {
    const request = indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });

  return cacheDbPromise;
}
