import { Decimal } from '../math-core/decimal';
import { Fraction } from '../math-core/fraction';

/** Symbols accepted by elementary-school comparison questions. */
export type ComparisonSymbol = '<' | '=' | '>';

export type IntegerAnswer = { kind: 'integer'; value: number };
export type DecimalAnswer = { kind: 'decimal'; value: string; scale: number };
export type FractionAnswer = {
  kind: 'fraction';
  numerator: number;
  denominator: number;
  form: 'proper' | 'improper' | 'mixed';
};
export type PercentageAnswer = { kind: 'percentage'; value: string; scale: number };
export type RatioAnswer = { kind: 'ratio'; left: number; right: number };
export type ComparisonAnswer = { kind: 'comparison'; value: ComparisonSymbol };
export type TextAnswer = { kind: 'text'; value: string };

export type NumericAnswer =
  | IntegerAnswer
  | DecimalAnswer
  | FractionAnswer
  | PercentageAnswer
  | RatioAnswer
  | ComparisonAnswer;

export type AnswerValue =
  | NumericAnswer
  | TextAnswer
  | { kind: 'quantity'; value: Exclude<NumericAnswer, ComparisonAnswer | RatioAnswer>; unit: string }
  | { kind: 'multiPart'; parts: readonly AnswerValue[] };

export interface AnswerStep {
  text: string;
  result?: AnswerValue;
}

/** Structured answer metadata. `Question.answer` remains the legacy scalar during migration. */
export interface AnswerProtocol {
  value: AnswerValue;
  display: string;
  compact?: string;
  steps?: readonly AnswerStep[];
}

export interface LegacyAnswerDetails {
  display?: string;
  compact?: string;
  steps?: readonly string[];
  unit?: string;
}

const MAX_DIGITS = 30;

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

function validScale(scale: unknown): scale is number {
  return Number.isInteger(scale) && typeof scale === 'number' && scale >= 0 && scale <= MAX_DIGITS;
}

function decimalScale(value: string): number {
  const point = value.indexOf('.');
  return point < 0 ? 0 : value.length - point - 1;
}

