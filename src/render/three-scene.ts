import * as THREE from 'three';
import type { RenderFeedbackEvent } from '../types';

export class ThreeScene {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: true });
  private readonly baseBg = new THREE.Color('#0f172a');
  private readonly correctBg = new THREE.Color('#052e16');
  private readonly wrongBg = new THREE.Color('#450a0a');
  private activeFlash = 0;

  constructor(private readonly mount: HTMLElement) {
    this.camera.position.set(0, 2.2, 5.5);
    this.scene.background = this.baseBg;

    const hemi = new THREE.HemisphereLight('#dbeafe', '#0b1220', 1.1);
    this.scene.add(hemi);

    const dir = new THREE.DirectionalLight('#ffffff', 0.9);
    dir.position.set(2, 4, 3);
    this.scene.add(dir);

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.mount.appendChild(this.renderer.domElement);

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

  private animate(): void {
    requestAnimationFrame(() => this.animate());

    if (this.activeFlash > 0) {
      this.activeFlash -= 1 / 60;
      if (this.activeFlash <= 0) {
        this.scene.background = this.baseBg;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.mount;
    this.camera.aspect = Math.max(clientWidth / Math.max(clientHeight, 1), 0.1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, Math.max(clientHeight, 1));
  }
}
