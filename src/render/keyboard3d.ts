// @ts-nocheck
import * as THREE from 'three';
import {
  ANNOTATIONS,
  KEY_LAYOUT,
  KEYBOARD_3D_VISUAL_POLICY,
  derivePopDurationMs,
  keyIdToInputKey,
} from '../ui/input/keyboard-layout';

const GUIDE_WIDTH = 1078;
const GUIDE_HEIGHT = 412;
const GUIDE_SCALE = 0.01;

type KeyVisualState = {
  id: string;
  group: THREE.Group;
  topMaterial: THREE.MeshStandardMaterial;
  baseZ: number;
  pressed: boolean;
  releaseTimerMs: number;
  releaseDurationMs: number;
};

export class Keyboard3D {
  readonly root = new THREE.Group();
  private idleMotionActive = true;
  private idlePhaseSec = 0;

  private readonly keyStates = new Map<string, KeyVisualState>();
  private readonly pickTargets: THREE.Object3D[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly textureLoader = new THREE.TextureLoader();
  private downPointer:
    | {
        x: number;
        y: number;
        keyId: string | null;
      }
    | null = null;

  constructor() {
    this.root.name = 'Keyboard3D';
    this.root.position.set(0, KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY, 0);
    this.root.rotation.x = KEYBOARD_3D_VISUAL_POLICY.keyboardTiltX;
    this.buildAnnotations();
    this.buildKeys();
  }

  setKeyActive(keyId: string, active: boolean, intervalMs: number | null = null): void {
    const state = this.keyStates.get(keyId);
    if (!state) return;

    const releaseDuration =
      intervalMs === null
        ? KEYBOARD_3D_VISUAL_POLICY.keyReleaseDurationMs
        : Math.max(120, Math.round(derivePopDurationMs(intervalMs) * 0.42));

    state.pressed = active;
    if (active) {
      state.releaseDurationMs = releaseDuration;
      state.releaseTimerMs = 0;
    } else if (state.releaseTimerMs <= 0) {
      state.releaseDurationMs = releaseDuration;
      state.releaseTimerMs = releaseDuration;
    }
  }

  clearActive(): void {
    for (const state of this.keyStates.values()) {
      state.pressed = false;
      state.releaseTimerMs = 0;
      state.group.position.z = state.baseZ;
      state.group.scale.set(1, 1, 1);
      state.topMaterial.emissiveIntensity = 0;
    }
  }

  update(deltaSec: number): void {
    this.idlePhaseSec += deltaSec;
    const deltaMs = deltaSec * 1000;
    for (const state of this.keyStates.values()) {
      state.releaseTimerMs = Math.max(0, state.releaseTimerMs - deltaMs);
      const releaseDuration = Math.max(state.releaseDurationMs, 1);
      const releaseProgress = 1 - state.releaseTimerMs / releaseDuration;
      const releaseBounce = state.releaseTimerMs > 0 ? Math.sin(releaseProgress * Math.PI) : 0;

      const pressDepth = state.pressed ? -KEYBOARD_3D_VISUAL_POLICY.keyPressDepth : 0;
      const pressScale = state.pressed ? KEYBOARD_3D_VISUAL_POLICY.keyPressScale : 1;
      const releaseLift = releaseBounce * KEYBOARD_3D_VISUAL_POLICY.keyReleaseLift;
      const releaseScale = releaseBounce * KEYBOARD_3D_VISUAL_POLICY.keyReleaseBounceScale;

      state.group.position.z = state.baseZ + pressDepth + releaseLift;
      state.group.scale.set(pressScale + releaseScale, pressScale + releaseScale, 1);
      state.topMaterial.emissiveIntensity = state.pressed ? 0.32 : releaseBounce * 0.18;
    }

    this.applyIdleMotion(deltaSec);
  }

  handlePointerDown(
    event: PointerEvent,
    camera: THREE.Camera,
    dom: HTMLElement,
  ): void {
    if (event.button !== 0) return;
    const keyId = this.pickKeyId(event.clientX, event.clientY, camera, dom);
    if (keyId) {
      this.setKeyActive(keyId, true, null);
    }
    this.downPointer = {
      x: event.clientX,
      y: event.clientY,
      keyId,
    };
  }

  handlePointerUp(
    event: PointerEvent,
    camera: THREE.Camera,
    dom: HTMLElement,
    onVirtualKey: (key: string) => void,
  ): void {
    if (event.button !== 0 || !this.downPointer) {
      this.downPointer = null;
      return;
    }

    if (this.downPointer.keyId) {
      this.setKeyActive(this.downPointer.keyId, false);
    }
    const moved = Math.hypot(event.clientX - this.downPointer.x, event.clientY - this.downPointer.y);
    const upKeyId = this.pickKeyId(event.clientX, event.clientY, camera, dom);
    const keyId = moved <= 6 && upKeyId && upKeyId === this.downPointer.keyId ? upKeyId : null;
    this.downPointer = null;
    if (!keyId) return;
    const inputKey = keyIdToInputKey(keyId);
    if (inputKey) {
      onVirtualKey(inputKey);
    }
  }

  handlePointerCancel(): void {
    if (this.downPointer?.keyId) {
      this.setKeyActive(this.downPointer.keyId, false);
    }
    this.downPointer = null;
  }

  setIdleMotionActive(active: boolean): void {
    this.idleMotionActive = active && KEYBOARD_3D_VISUAL_POLICY.idleMotionEnabled;
  }

  private buildAnnotations(): void {
    for (const annotation of ANNOTATIONS) {
      const texture = this.textureLoader.load(annotation.image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(annotation.width * GUIDE_SCALE, annotation.height * GUIDE_SCALE),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
        }),
      );
      mesh.position.set(
        this.toWorldX(annotation.x + annotation.width / 2),
        this.toWorldY(annotation.y + annotation.height / 2),
        0.08,
      );
      this.root.add(mesh);
    }
  }

  private buildKeys(): void {
    const keyDepth = KEYBOARD_3D_VISUAL_POLICY.keyCapDepth;
    for (const key of KEY_LAYOUT) {
      const keyGroup = new THREE.Group();
      keyGroup.name = `Key3D:${key.id}`;
      keyGroup.position.set(
        this.toWorldX(key.x + key.width / 2),
        this.toWorldY(key.y + key.height / 2),
        0.12,
      );

      const topTexture = this.textureLoader.load(key.image);
      topTexture.colorSpace = THREE.SRGBColorSpace;
      topTexture.anisotropy = 8;

      const baseMaterial = new THREE.MeshStandardMaterial({
        color: KEYBOARD_3D_VISUAL_POLICY.keyCapSideColor,
        roughness: 0.63,
        metalness: 0.06,
      });
      const topMaterial = new THREE.MeshStandardMaterial({
        color: KEYBOARD_3D_VISUAL_POLICY.keyCapTopColor,
        map: topTexture,
        roughness: 0.46,
        metalness: 0.05,
        emissive: new THREE.Color('#facc15'),
        emissiveIntensity: 0,
      });
      // BoxGeometry 材质顺序: +X, -X, +Y, -Y, +Z(front), -Z(back)
      const faceMaterials =
        KEYBOARD_3D_VISUAL_POLICY.keyCapTextureFace === 'front'
          ? [baseMaterial, baseMaterial, baseMaterial, baseMaterial, topMaterial, baseMaterial]
          : [baseMaterial, baseMaterial, topMaterial, baseMaterial, baseMaterial, baseMaterial];
      const cap = new THREE.Mesh(
        this.createTaperedKeyCapGeometry(key.width * GUIDE_SCALE, key.height * GUIDE_SCALE, keyDepth),
        faceMaterials,
      );
      cap.userData.keyId = key.id;
      keyGroup.add(cap);
      this.root.add(keyGroup);
      this.pickTargets.push(cap);
      this.keyStates.set(key.id, {
        id: key.id,
        group: keyGroup,
        topMaterial,
        baseZ: keyGroup.position.z,
        pressed: false,
        releaseTimerMs: 0,
        releaseDurationMs: KEYBOARD_3D_VISUAL_POLICY.keyReleaseDurationMs,
      });
    }
  }

  private createTaperedKeyCapGeometry(width: number, height: number, depth: number): THREE.BoxGeometry {
    const geometry = new THREE.BoxGeometry(width, height, depth, 4, 4, KEYBOARD_3D_VISUAL_POLICY.keyCapVerticalSegments);
    const topScale = KEYBOARD_3D_VISUAL_POLICY.keyCapTopScale;
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      const x = position.getX(i);
      const y = position.getY(i);
      const z = position.getZ(i);
      const t = (z + depth * 0.5) / depth;
      const eased = t * t * (3 - 2 * t);
      const scale = 1 - (1 - topScale) * eased;
      position.setXYZ(i, x * scale, y * scale, z);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  private applyIdleMotion(deltaSec: number): void {
    const targetBlend = this.idleMotionActive ? 1 : 0;
    const smooth = Math.min(1, deltaSec * 4);
    const currentX = this.root.rotation.x - KEYBOARD_3D_VISUAL_POLICY.keyboardTiltX;
    const currentZ = this.root.rotation.z;
    const currentY = this.root.position.y - KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY;
    const phase = this.idlePhaseSec * KEYBOARD_3D_VISUAL_POLICY.idleRockFrequencyHz * Math.PI * 2;
    const idealX = targetBlend * (Math.sin(phase * 0.9) * KEYBOARD_3D_VISUAL_POLICY.idleRockXAmplitude);
    const idealZ = targetBlend * (Math.sin(phase) * KEYBOARD_3D_VISUAL_POLICY.idleRockZAmplitude);
    const idealY = targetBlend * (Math.sin(phase * 0.7) * KEYBOARD_3D_VISUAL_POLICY.idleBobYAmplitude);

    this.root.rotation.x = KEYBOARD_3D_VISUAL_POLICY.keyboardTiltX + THREE.MathUtils.lerp(currentX, idealX, smooth);
    this.root.rotation.z = THREE.MathUtils.lerp(currentZ, idealZ, smooth);
    this.root.position.y = KEYBOARD_3D_VISUAL_POLICY.keyboardOffsetY + THREE.MathUtils.lerp(currentY, idealY, smooth);
  }

  private pickKeyId(clientX: number, clientY: number, camera: THREE.Camera, dom: HTMLElement): string | null {
    const rect = dom.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, camera);
    const hit = this.raycaster.intersectObjects(this.pickTargets, false)[0];
    if (!hit) return null;
    const keyId = hit.object.userData.keyId;
    return typeof keyId === 'string' ? keyId : null;
  }

  getKeyIdAtPointer(clientX: number, clientY: number, camera: THREE.Camera, dom: HTMLElement): string | null {
    return this.pickKeyId(clientX, clientY, camera, dom);
  }

  private toWorldX(centerX: number): number {
    return (centerX - GUIDE_WIDTH / 2) * GUIDE_SCALE;
  }

  private toWorldY(centerY: number): number {
    return (GUIDE_HEIGHT / 2 - centerY) * GUIDE_SCALE;
  }
}