function decimalText(value: string, scale: number): string | undefined {
  if (!validScale(scale) || value.length > MAX_DIGITS + 3 || !/^[+-]?\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  try {
    return Decimal.from(value.trim()).toFixed(scale);
  } catch {
    return undefined;
  }
}

function fractionForm(value: Fraction): FractionAnswer['form'] {
  if (value.denominator === 1n) return 'improper';
  const absolute = value.numerator < 0n ? -value.numerator : value.numerator;
  return absolute < value.denominator ? 'proper' : 'improper';
}

export function integerAnswer(value: number): IntegerAnswer {
  if (!isSafeInteger(value)) throw new Error('整数答案必须是安全整数');
  return { kind: 'integer', value };
}

export function decimalAnswer(value: string | number, scale = typeof value === 'string' ? decimalScale(value) : 0): DecimalAnswer {
  const text = decimalText(String(value), scale);
  if (text === undefined) throw new Error('定点小数答案格式无效');
  return { kind: 'decimal', value: text, scale };
}

export function fractionAnswer(numerator: number, denominator: number, form: FractionAnswer['form'] | 'auto' = 'auto'): FractionAnswer {
  if (!isSafeInteger(numerator) || !isSafeInteger(denominator) || denominator === 0) throw new Error('分数答案结构无效');
  if (form !== 'auto' && form !== 'proper' && form !== 'improper' && form !== 'mixed') throw new Error('分数表示形式无效');
  const value = new Fraction(numerator, denominator);
  const selected = form === 'auto' ? fractionForm(value) : form;
  if (selected === 'proper' && (value.numerator < 0n ? -value.numerator : value.numerator) >= value.denominator) throw new Error('真分数格式无效');
  if (selected === 'improper' && (value.numerator < 0n ? -value.numerator : value.numerator) < value.denominator) throw new Error('假分数格式无效');
  return { kind: 'fraction', numerator: Number(value.numerator), denominator: Number(value.denominator), form: selected };
}

export function percentageAnswer(value: string | number, scale = typeof value === 'string' ? decimalScale(value) : 0): PercentageAnswer {
  const text = decimalText(String(value), scale);
  if (text === undefined) throw new Error('百分数答案格式无效');
  return { kind: 'percentage', value: text, scale };
}

export function ratioAnswer(left: number, right: number): RatioAnswer {
  if (!isSafeInteger(left) || !isSafeInteger(right) || left < 0 || right <= 0) throw new Error('比答案结构无效');
  return { kind: 'ratio', left, right };
}

export function comparisonAnswer(value: ComparisonSymbol): ComparisonAnswer {
  if (value !== '<' && value !== '=' && value !== '>') throw new Error('比较符号答案无效');
  return { kind: 'comparison', value };
}

export function textAnswer(value: string): TextAnswer {
  if (!value.trim()) throw new Error('文字答案不能为空');
  return { kind: 'text', value };
}

export function quantityAnswer(value: Exclude<NumericAnswer, ComparisonAnswer | RatioAnswer>, unit: string): AnswerValue {
  if (!unit.trim()) throw new Error('单位不能为空');
  return { kind: 'quantity', value, unit };
}

function isQuantityValue(value: AnswerValue): value is Exclude<NumericAnswer, ComparisonAnswer | RatioAnswer> {
  return value.kind === 'integer' || value.kind === 'decimal' || value.kind === 'fraction' || value.kind === 'percentage';
}

export function multiPartAnswer(parts: readonly AnswerValue[]): AnswerValue {
  if (!parts.length || parts.some(part => part.kind === 'multiPart')) throw new Error('多问答案结构无效');
  return { kind: 'multiPart', parts: [...parts] };
}

export function answerProtocol(value: AnswerValue, options: { display?: string; compact?: string; steps?: readonly AnswerStep[] } = {}): AnswerProtocol {
  return {
    value,
    display: options.display ?? formatAnswer(value),
    ...(options.compact === undefined ? {} : { compact: options.compact }),
    ...(options.steps === undefined ? {} : { steps: [...options.steps] })
  };
}

export function formatAnswer(value: AnswerValue): string {
  switch (value.kind) {
    case 'integer': return String(value.value);
    case 'decimal': return value.value;
    case 'fraction': {
      const fraction = new Fraction(value.numerator, value.denominator);
      if (value.form !== 'mixed') return fraction.toFractionString();
      const negative = fraction.numerator < 0n;
      const absolute = negative ? -fraction.numerator : fraction.numerator;
      const whole = absolute / fraction.denominator;
      const remainder = absolute % fraction.denominator;
      return remainder === 0n ? `${negative ? '-' : ''}${whole}` : `${negative ? '-' : ''}${whole} ${remainder}/${fraction.denominator}`;
    }
    case 'percentage': return `${value.value}%`;
    case 'ratio': return `${value.left}:${value.right}`;
    case 'comparison': return value.value;
    case 'text': return value.value;
    case 'quantity': return `${formatAnswer(value.value)} ${value.unit}`;
    case 'multiPart': return value.parts.map(formatAnswer).join('；');
  }
}

function own(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function knownKeys(value: object, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every(key => allowed.has(key));
}

/** Parses untrusted structured data without throwing. Unknown fields are rejected. */
export function parseAnswer(value: unknown): AnswerValue | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.kind !== 'string') return undefined;
  try {
    switch (source.kind) {
      case 'integer':
        return knownKeys(source, ['kind', 'value']) && own(source, 'value') && isSafeInteger(source.value) ? integerAnswer(source.value) : undefined;
      case 'decimal':
        return knownKeys(source, ['kind', 'value', 'scale']) && own(source, 'value') && typeof source.value === 'string' && validScale(source.scale) ? decimalAnswer(source.value, source.scale) : undefined;
      case 'fraction':
        return knownKeys(source, ['kind', 'numerator', 'denominator', 'form']) && own(source, 'numerator') && own(source, 'denominator') && isSafeInteger(source.numerator) && isSafeInteger(source.denominator) && (source.form === 'proper' || source.form === 'improper' || source.form === 'mixed')
          ? fractionAnswer(source.numerator, source.denominator, source.form) : undefined;
      case 'percentage':
        return knownKeys(source, ['kind', 'value', 'scale']) && typeof source.value === 'string' && validScale(source.scale) ? percentageAnswer(source.value, source.scale) : undefined;
      case 'ratio':
        return knownKeys(source, ['kind', 'left', 'right']) && isSafeInteger(source.left) && isSafeInteger(source.right) ? ratioAnswer(source.left, source.right) : undefined;
      case 'comparison':
        return knownKeys(source, ['kind', 'value']) && (source.value === '<' || source.value === '=' || source.value === '>') ? comparisonAnswer(source.value) : undefined;
      case 'text':
        return knownKeys(source, ['kind', 'value']) && typeof source.value === 'string' && source.value.trim() ? textAnswer(source.value) : undefined;
      case 'quantity': {
        if (!knownKeys(source, ['kind', 'value', 'unit'])) return undefined;
        const nested = parseAnswer(source.value);
        return nested && isQuantityValue(nested) && typeof source.unit === 'string' && source.unit.trim()
          ? quantityAnswer(nested, source.unit) : undefined;
      }
      case 'multiPart': {
        if (!knownKeys(source, ['kind', 'parts'])) return undefined;
        if (!Array.isArray(source.parts) || source.parts.length === 0) return undefined;
        const parts = source.parts.map(parseAnswer);
        return parts.every((part): part is AnswerValue => part !== undefined) ? multiPartAnswer(parts) : undefined;
      }
      default: return undefined;
    }
  } catch {
    return undefined;
  }
}

