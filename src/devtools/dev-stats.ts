export class DevStats {
  private frameCount = 0;
  private last = performance.now();

  constructor(private readonly root: HTMLElement) {}

  tick(): void {
    this.frameCount += 1;
    const now = performance.now();
    const delta = now - this.last;
    if (delta >= 1000) {
      const fps = Math.round((this.frameCount * 1000) / delta);
      this.root.textContent = `FPS ${fps}`;
      this.frameCount = 0;
      this.last = now;
    }
  }
}
