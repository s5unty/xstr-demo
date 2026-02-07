import type { CompareResult, GameMetrics, GameState, RenderFeedbackEvent } from '../types';

export interface GameSnapshot {
  state: GameState;
  targetText: string;
  confirmedText: string;
  pendingCursorIndex: number;
  metrics: GameMetrics;
  elapsedMs: number;
}

export class GameEngine {
  private state: GameState = 'boot';
  private targetText = '';
  private confirmedText = '';
  private correctnessTrail: boolean[] = [];
  private startedAt = 0;
  private correctCount = 0;
  private wrongCount = 0;
  private combo = 0;
  private maxCombo = 0;

  boot(targetText: string): void {
    this.targetText = targetText;
    this.confirmedText = '';
    this.correctnessTrail = [];
    this.startedAt = 0;
    this.correctCount = 0;
    this.wrongCount = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.state = 'menu';
  }

  start(): void {
    if (this.state === 'menu' || this.state === 'result') {
      this.confirmedText = '';
      this.correctnessTrail = [];
      this.correctCount = 0;
      this.wrongCount = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.startedAt = performance.now();
      this.state = 'playing';
    }
  }

  pause(): void {
    if (this.state === 'playing') {
      this.state = 'paused';
    }
  }

  resume(): void {
    if (this.state === 'paused') {
      this.state = 'playing';
    }
  }

  backspaceConfirmed(): void {
    if (this.confirmedText.length > 0 && (this.state === 'playing' || this.state === 'paused')) {
      this.confirmedText = this.confirmedText.slice(0, -1);
      const removed = this.correctnessTrail.pop();
      if (removed === true) {
        this.correctCount = Math.max(0, this.correctCount - 1);
      } else if (removed === false) {
        this.wrongCount = Math.max(0, this.wrongCount - 1);
      }
      this.combo = this.computeTailCombo();
    }
  }

  applyCommit(committedText: string): { compare?: CompareResult; renderEvent?: RenderFeedbackEvent } {
    if (this.state !== 'playing' || !committedText) {
      return {};
    }

    let compare: CompareResult | undefined;
    let hasProcessed = false;
    let hasWrong = false;

    for (const inputChar of committedText) {
      if (this.confirmedText.length >= this.targetText.length) {
        break;
      }
      const index = this.confirmedText.length;
      const targetChar = this.targetText[index] ?? '';
      const correct = inputChar === targetChar;
      hasProcessed = true;

      if (!compare) {
        compare = {
          type: correct ? 'correct' : 'wrong',
          inputChar,
          targetChar,
          index
        };
      }

      this.confirmedText += inputChar;
      this.correctnessTrail.push(correct);

      if (correct) {
        this.correctCount += 1;
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, this.combo);
      } else {
        this.wrongCount += 1;
        this.combo = 0;
        hasWrong = true;
      }
    }

    if (!hasProcessed) {
      return {};
    }

    if (this.confirmedText.length >= this.targetText.length && this.targetText.length > 0) {
      this.state = 'result';
    }

    return {
      compare,
      renderEvent: {
        type: hasWrong ? 'wrong' : 'correct',
        progress: this.targetText.length === 0 ? 0 : this.confirmedText.length / this.targetText.length
      }
    };
  }

  getSnapshot(): GameSnapshot {
    return {
      state: this.state,
      targetText: this.targetText,
      confirmedText: this.confirmedText,
      pendingCursorIndex: this.confirmedText.length,
      metrics: this.computeMetrics(),
      elapsedMs: this.startedAt > 0 ? performance.now() - this.startedAt : 0
    };
  }

  private computeMetrics(): GameMetrics {
    const elapsedMin = this.startedAt > 0 ? Math.max((performance.now() - this.startedAt) / 60000, 1 / 60000) : 0;
    const total = this.correctCount + this.wrongCount;
    return {
      cpm: elapsedMin === 0 ? 0 : Math.round(this.correctCount / elapsedMin),
      accuracy: total === 0 ? 100 : Math.round((this.correctCount / total) * 10000) / 100,
      combo: this.combo,
      maxCombo: this.maxCombo,
      correctCount: this.correctCount,
      wrongCount: this.wrongCount
    };
  }

  private computeTailCombo(): number {
    let streak = 0;
    for (let i = this.correctnessTrail.length - 1; i >= 0; i -= 1) {
      if (!this.correctnessTrail[i]) {
        break;
      }
      streak += 1;
    }
    return streak;
  }
}
