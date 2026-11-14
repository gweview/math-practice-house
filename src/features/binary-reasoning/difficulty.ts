import type { BinaryDifficultyProfile, BinaryReasoningConfig, ReasoningDifficulty, ReasoningMethod, ReasoningStage } from './types';
import { createVersionedStorage, type StorageLike } from '../../shared/storage/versioned-storage';

export const REASONING_METHODS: ReasoningMethod[] = ['sameValue', 'substitution', 'sumDifference', 'chain'];
export const REASONING_DIFFICULTIES: ReasoningDifficulty[] = ['entry', 'easy', 'standard', 'advanced', 'challenge'];
export const REASONING_STAGES: ReasoningStage[] = ['preschool', 'grade1', 'grade2', 'grade3'];

export const BINARY_DIFFICULTY_PROFILES: BinaryDifficultyProfile[] = [
  { difficulty: 'entry', label: '入门', description: '小数字、直接观察，先建立图形代表数的概念', maxValue: 5, maxTotal: 20, maxCoefficient: 2, maxSteps: 2 },
  { difficulty: 'easy', label: '简单', description: '20以内，两步代入和平均分', maxValue: 10, maxTotal: 30, maxCoefficient: 2, maxSteps: 3 },
  { difficulty: 'standard', label: '标准', description: '加入和差关系与连续推算', maxValue: 20, maxTotal: 60, maxCoefficient: 3, maxSteps: 3 },
  { difficulty: 'advanced', label: '提高', description: '更大数值和更多重复图形', maxValue: 30, maxTotal: 100, maxCoefficient: 3, maxSteps: 4 },
  { difficulty: 'challenge', label: '挑战', description: '多步推理、验算与复杂系数组合', maxValue: 50, maxTotal: 200, maxCoefficient: 4, maxSteps: 4 }
];

const STAGE_CAPS: Record<ReasoningStage, Pick<BinaryDifficultyProfile, 'maxValue' | 'maxTotal'>> = {
  preschool: { maxValue: 5, maxTotal: 20 },
  grade1: { maxValue: 10, maxTotal: 30 },
  grade2: { maxValue: 20, maxTotal: 60 },
  grade3: { maxValue: 50, maxTotal: 160 }
};

export const DEFAULT_BINARY_REASONING_CONFIG: BinaryReasoningConfig = {
  stage: 'grade1', difficulty: 'standard', methods: [...REASONING_METHODS], count: 12,
  randomMix: true, allowDuplicates: false, answerPage: true,
  fields: { name: true, date: true, time: true }, orientation: 'portrait', fontSize: 'standard'
};

export const BINARY_REASONING_STORAGE_KEY = 'math-worksheet-binary-reasoning-config-v2';
export const BINARY_REASONING_LEGACY_STORAGE_KEY = 'math-worksheet-binary-reasoning-config-v1';

export function getBinaryProfile(difficulty: ReasoningDifficulty, stage: ReasoningStage): BinaryDifficultyProfile {
  const base = BINARY_DIFFICULTY_PROFILES.find(item => item.difficulty === difficulty) ?? BINARY_DIFFICULTY_PROFILES[0];
  const cap = STAGE_CAPS[stage];
  return {
    ...base,
    maxValue: Math.min(base.maxValue, cap.maxValue),
    maxTotal: Math.min(base.maxTotal, cap.maxTotal)
  };
}

export function normalizeBinaryReasoningConfig(input: unknown): BinaryReasoningConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ...DEFAULT_BINARY_REASONING_CONFIG, methods: [...REASONING_METHODS], fields: { ...DEFAULT_BINARY_REASONING_CONFIG.fields } };
  const raw = input as Partial<BinaryReasoningConfig>;
  const methods = Array.isArray(raw.methods)
    ? raw.methods.filter((item): item is ReasoningMethod => typeof item === 'string' && REASONING_METHODS.includes(item as ReasoningMethod))
    : [];
  const numberCount = Number(raw.count);
  const fields: Partial<BinaryReasoningConfig['fields']> = raw.fields && typeof raw.fields === 'object' ? raw.fields : {};
  const boolean = <K extends 'randomMix' | 'allowDuplicates' | 'answerPage'>(key: K) =>
    typeof raw[key] === 'boolean' ? raw[key] : DEFAULT_BINARY_REASONING_CONFIG[key];
  return {
    stage: typeof raw.stage === 'string' && REASONING_STAGES.includes(raw.stage as ReasoningStage) ? raw.stage as ReasoningStage : DEFAULT_BINARY_REASONING_CONFIG.stage,
    difficulty: typeof raw.difficulty === 'string' && REASONING_DIFFICULTIES.includes(raw.difficulty as ReasoningDifficulty) ? raw.difficulty as ReasoningDifficulty : DEFAULT_BINARY_REASONING_CONFIG.difficulty,
    methods: methods.length ? [...new Set(methods)] : [...REASONING_METHODS],
    count: Number.isFinite(numberCount) ? Math.min(40, Math.max(4, Math.round(numberCount))) : DEFAULT_BINARY_REASONING_CONFIG.count,
    randomMix: boolean('randomMix'), allowDuplicates: boolean('allowDuplicates'), answerPage: boolean('answerPage'),
    fields: {
      name: typeof fields.name === 'boolean' ? fields.name : DEFAULT_BINARY_REASONING_CONFIG.fields.name,
      date: typeof fields.date === 'boolean' ? fields.date : DEFAULT_BINARY_REASONING_CONFIG.fields.date,
      time: typeof fields.time === 'boolean' ? fields.time : DEFAULT_BINARY_REASONING_CONFIG.fields.time
    },
    orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
    fontSize: raw.fontSize === 'large' ? 'large' : 'standard'
  };
}

/** Versioned, best-effort persistence; the V1 key is retained for rollback. */
export function createBinaryReasoningConfigStorage(storage?: StorageLike) {
  return createVersionedStorage<BinaryReasoningConfig>({
    key: BINARY_REASONING_STORAGE_KEY,
    version: 2,
    legacyKeys: [BINARY_REASONING_LEGACY_STORAGE_KEY],
    defaults: () => ({
      ...DEFAULT_BINARY_REASONING_CONFIG,
      methods: [...DEFAULT_BINARY_REASONING_CONFIG.methods],
      fields: { ...DEFAULT_BINARY_REASONING_CONFIG.fields }
    }),
    normalize: normalizeBinaryReasoningConfig,
    migrate: value => value,
    storage
  });
}
