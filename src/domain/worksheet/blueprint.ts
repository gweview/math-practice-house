import type { OrderingMode, ProblemType, WorksheetConfig } from '../../core/types';
import { getQuestionDefinition } from '../questions/registry';
import { paginateByMeasuredFootprints } from './layout-metrics';

export interface TypeAllocation {
  type: ProblemType;
  count: number;
}

/** Immutable plan boundary between configuration and question generation. */
export interface WorksheetBlueprint {
  count: number;
  allocations: readonly TypeAllocation[];
  schedule: readonly ProblemType[];
  ordering: OrderingMode;
  generationMode: NonNullable<WorksheetConfig['generationMode']>;
  pageTarget: 1 | 2;
}

function safeWeight(type: ProblemType, weights?: Partial<Record<ProblemType, number>>): number {
  const value = Number(weights?.[type] ?? 1);
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Largest-remainder allocation keeps the requested total exact and makes preset weights testable. */
export function allocateTypeCounts(
  types: readonly ProblemType[],
  count: number,
  weights?: Partial<Record<ProblemType, number>>
): TypeAllocation[] {
  if (!types.length || count <= 0) return [];
  const totalWeight = types.reduce((sum, type) => sum + safeWeight(type, weights), 0);
  const raw = types.map(type => count * safeWeight(type, weights) / totalWeight);
  const base = raw.map(Math.floor);
  let remaining = count - base.reduce((sum, value) => sum + value, 0);
  const byRemainder = raw
    .map((value, index) => ({ index, remainder: value - base[index] }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const item of byRemainder) {
    if (remaining-- <= 0) break;
    base[item.index]++;
  }
  return types.map((type, index) => ({ type, count: base[index] }));
}

export function buildTypeSchedule(
  types: readonly ProblemType[],
  count: number,
  weights?: Partial<Record<ProblemType, number>>
): ProblemType[] {
  return buildScheduleFromAllocations(types, allocateTypeCounts(types, count, weights));
}

function buildScheduleFromAllocations(
  types: readonly ProblemType[],
  allocations: readonly TypeAllocation[]
): ProblemType[] {
  const remaining = new Map(allocations.map(item => [item.type, item.count]));
  const schedule: ProblemType[] = [];
  const count = allocations.reduce((sum, item) => sum + item.count, 0);
  while (schedule.length < count) {
    let progressed = false;
    for (const type of types) {
      const available = remaining.get(type) ?? 0;
      if (available <= 0) continue;
      schedule.push(type);
      remaining.set(type, available - 1);
      progressed = true;
    }
    if (!progressed) break;
  }
  return schedule;
}

function scheduleForOrdering(
  types: readonly ProblemType[],
  count: number,
  weights: Partial<Record<ProblemType, number>> | undefined,
  ordering: OrderingMode,
  balanceCategories = false
): ProblemType[] {
  const allocations = balanceCategories ? allocateCategoryBalancedCounts(types, count, weights) : allocateTypeCounts(types, count, weights);
  // Grouped composition appends one type at a time; use that exact order for
  // page budgeting. Random/progressive modes retain the interleaved schedule
  // as a stable, conservative representative before generated ordering.
  if (ordering === 'grouped') return allocations.flatMap(({ type, count: amount }) => Array(amount).fill(type));
  return buildScheduleFromAllocations(types, allocations);
}

export function buildWorksheetBlueprint(config: WorksheetConfig): WorksheetBlueprint {
  const allocations = config.preset === 'comprehensive'
    ? allocateCategoryBalancedCounts(config.types, config.count, config.typeWeights)
    : allocateTypeCounts(config.types, config.count, config.typeWeights);
  const ordering = config.ordering ?? (config.randomMix ? 'random' : 'grouped');
  return {
    count: config.count,
    allocations,
    schedule: scheduleForOrdering(config.types, config.count, config.typeWeights, ordering, config.preset === 'comprehensive'),
    ordering,
    generationMode: config.generationMode ?? 'count',
    pageTarget: config.pageTarget === 2 ? 2 : 1
  };
}

/** Ensure comprehensive presets cover all five content categories. */
export function allocateCategoryBalancedCounts(
  types: readonly ProblemType[],
  count: number,
  weights?: Partial<Record<ProblemType, number>>
): TypeAllocation[] {
  if (!types.length || count <= 0) return [];
  const groups = new Map<string, ProblemType[]>();
  for (const type of types) {
    const category = getQuestionDefinition(type).contentCategory;
    const group = groups.get(category) ?? [];
    group.push(type);
    groups.set(category, group);
  }
  if (count < groups.size) return allocateTypeCounts(types, count, weights);
  const counts = new Map(types.map(type => [type, 0]));
  for (const group of groups.values()) counts.set(group[0], 1);
  let remaining = count - groups.size;
  while (remaining > 0) {
    const candidate = types.reduce((best, type) => {
      const bestCount = counts.get(best) ?? 0;
      const currentCount = counts.get(type) ?? 0;
      const bestWeight = safeWeight(best, weights) / (bestCount + 1);
      const currentWeight = safeWeight(type, weights) / (currentCount + 1);
      return currentWeight > bestWeight ? type : best;
    }, types[0]);
    counts.set(candidate, (counts.get(candidate) ?? 0) + 1);
    remaining--;
  }
  return types.map(type => ({ type, count: counts.get(type) ?? 0 }));
}

/** @deprecated Use allocateCategoryBalancedCounts; retained for callers compiled against V2. */
export const allocateDomainBalancedCounts = allocateCategoryBalancedCounts;

export function estimatePageTargetCount(config: WorksheetConfig): number {
  if (!config.types.length) return 0;
  const target = config.pageTarget === 2 ? 2 : 1;
  const safeCounts: number[] = [];
  for (let count = 1; count <= 100; count++) {
    const ordering = config.ordering ?? (config.randomMix ? 'random' : 'grouped');
    const schedule = scheduleForOrdering(config.types, count, config.typeWeights, ordering, config.preset === 'comprehensive');
    const budget = ({ portrait: 208, landscape: 136 } as const)[config.orientation];
    const footprints = schedule.map(type => getQuestionDefinition(type).footprint);
    const heights = footprints.map(footprint => footprint.heightMm[config.fontSize]);
    const homogeneous = footprints.every(footprint => footprint.columns === footprints[0]?.columns)
      && heights.every(height => height === heights[0]);
    const maxHeight = Math.max(...heights);
    const gap = config.orientation === 'portrait' ? 8 : 7;
    // A homogeneous track uses the real paginator. For a mixed track, the
    // order-independent total-row bound is exact enough for one page; across
    // multiple pages reserve one possible failed append (largest item plus
    // its row gap) per completed page. Inline items are still packed, rather
    // than charged as singleton full rows.
    const safe = homogeneous
      ? paginateByMeasuredFootprints(schedule, config, type => ({
        columns: getQuestionDefinition(type).footprint.columns,
        heightMm: getQuestionDefinition(type).footprint.heightMm[config.fontSize]
      })).length <= target
      : worstCaseTrackHeightMm(schedule, config) <= (target === 1 ? budget : target * (budget - maxHeight - gap));
    if (safe) safeCounts.push(count);
  }
  const best = Math.max(0, ...safeCounts);
  if (best === 0) {
    throw new Error(`所选题型的单题打印空间超过目标 ${target} 页，请调整页面方向、字体或题型`);
  }
  return best;
}

/**
 * Order-independent upper bound for the current renderer's one-column/full-
 * width tracks. A full-width item creates a barrier, so at most one inline
 * item can be stranded in each of the full item's surrounding gaps. Remaining
 * inline items pack into the physical column count. This is tighter than
 * charging every heterogeneous item as a full row while remaining safe for
 * every permutation of the same multiset.
 */
export function worstCaseTrackHeightMm(
  types: readonly ProblemType[],
  config: Pick<WorksheetConfig, 'orientation' | 'fontSize'>
): number {
  if (!types.length) return 0;
  const footprints = types.map(type => getQuestionDefinition(type).footprint);
  const gapMm = config.orientation === 'portrait' ? 8 : 7;
  const columnCount = config.orientation === 'portrait' ? 2 : 3;
  if (footprints.some(footprint => footprint.columns !== 1 && footprint.columns !== 'full')) {
    return footprints.reduce((sum, footprint) => sum + footprint.heightMm[config.fontSize], 0) + (types.length - 1) * gapMm;
  }
  const fullHeights = footprints
    .filter(footprint => footprint.columns === 'full')
    .map(footprint => footprint.heightMm[config.fontSize]);
  const inlineHeights = footprints
    .filter(footprint => footprint.columns === 1)
    .map(footprint => footprint.heightMm[config.fontSize]);
  const inlineCount = inlineHeights.length;
  const maxInlineHeight = Math.max(0, ...inlineHeights);
  const inlineRows = fullHeights.length === 0
    ? Math.ceil(inlineCount / columnCount)
    : (() => {
      const surroundingGaps = fullHeights.length + 1;
      const strandedInline = Math.min(inlineCount, surroundingGaps);
      const packedInline = Math.ceil(Math.max(0, inlineCount - surroundingGaps) / columnCount);
      return strandedInline + packedInline;
    })();
  const rows = fullHeights.length + inlineRows;
  return fullHeights.reduce((sum, height) => sum + height, 0)
    + inlineRows * maxInlineHeight
    + Math.max(0, rows - 1) * gapMm;
}

export function resolvedWorksheetCount(config: WorksheetConfig): number {
  return config.generationMode === 'pages' && config.practiceMode === 'standard'
    ? estimatePageTargetCount(config)
    : config.count;
}
