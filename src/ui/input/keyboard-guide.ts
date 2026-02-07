export type KeyboardGuideKey = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
};

type KeyboardGuideAnnotation = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
};

export const KEY_POP_ANIMATION = {
  peakScale: 1.24,
  settleScale: 1.08,
  liftPx: 18,
  baseDurationMs: 600,
  minDurationMs: 400,
  maxDurationMs: 760,
  fastIntervalMs: 90,
  slowIntervalMs: 420,
  smoothReturn: true,
} as const;

const KEY_LAYOUT: KeyboardGuideKey[] = [
  { id: 'q', x: 182, y: 83, width: 55, height: 54, image: '/keyboard/keys/q.png' },
  { id: 'w', x: 250, y: 83, width: 55, height: 54, image: '/keyboard/keys/w.png' },
  { id: 'e', x: 318, y: 83, width: 55, height: 54, image: '/keyboard/keys/e.png' },
  { id: 'r', x: 384, y: 83, width: 57, height: 54, image: '/keyboard/keys/r.png' },
  { id: 't', x: 453, y: 83, width: 57, height: 54, image: '/keyboard/keys/t.png' },
  { id: 'y', x: 522, y: 84, width: 54, height: 53, image: '/keyboard/keys/y.png' },
  { id: 'u', x: 590, y: 83, width: 54, height: 54, image: '/keyboard/keys/u.png' },
  { id: 'i', x: 658, y: 83, width: 54, height: 54, image: '/keyboard/keys/i.png' },
  { id: 'o', x: 726, y: 84, width: 54, height: 53, image: '/keyboard/keys/o.png' },
  { id: 'p', x: 794, y: 83, width: 54, height: 54, image: '/keyboard/keys/p.png' },
  { id: 'a', x: 200, y: 151, width: 55, height: 53, image: '/keyboard/keys/a.png' },
  { id: 's', x: 268, y: 151, width: 55, height: 53, image: '/keyboard/keys/s.png' },
  { id: 'd', x: 336, y: 151, width: 55, height: 53, image: '/keyboard/keys/d.png' },
  { id: 'f', x: 404, y: 151, width: 55, height: 53, image: '/keyboard/keys/f.png' },
  { id: 'g', x: 472, y: 151, width: 55, height: 53, image: '/keyboard/keys/g.png' },
  { id: 'h', x: 540, y: 151, width: 55, height: 53, image: '/keyboard/keys/h.png' },
  { id: 'j', x: 608, y: 150, width: 55, height: 54, image: '/keyboard/keys/j.png' },
  { id: 'k', x: 676, y: 150, width: 56, height: 54, image: '/keyboard/keys/k.png' },
  { id: 'l', x: 744, y: 150, width: 55, height: 54, image: '/keyboard/keys/l.png' },
  { id: 'semicolon', x: 812, y: 151, width: 54, height: 53, image: '/keyboard/keys/semicolon.png' },
  { id: 'z', x: 234, y: 216, width: 54, height: 53, image: '/keyboard/keys/z.png' },
  { id: 'x', x: 302, y: 216, width: 54, height: 53, image: '/keyboard/keys/x.png' },
  { id: 'c', x: 370, y: 216, width: 54, height: 53, image: '/keyboard/keys/c.png' },
  { id: 'v', x: 438, y: 216, width: 54, height: 53, image: '/keyboard/keys/v.png' },
  { id: 'b', x: 506, y: 216, width: 54, height: 53, image: '/keyboard/keys/b.png' },
  { id: 'n', x: 574, y: 216, width: 54, height: 53, image: '/keyboard/keys/n.png' },
  { id: 'm', x: 641, y: 216, width: 56, height: 54, image: '/keyboard/keys/m.png' },
  { id: 'comma', x: 710, y: 217, width: 54, height: 52, image: '/keyboard/keys/comma.png' },
  { id: 'period', x: 778, y: 217, width: 54, height: 52, image: '/keyboard/keys/period.png' },
  { id: 'slash', x: 846, y: 216, width: 54, height: 53, image: '/keyboard/keys/slash.png' },
];

const ANNOTATIONS: KeyboardGuideAnnotation[] = [
  { id: 'zone-left-top', x: 82, y: 86, width: 99, height: 46, image: '/keyboard/annotations/zone-left-top.png' },
  { id: 'zone-left-mid', x: 102, y: 154, width: 87, height: 48, image: '/keyboard/annotations/zone-left-mid.png' },
  { id: 'zone-left-bot', x: 129, y: 218, width: 90, height: 47, image: '/keyboard/annotations/zone-left-bot.png' },
  { id: 'zone-right-top', x: 866, y: 86, width: 88, height: 43, image: '/keyboard/annotations/zone-right-top.png' },
  { id: 'zone-right-mid', x: 879, y: 154, width: 91, height: 46, image: '/keyboard/annotations/zone-right-mid.png' },
  { id: 'hints-bottom', x: 102, y: 300, width: 853, height: 31, image: '/keyboard/annotations/hints-bottom.png' },
];

