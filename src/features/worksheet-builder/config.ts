import { DIFFICULTY_LABELS } from '../../core/difficulty-config';
import { isTypeAllowedForStage, STAGE_LABELS, STAGE_RECOMMENDED_TYPES } from '../../core/grade-config';
import { MAX_VERTICAL_PAGES, type AnswerMode, type OrderingMode, type PracticeMode, type ProblemType, type VerticalOperation, type WorksheetConfig, type WorksheetPresetId } from '../../core/types';
import { isRegisteredProblemType, standardQuestionDefinitions } from '../../domain/questions/registry';
import { createVersionedStorage, type StorageLike } from '../../shared/storage/versioned-storage';

const STANDARD_TYPES = new Set<ProblemType>(standardQuestionDefinitions().map(definition => definition.id));
export const LEGACY_STORAGE_KEY = 'math-worksheet-config-v1';
export const STORAGE_KEY = 'math-worksheet-config-v2';

export const DEFAULT_WORKSHEET_CONFIG: WorksheetConfig = {
  stage: 'grade1',
  rangeMode: 'curriculum',
  difficulty: 'standard',
  practiceMode: 'standard',
  preset: 'daily',
  types: ['addition10', 'subtraction10', 'numberSequence', 'numberComposition'],
  typeWeights: {},
  count: 20,
  generationMode: 'count',
  pageTarget: 1,
  verticalOperations: ['addition', 'subtraction'],
  verticalPages: 1,
  showNumbers: true,
  showLines: true,
  answerPage: true,
  answerMode: 'compact',
  allowDuplicates: false,
  randomMix: true,
  ordering: 'random',
  fields: { name: true, date: true, time: true, score: true, streak: false },
  orientation: 'portrait',
  fontSize: 'standard',
  seed: ''
};