export function parseAnswerProtocol(value: unknown): AnswerProtocol | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (!knownKeys(source, ['value', 'display', 'compact', 'steps']) || typeof source.display !== 'string') return undefined;
  const parsed = parseAnswer(source.value);
  if (!parsed || source.display !== formatAnswer(parsed)) return undefined;
  if (source.compact !== undefined && typeof source.compact !== 'string') return undefined;
  if (source.steps !== undefined && (!Array.isArray(source.steps) || source.steps.some(step => !step || typeof step !== 'object' || Array.isArray(step) || !knownKeys(step as object, ['text', 'result']) || typeof (step as Record<string, unknown>).text !== 'string'))) return undefined;
  const steps = Array.isArray(source.steps) ? source.steps.map(step => {
    const item = step as Record<string, unknown>;
    const result = item.result === undefined ? undefined : parseAnswer(item.result);
    return result === undefined && item.result !== undefined ? undefined : { text: item.text as string, ...(result === undefined ? {} : { result }) };
  }) : undefined;
  if (steps?.some(step => step === undefined)) return undefined;
  return answerProtocol(parsed, { display: source.display, compact: source.compact as string | undefined, steps: steps as AnswerStep[] | undefined });
}

function numericFraction(value: Exclude<NumericAnswer, PercentageAnswer | RatioAnswer | ComparisonAnswer>): Fraction {
  if (value.kind === 'integer') return new Fraction(value.value);
  if (value.kind === 'fraction') return new Fraction(value.numerator, value.denominator);
  return new Fraction(value.value.replace('.', ''), 10n ** BigInt(value.scale));
}

function sameNumeric(left: Exclude<NumericAnswer, PercentageAnswer | RatioAnswer | ComparisonAnswer>, right: Exclude<NumericAnswer, PercentageAnswer | RatioAnswer | ComparisonAnswer>): boolean {
  return numericFraction(left).equals(numericFraction(right));
}

/** Semantic equality used by validators and answer-key adapters. */
export function compareAnswers(left: AnswerValue, right: AnswerValue): boolean {
  if ((left.kind === 'integer' || left.kind === 'decimal' || left.kind === 'fraction') && (right.kind === 'integer' || right.kind === 'decimal' || right.kind === 'fraction')) return sameNumeric(left, right);
  if (left.kind === 'percentage' && right.kind === 'percentage') return Decimal.from(left.value).equals(right.value);
  if (left.kind === 'ratio' && right.kind === 'ratio') return BigInt(left.left) * BigInt(right.right) === BigInt(right.left) * BigInt(left.right);
  if (left.kind === 'comparison' && right.kind === 'comparison') return left.value === right.value;
  if (left.kind === 'text' && right.kind === 'text') return left.value === right.value;
  if (left.kind === 'quantity' && right.kind === 'quantity') return left.unit === right.unit && compareAnswers(left.value, right.value);
  if (left.kind === 'multiPart' && right.kind === 'multiPart') return left.parts.length === right.parts.length && left.parts.every((part, index) => compareAnswers(part, right.parts[index]));
  return false;
}