export const KEYBOARD_ANNOTATION_IDS = ANNOTATIONS.map((item) => item.id);
export const KEYBOARD_ASSET_BACKGROUND = {
  annotations: 'transparent-yellow-only',
  keys: 'source-original',
} as const;

const SHIFT_SYMBOL_MAP: Record<string, string> = {
  ':': 'semicolon',
  '<': 'comma',
  '>': 'period',
  '?': 'slash',
};

export function normalizeGuideKey(key: string): string | null {
  if (!key) return null;

  if (key.length === 1) {
    if (/^[a-zA-Z]$/.test(key)) return key.toLowerCase();
    if (key === ';') return 'semicolon';
    if (key === ',') return 'comma';
    if (key === '.') return 'period';
    if (key === '/') return 'slash';
    if (SHIFT_SYMBOL_MAP[key]) return SHIFT_SYMBOL_MAP[key];
    return null;
  }

  const normalized = key.toLowerCase();
  if (normalized === 'dead') return null;
  return null;
}

export function derivePopDurationMs(intervalMs: number | null): number {
  if (intervalMs === null || Number.isNaN(intervalMs)) {
    return KEY_POP_ANIMATION.baseDurationMs;
  }

  const clamped = Math.max(KEY_POP_ANIMATION.fastIntervalMs, Math.min(KEY_POP_ANIMATION.slowIntervalMs, intervalMs));
  const ratio =
    (clamped - KEY_POP_ANIMATION.fastIntervalMs) /
    (KEY_POP_ANIMATION.slowIntervalMs - KEY_POP_ANIMATION.fastIntervalMs);
  return Math.round(
    KEY_POP_ANIMATION.minDurationMs +
      ratio * (KEY_POP_ANIMATION.maxDurationMs - KEY_POP_ANIMATION.minDurationMs)
  );
}

export class KeyboardGuide {
  readonly root: HTMLDivElement;

  private readonly keys = new Map<string, HTMLElement>();
  private lastKeyDownTs: number | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'keyboard-guide';
    this.root.style.setProperty('--key-pop-peak', String(KEY_POP_ANIMATION.peakScale));
    this.root.style.setProperty('--key-pop-settle', String(KEY_POP_ANIMATION.settleScale));
    this.root.style.setProperty('--key-pop-lift', `${KEY_POP_ANIMATION.liftPx}px`);
    this.root.style.setProperty('--key-pop-duration', `${KEY_POP_ANIMATION.baseDurationMs}ms`);

    for (const annotation of ANNOTATIONS) {
      const node = document.createElement('img');
      node.className = 'keyboard-annotation';
      node.alt = '';
      node.src = annotation.image;
      node.style.left = `${annotation.x}px`;
      node.style.top = `${annotation.y}px`;
      node.style.width = `${annotation.width}px`;
      node.style.height = `${annotation.height}px`;
      this.root.append(node);
    }

    for (const key of KEY_LAYOUT) {
      const keyEl = document.createElement('button');
      keyEl.type = 'button';
      keyEl.className = 'keyboard-key';
      keyEl.dataset.key = key.id;
      keyEl.style.left = `${key.x}px`;
      keyEl.style.top = `${key.y}px`;
      keyEl.style.width = `${key.width}px`;
      keyEl.style.height = `${key.height}px`;
      keyEl.tabIndex = -1;
      keyEl.setAttribute('aria-hidden', 'true');

      const img = document.createElement('img');
      img.alt = '';
      img.src = key.image;
      img.draggable = false;
      keyEl.append(img);
      this.root.append(keyEl);
      this.keys.set(key.id, keyEl);
    }
  }

  handleKeyDown(event: KeyboardEvent): void {
    const now = Number.isFinite(event.timeStamp) && event.timeStamp > 0 ? event.timeStamp : Date.now();
    const interval = this.lastKeyDownTs === null ? null : now - this.lastKeyDownTs;
    this.lastKeyDownTs = now;
    this.highlight(event.key, true, interval);
  }

  handleKeyUp(event: KeyboardEvent): void {
    this.highlight(event.key, false);
  }

  clear(): void {
    this.lastKeyDownTs = null;
    for (const key of this.keys.values()) {
      key.classList.remove('is-active');
      key.classList.remove('key-hit');
    }
  }

  private highlight(rawKey: string, active: boolean, intervalMs: number | null = null): void {
    const keyId = normalizeGuideKey(rawKey);
    if (!keyId) return;
    const keyEl = this.keys.get(keyId);
    if (!keyEl) return;

    if (active) {
      const duration = derivePopDurationMs(intervalMs);
      keyEl.style.setProperty('--key-pop-duration', `${duration}ms`);
      keyEl.classList.add('is-active');
      keyEl.classList.remove('key-hit');
      // restart pulse animation for repeated keydown.
      void keyEl.offsetWidth;
      keyEl.classList.add('key-hit');
    } else {
      keyEl.classList.remove('is-active');
    }
  }
}