export function compatiblePracticeMode(practiceMode: PracticeMode, stage: WorksheetConfig['stage'], rangeMode: WorksheetConfig['rangeMode']): PracticeMode {
  if (rangeMode === 'free') return practiceMode;
  if (stage === 'preschool') return 'standard';
  if (practiceMode === 'verticalMulDiv' && !['grade3', 'grade4', 'grade5', 'grade6'].includes(stage)) return 'verticalAddSub';
  return practiceMode;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function booleanValue(raw: Record<string, unknown>, key: keyof WorksheetConfig, fallback: boolean): boolean {
  return typeof raw[key] === 'boolean' ? raw[key] : fallback;
}

export function normalizeStoredWorksheetConfig(value: unknown): WorksheetConfig {
  const defaults = DEFAULT_WORKSHEET_CONFIG;
  const raw = asRecord(value);
  const stage = typeof raw.stage === 'string' && Object.hasOwn(STAGE_LABELS, raw.stage) ? raw.stage as WorksheetConfig['stage'] : defaults.stage;
  const difficulty = typeof raw.difficulty === 'string' && Object.hasOwn(DIFFICULTY_LABELS, raw.difficulty) ? raw.difficulty as WorksheetConfig['difficulty'] : defaults.difficulty;
  const rangeMode = raw.rangeMode === 'free' ? 'free' : 'curriculum';
  const validTypes = (Array.isArray(raw.types) ? raw.types : []).filter((type): type is ProblemType => isRegisteredProblemType(type) && STANDARD_TYPES.has(type));
  const compatibleTypes = rangeMode === 'curriculum' ? validTypes.filter(type => isTypeAllowedForStage(type, stage)) : validTypes;
  const requestedPracticeMode: PracticeMode = raw.practiceMode === 'verticalAddSub' || raw.practiceMode === 'verticalMulDiv' || raw.practiceMode === 'verticalAll' ? raw.practiceMode : 'standard';
  const practiceMode = compatiblePracticeMode(requestedPracticeMode, stage, rangeMode);
  const canMulDiv = rangeMode === 'free' || ['grade3', 'grade4', 'grade5', 'grade6'].includes(stage);
  const allowedVerticalOperations: VerticalOperation[] = practiceMode === 'verticalMulDiv'
    ? ['multiplication', 'division']
    : practiceMode === 'verticalAll' && canMulDiv
      ? ['addition', 'subtraction', 'multiplication', 'division']
      : ['addition', 'subtraction'];
  const savedVerticalOperations = (Array.isArray(raw.verticalOperations) ? raw.verticalOperations : [])
    .filter((operation): operation is VerticalOperation => typeof operation === 'string' && allowedVerticalOperations.includes(operation as VerticalOperation));
  const verticalDivisionMode = ['mixed', 'exact', 'remainder', 'zeroQuotient', 'twoDigitDivisor'].includes(String(raw.verticalDivisionMode))
    ? raw.verticalDivisionMode as WorksheetConfig['verticalDivisionMode']
    : undefined;
  const verticalMultiplicationMode = ['mixed', 'threeByOne', 'twoByTwo'].includes(String(raw.verticalMultiplicationMode))
    ? raw.verticalMultiplicationMode as WorksheetConfig['verticalMultiplicationMode']
    : undefined;
  const verticalSubtractionMode = ['mixed', 'acrossZero'].includes(String(raw.verticalSubtractionMode))
    ? raw.verticalSubtractionMode as WorksheetConfig['verticalSubtractionMode']
    : undefined;
  const fields = asRecord(raw.fields);
  const count = Number(raw.count);
  const verticalPages = Number(raw.verticalPages);
  const generationMode = raw.generationMode === 'pages' ? 'pages' : 'count';
  const answerMode: AnswerMode = raw.answerMode === 'none' || raw.answerMode === 'compact' || raw.answerMode === 'detailed'
    ? raw.answerMode
    : typeof raw.answerPage === 'boolean' ? raw.answerPage ? 'compact' : 'none' : defaults.answerMode ?? 'compact';
  const ordering: OrderingMode = raw.ordering === 'grouped' || raw.ordering === 'progressive' || raw.ordering === 'random'
    ? raw.ordering
    : raw.randomMix === false ? 'grouped' : 'random';
  const preset: WorksheetPresetId = ['daily', 'calculation', 'comprehensive', 'application', 'geometry', 'data', 'challenge', 'custom'].includes(String(raw.preset))
    ? raw.preset as WorksheetPresetId
    : 'custom';
  const rawWeights = asRecord(raw.typeWeights);
  const typeWeights: Partial<Record<ProblemType, number>> = {};
  for (const type of compatibleTypes) {
    const weight = Number(rawWeights[type]);
    if (Number.isFinite(weight) && weight > 0) typeWeights[type] = Math.min(10, weight);
  }

  return {
    ...defaults,
    stage,
    difficulty,
    rangeMode,
    practiceMode,
    preset,
    types: compatibleTypes.length ? compatibleTypes : STAGE_RECOMMENDED_TYPES[stage],
    typeWeights,
    count: Number.isFinite(count)
      ? Math.min(100, Math.max(generationMode === 'pages' ? 1 : 5, Math.round(count)))
      : generationMode === 'pages' ? 1 : defaults.count,
    generationMode,
    pageTarget: raw.pageTarget === 2 ? 2 : 1,
    verticalOperations: savedVerticalOperations.length ? savedVerticalOperations : allowedVerticalOperations,
    verticalPages: Number.isFinite(verticalPages) ? Math.min(MAX_VERTICAL_PAGES, Math.max(1, Math.round(verticalPages))) : defaults.verticalPages,
    showNumbers: booleanValue(raw, 'showNumbers', defaults.showNumbers),
    showLines: booleanValue(raw, 'showLines', defaults.showLines),
    answerPage: answerMode !== 'none',
    answerMode,
    allowDuplicates: booleanValue(raw, 'allowDuplicates', defaults.allowDuplicates),
    randomMix: ordering === 'random',
    ordering,
    fields: {
      name: typeof fields.name === 'boolean' ? fields.name : defaults.fields.name,
      date: typeof fields.date === 'boolean' ? fields.date : defaults.fields.date,
      time: typeof fields.time === 'boolean' ? fields.time : defaults.fields.time,
      score: typeof fields.score === 'boolean' ? fields.score : defaults.fields.score,
      streak: typeof fields.streak === 'boolean' ? fields.streak : defaults.fields.streak
    },
    orientation: raw.orientation === 'landscape' ? 'landscape' : 'portrait',
    fontSize: raw.fontSize === 'large' ? 'large' : 'standard',
    seed: typeof raw.seed === 'string' ? raw.seed.trim().slice(0, 80) : '',
    ...(verticalDivisionMode ? { verticalDivisionMode } : {}),
    ...(verticalMultiplicationMode ? { verticalMultiplicationMode } : {}),
    ...(verticalSubtractionMode ? { verticalSubtractionMode } : {})
  };
}

export function createWorksheetConfigStorage(storage?: StorageLike) {
  const versioned = createVersionedStorage<WorksheetConfig>({
    key: STORAGE_KEY,
    version: 2,
    legacyKeys: [LEGACY_STORAGE_KEY],
    defaults: () => ({ ...DEFAULT_WORKSHEET_CONFIG, fields: { ...DEFAULT_WORKSHEET_CONFIG.fields } }),
    normalize: normalizeStoredWorksheetConfig,
    migrate: value => value,
    storage
  });

  return {
    load(): WorksheetConfig {
      try {
        const target = storage ?? (typeof localStorage === 'undefined' ? undefined : localStorage);
        if (target && !target.getItem(STORAGE_KEY)) {
          const legacy = target.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            try {
              const migrated = normalizeStoredWorksheetConfig(JSON.parse(legacy));
              // Keep the V1 value untouched so rollback remains possible.
              versioned.save(migrated);
              return migrated;
            } catch {
              // The versioned store will return safe defaults below.
            }
          }
        }
      } catch {
        // Storage can throw in privacy mode or when its quota is unavailable.
      }
      return versioned.load();
    },
    save: versioned.save,
    clear: versioned.clear
  };
}
