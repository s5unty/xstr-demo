export type GameState = 'boot' | 'menu' | 'playing' | 'paused' | 'result';

export interface CandidateItem {
  text: string;
  code: string;
  weight: number;
  pendingCode?: string;
  syntheticShort?: boolean;
}

export interface ImeSnapshot {
  raw: string;
  candidates: CandidateItem[];
  page: number;
  pageSize: number;
  mode?: 'zh' | 'en';
  debug?: ImeDebugSnapshot;
}

export interface ImeDebugSnapshot {
  hasUppercase: boolean;
  directCount: number;
  composedCount: number;
  composedFinalCount: number;
  prefixFallbackHits: number;
  topComposedText: string;
}

export interface ImeCommitResult {
  committedText: string;
  consumed: boolean;
}

export interface GameMetrics {
  cpm: number;
  accuracy: number;
  combo: number;
  maxCombo: number;
  correctCount: number;
  wrongCount: number;
}

export interface CompareResult {
  type: 'correct' | 'wrong';
  inputChar: string;
  targetChar: string;
  index: number;
}

export interface RenderFeedbackEvent {
  type: 'correct' | 'wrong';
  progress: number;
}
