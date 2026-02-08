export type KeyboardGuideKey = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  image: string;
};

export type KeyboardGuideAnnotation = {
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

export const KEY_LAYOUT: KeyboardGuideKey[] = [
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

export const ANNOTATIONS: KeyboardGuideAnnotation[] = [
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

export const KEYBOARD_POINTER_PROFILE = {
  leftClick: 'commit-input',
  rightButton: 'rotate-view',
  middleButton: 'pan-view',
  wheel: 'zoom-view',
  rightClickTap: 'backspace',
  middleClickTap: 'shift-key',
  commitPhase: 'pointerup',
  keyMotion: 'down-press-up-release',
} as const;

export const KEYBOARD_3D_VISUAL_POLICY = {
  basePlate: 'none',
  keyCapTextureFace: 'front',
  keyCapStructure: 'single-tapered',
  keyCapDepth: 0.22,
  keyCapTopScale: 0.9,
  keyCapVerticalSegments: 8,
  keyCapSideColor: '#e2e8f0',
  keyCapTopColor: '#f8fafc',
  keyPressScale: 0.94,
  keyPressDepth: 0.065,
  keyReleaseBounceScale: 0.06,
  keyReleaseLift: 0.02,
  keyReleaseDurationMs: 180,
  keyboardTiltX: -0.4,
  keyboardOffsetY: 1.2,
  hintsBottomLiftPx: 0,
  cameraInitialX: 0,
  cameraInitialY: 2.45,
  cameraInitialZ: 6.45,
  cameraTargetY: -0.3,
  idleMotionEnabled: false,
  idleResumeDelayMs: 1800,
  idleRockXAmplitude: 0,
  idleRockZAmplitude: 0,
  idleBobYAmplitude: 0,
  idleRockFrequencyHz: 0.22,
  minPolarAngle: 0.001,
  maxPolarAngle: 3.1405,
} as const;

export const SUN_LIGHT_POLICY = {
  enabled: true,
  cycleSeconds: 24,
  xAmplitude: 8.8,
  baseY: 5.2,
  arcHeight: 1.9,
  baseZ: 4.1,
  zAmplitude: 0.75,
  intensity: 1.45,
  color: '#fff3c0',
  shadowMapSize: 2048,
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

export function keyIdToInputKey(keyId: string): string | null {
  if (/^[a-z]$/.test(keyId)) return keyId;
  if (keyId === 'semicolon') return ';';
  if (keyId === 'comma') return ',';
  if (keyId === 'period') return '.';
  if (keyId === 'slash') return '/';
  return null;
}

export function keyIdToShiftInputKey(keyId: string): string | null {
  if (/^[a-z]$/.test(keyId)) return keyId.toUpperCase();
  if (keyId === 'semicolon') return ':';
  if (keyId === 'comma') return '<';
  if (keyId === 'period') return '>';
  if (keyId === 'slash') return '?';
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
