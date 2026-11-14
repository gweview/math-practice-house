import type { SymbolId } from './types';

export interface ReasoningSymbol {
  id: SymbolId;
  label: string;
  glyph: string;
  printGlyph: string;
}

export const SYMBOL_CATALOG: ReasoningSymbol[] = [
  { id: 'apple', label: '苹果', glyph: '●', printGlyph: '●' },
  { id: 'star', label: '星星', glyph: '★', printGlyph: '★' },
  { id: 'flower', label: '花朵', glyph: '✿', printGlyph: '✿' },
  { id: 'pencil', label: '铅笔', glyph: '▰', printGlyph: '▰' },
  { id: 'balloon', label: '气球', glyph: '◆', printGlyph: '◆' },
  { id: 'bear', label: '小熊', glyph: '⬟', printGlyph: '⬟' }
];

export function symbolById(id: SymbolId): ReasoningSymbol {
  return SYMBOL_CATALOG.find(item => item.id === id) ?? SYMBOL_CATALOG[0];
}

export function pickSymbolPair(random: () => number = Math.random): { a: SymbolId; b: SymbolId } {
  const first = Math.floor(random() * SYMBOL_CATALOG.length) % SYMBOL_CATALOG.length;
  const offset = 1 + Math.floor(random() * (SYMBOL_CATALOG.length - 1));
  return { a: SYMBOL_CATALOG[first].id, b: SYMBOL_CATALOG[(first + offset) % SYMBOL_CATALOG.length].id };
}
