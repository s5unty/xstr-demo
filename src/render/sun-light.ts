import { SUN_LIGHT_POLICY } from '../ui/input/keyboard-layout';

type SunLightPosition = {
  x: number;
  y: number;
  z: number;
};

type SunLightPolicy = typeof SUN_LIGHT_POLICY;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function computeSunLightPositionFromPointer(
  pointerX: number,
  pointerY: number,
  policy: SunLightPolicy = SUN_LIGHT_POLICY,
): SunLightPosition {
  const px = clamp01(pointerX);
  const py = clamp01(pointerY);
  const nx = px * 2 - 1;
  const ny = 1 - py * 2;
  return {
    x: nx * policy.xAmplitude,
    y: policy.baseY + ny * policy.arcHeight,
    z: policy.baseZ + ny * policy.zAmplitude * policy.pointerVerticalDepthScale,
  };
}
