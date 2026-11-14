import type { Difficulty, ProblemType } from './problem-type';
import type { AnswerProtocol } from './answers';

export type Layout = 'inline' | 'vertical' | 'longDivision' | 'wide' | 'word';

export type QuestionContent =
  | { kind: 'numberLine'; start: number; end: number; step: number; values: number[]; blankIndex: number }
  | { kind: 'clock'; hour: number; minute: number }
  | { kind: 'fractionVisual'; numerator: number; denominator: number; shaded: number }
  | { kind: 'multiPart'; parts: Array<{ prompt: string; answer?: number | string; steps?: string[] }> }
  | { kind: 'pictograph'; labels: string[]; counts: number[]; symbol: string; symbols?: string[]; options?: Array<number | string> }
  | { kind: 'geometry'; shape: 'triangle' | 'trapezoid' | 'rectangle' | 'square' | 'circle' | 'cuboid' | 'cube' | 'angle' | 'line' | 'symmetry' | 'quadrilateral' | 'net' | 'composite' | 'grid' | 'cylinder' | 'sector'; dimensions?: number[]; angle?: number; labels?: string[]; netPattern?: string }
  | { kind: 'table'; headers: string[]; rows: Array<Array<string | number>>; highlight?: { row: number; column: number } }
  | { kind: 'chart'; chartType: 'bar' | 'line' | 'pie'; labels: string[]; values: number[]; unit?: string; series?: Array<{ label: string; values: number[] }> };

export interface AnswerDetails {
  display: string;
  compact?: string;
  steps?: string[];
  unit?: string;
  /** Structured answer metadata added without removing legacy scalar fields. */
  protocol?: AnswerProtocol;
}

export interface Question {
  id: string;
  type: ProblemType;
  text: string;
  answer: number | string;
  operands: number[];
  operators?: string[];
  signature: string;
  layout: Layout;
  metadata?: Record<string, string | number | boolean>;
  content?: QuestionContent;
  answerDetails?: AnswerDetails;
}

export interface ProblemProfile {
  min: number;
  max: number;
  terms: number;
  carryRate: number;
  highRangeRate: number;
  wordSteps: number;
  maxFactor: number;
  trivialRate: number;
  equalityRate: number;
  mixedRate: number;
  reverseRate: number;
  multiStepRate: number;
}

export type { Difficulty, ProblemType };
