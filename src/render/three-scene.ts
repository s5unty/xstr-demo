// @ts-nocheck
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { RenderFeedbackEvent } from '../types';
import { Keyboard3D } from './keyboard3d';
import {
  KEYBOARD_3D_VISUAL_POLICY,
  SUN_LIGHT_POLICY,
  keyIdToShiftInputKey,
  normalizeGuideKey,
} from '../ui/input/keyboard-layout';

export class ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly controls: OrbitControls;
  private readonly keyboard3d = new Keyboard3D();
  private readonly clock = new THREE.Clock();
  private readonly sunLight = new THREE.DirectionalLight(SUN_LIGHT_POLICY.color, SUN_LIGHT_POLICY.intensity);
  private readonly sunTarget = new THREE.Object3D();
  private readonly sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.2, 18, 18),
    new THREE.MeshBasicMaterial({ color: SUN_LIGHT_POLICY.color }),
  );
  private readonly baseBg = new THREE.Color('#0f172a');
  private readonly correctBg = new THREE.Color('#052e16');
  private readonly wrongBg = new THREE.Color('#450a0a');
  private activeFlash = 0;
  private onVirtualKey: ((key: string) => void) | null = null;
  private lastMouseInteractionTs = 0;
  private sunTimeSec = 0;
  private rightPointer:
    | {
        x: number;
        y: number;
        ts: number;
      }
    | null = null;
  private middlePointer:
    | {
        x: number;
        y: number;
        ts: number;
        keyId: string | null;
      }
    | null = null;

  constructor(private readonly mount: HTMLElement) {
    this.camera.position.set(
      KEYBOARD_3D_VISUAL_POLICY.cameraInitialX,
      KEYBOARD_3D_VISUAL_POLICY.cameraInitialY,
      KEYBOARD_3D_VISUAL_POLICY.cameraInitialZ,
    );
    this.scene.background = this.baseBg;
    this.scene.add(this.keyboard3d.root);
    this.scene.add(this.sunTarget);

    const hemi = new THREE.HemisphereLight('#eef6ff', '#0b1220', 0.78);
    this.scene.add(hemi);

    const ambient = new THREE.AmbientLight('#f8fbff', 0.3);
    this.scene.add(ambient);
    const fill = new THREE.DirectionalLight('#c7ddff', 0.28);
    fill.position.set(-3, 2.2, -2.5);
    this.scene.add(fill);

    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(SUN_LIGHT_POLICY.shadowMapSize, SUN_LIGHT_POLICY.shadowMapSize);
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 35;
    this.sunLight.shadow.camera.left = -9;
    this.sunLight.shadow.camera.right = 9;
    this.sunLight.shadow.camera.top = 8;
    this.sunLight.shadow.camera.bottom = -8;
    this.sunLight.shadow.bias = -0.00008;
    this.sunLight.target = this.sunTarget;
    this.scene.add(this.sunLight);
    this.sunMesh.visible = SUN_LIGHT_POLICY.enabled;
    this.scene.add(this.sunMesh);
    this.sunTarget.position.set(0, KEYBOARD_3D_VISUAL_POLICY.cameraTargetY, 0);
    this.updateSunLight(0);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.mount.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.enablePan = true;
    this.controls.enableZoom = true;
    this.controls.minDistance = 4.8;
    this.controls.maxDistance = 13;
    this.controls.minPolarAngle = KEYBOARD_3D_VISUAL_POLICY.minPolarAngle;
    this.controls.maxPolarAngle = KEYBOARD_3D_VISUAL_POLICY.maxPolarAngle;
    this.controls.target.set(0, KEYBOARD_3D_VISUAL_POLICY.cameraTargetY, 0);
    this.controls.mouseButtons = {
      LEFT: THREE.MOUSE.NONE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    this.controls.addEventListener('start', () => this.noteMouseInteraction());
    this.controls.addEventListener('change', () => this.noteMouseInteraction());
    this.controls.update();

    this.renderer.domElement.addEventListener('pointerdown', (event) => {
      this.noteMouseInteraction();
      if (event.button === 2) {
        this.rightPointer = { x: event.clientX, y: event.clientY, ts: Date.now() };
      } else if (event.button === 1) {
        this.middlePointer = {
          x: event.clientX,
          y: event.clientY,
          ts: Date.now(),
          keyId: this.keyboard3d.getKeyIdAtPointer(event.clientX, event.clientY, this.camera, this.renderer.domElement),
        };
      }
      this.keyboard3d.handlePointerDown(event, this.camera, this.renderer.domElement);
    });
    this.renderer.domElement.addEventListener('pointerup', (event) => {
      this.noteMouseInteraction();
      if (event.button === 2 && this.rightPointer) {
        const moved = Math.hypot(event.clientX - this.rightPointer.x, event.clientY - this.rightPointer.y);
        const heldMs = Date.now() - this.rightPointer.ts;
        this.rightPointer = null;
        if (moved <= 6 && heldMs <= 220) {
          this.onVirtualKey?.('Backspace');
        }
      } else if (event.button === 1 && this.middlePointer) {
        const moved = Math.hypot(event.clientX - this.middlePointer.x, event.clientY - this.middlePointer.y);
        const heldMs = Date.now() - this.middlePointer.ts;
        const upKeyId = this.keyboard3d.getKeyIdAtPointer(
          event.clientX,
          event.clientY,
          this.camera,
          this.renderer.domElement,
        );
        const keyId =
          moved <= 6 && heldMs <= 220 && upKeyId && upKeyId === this.middlePointer.keyId
            ? upKeyId
            : null;
        this.middlePointer = null;
        if (keyId) {
          const shiftKey = keyIdToShiftInputKey(keyId);
          if (shiftKey) {
            this.onVirtualKey?.(shiftKey);
          }
        }
      }
      this.keyboard3d.handlePointerUp(event, this.camera, this.renderer.domElement, (key) => {
        this.onVirtualKey?.(key);
      });
    });
    this.renderer.domElement.addEventListener('pointermove', () => {
      this.noteMouseInteraction();
    });
    this.renderer.domElement.addEventListener('wheel', () => {
      this.noteMouseInteraction();
    });
    this.renderer.domElement.addEventListener('pointercancel', () => {
      this.rightPointer = null;
      this.middlePointer = null;
      this.keyboard3d.handlePointerCancel();
    });
    this.renderer.domElement.addEventListener('pointerleave', () => {
      this.rightPointer = null;
      this.middlePointer = null;
      this.keyboard3d.handlePointerCancel();
    });
    this.renderer.domElement.addEventListener('contextmenu', (event) => {
      event.preventDefault();
    });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.animate();
  }

  setTargetLength(len: number): void {
    void len;
  }

  applyProgress(progressChars: number): void {
    void progressChars;
  }

  onFeedback(event: RenderFeedbackEvent): void {
    this.activeFlash = 0.18;
    this.scene.background = event.type === 'correct' ? this.correctBg : this.wrongBg;
  }

  setVirtualKeyHandler(handler: (key: string) => void): void {
    this.onVirtualKey = handler;
  }

  handleKeyDown(rawKey: string, intervalMs: number | null): void {
    const keyId = normalizeGuideKey(rawKey);
    if (!keyId) return;
    this.keyboard3d.setKeyActive(keyId, true, intervalMs);
  }

  handleKeyUp(rawKey: string): void {
    const keyId = normalizeGuideKey(rawKey);
    if (!keyId) return;
    this.keyboard3d.setKeyActive(keyId, false);
  }

  clearKeyHighlights(): void {
    this.keyboard3d.clearActive();
  }

  private animate(): void {
    requestAnimationFrame(() => this.animate());
    const deltaSec = Math.min(this.clock.getDelta(), 0.05);
    this.sunTimeSec += deltaSec;
    this.updateSunLight(this.sunTimeSec);
    const idle = Date.now() - this.lastMouseInteractionTs >= KEYBOARD_3D_VISUAL_POLICY.idleResumeDelayMs;
    this.keyboard3d.setIdleMotionActive(idle);

    if (this.activeFlash > 0) {
      this.activeFlash -= 1 / 60;
      if (this.activeFlash <= 0) {
        this.scene.background = this.baseBg;
      }
    }

    this.keyboard3d.update(deltaSec);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.mount;
    this.camera.aspect = Math.max(clientWidth / Math.max(clientHeight, 1), 0.1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, Math.max(clientHeight, 1));
  }

  private noteMouseInteraction(): void {
    this.lastMouseInteractionTs = Date.now();
  }

  private updateSunLight(timeSec: number): void {
    if (!SUN_LIGHT_POLICY.enabled) return;
    const cycle = Math.max(1, SUN_LIGHT_POLICY.cycleSeconds);
    const t = (timeSec % cycle) / cycle;
    const x = (0.5 - t) * 2 * SUN_LIGHT_POLICY.xAmplitude;
    const arch = Math.sin(Math.PI * t);
    const y = SUN_LIGHT_POLICY.baseY + arch * SUN_LIGHT_POLICY.arcHeight;
    const z = SUN_LIGHT_POLICY.baseZ + Math.sin(Math.PI * (1 - t)) * SUN_LIGHT_POLICY.zAmplitude;
    this.sunLight.position.set(x, y, z);
    this.sunMesh.position.set(x, y, z);
  }
}