/** Compares the complete protocol envelope, including optional compact and steps fields. */
export function compareAnswerProtocols(left: AnswerProtocol, right: AnswerProtocol): boolean {
  if (!compareAnswers(left.value, right.value) || left.display !== right.display || left.compact !== right.compact) return false;
  if (left.steps === undefined || right.steps === undefined) return left.steps === right.steps;
  return left.steps.length === right.steps.length && left.steps.every((step, index) => {
    const other = right.steps?.[index];
    return other !== undefined && step.text === other.text
      && (step.result === undefined || (other.result !== undefined && compareAnswers(step.result, other.result)))
      && (step.result !== undefined || other.result === undefined);
  });
}

export function parseFractionText(value: string): FractionAnswer | undefined {
  const text = value.trim();
  const mixed = text.match(/^([+-]?\d+)\s+(\d+)\/(\d+)$/);
  try {
    if (mixed) {
      const wholeText = mixed[1]; const numerator = Number(mixed[2]); const denominator = Number(mixed[3]);
      if (numerator >= denominator || denominator === 0 || !Number.isSafeInteger(Number(wholeText))) return undefined;
      const whole = Number(wholeText); const sign = wholeText.startsWith('-') ? -1 : 1;
      return fractionAnswer(whole * denominator + sign * numerator, denominator, 'mixed');
    }
    const simple = text.match(/^([+-]?\d+)\/(\d+)$/);
    return simple ? fractionAnswer(Number(simple[1]), Number(simple[2]), 'auto') : undefined;
  } catch {
    return undefined;
  }
}

/** Converts legacy scalar fields to the protocol while preserving unknown text answers. */
export function fromLegacyAnswer(answer: number | string, details: LegacyAnswerDetails = {}): AnswerProtocol {
  if (typeof answer === 'number' && !Number.isFinite(answer)) throw new Error('旧答案必须是有限数值');
  const rawText = String(answer).trim();
  const text = details.unit && rawText.endsWith(details.unit) ? rawText.slice(0, -details.unit.length).trim() : rawText;
  let value: AnswerValue;
  const percent = text.match(/^([+-]?\d+(?:\.\d+)?)%$/);
  const comparison = text === '<' || text === '=' || text === '>' ? text : undefined;
  const ratio = text.match(/^([0-9]+):([0-9]+)$/);
  const fraction = parseFractionText(text);
  if (typeof answer === 'number' && Number.isSafeInteger(answer)) value = integerAnswer(answer);
  else if (/^[+-]?\d+$/.test(text)) value = integerAnswer(Number(text));
  else if (percent) value = percentageAnswer(percent[1]);
  else if (comparison) value = comparisonAnswer(comparison);
  else if (ratio) value = ratioAnswer(Number(ratio[1]), Number(ratio[2]));
  else if (fraction) value = fraction;
  else if (/^[+-]?\d+\.\d+$/.test(text)) value = decimalAnswer(text);
  else value = textAnswer(String(answer));
  if (details.unit) {
    if (isQuantityValue(value)) value = quantityAnswer(value, details.unit);
  }
  const steps = details.steps?.map(step => ({ text: step }));
  return answerProtocol(value, { display: details.display ?? formatAnswer(value), compact: details.compact, steps });
}

export function fromLegacyParts(parts: readonly { answer?: number | string; steps?: readonly string[] }[]): AnswerProtocol | undefined {
  if (!parts.length || parts.some(part => part.answer === undefined)) return undefined;
  const values = parts.map(part => fromLegacyAnswer(part.answer as number | string, { steps: part.steps }).value);
  return answerProtocol(multiPartAnswer(values));
}
