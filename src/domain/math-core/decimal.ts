export type DecimalInput = Decimal | bigint | number | string;
export type DecimalRounding = 'down' | 'half-up';
const MAX_SCALE = 30;
// A product of two public 30-place values can carry 60 places.  Keep room for
// one more exact divide/multiply using such a result without allowing
// unbounded exponent growth; public parsing and requested output stay at 30.
const MAX_INTERMEDIATE_SCALE = MAX_SCALE * 4;

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_INTERMEDIATE_SCALE) throw new Error('小数位数无效');
  return 10n ** BigInt(exponent);
}

function validateScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_SCALE) throw new Error('小数位数无效');
}

function validateIntermediateScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 0 || scale > MAX_INTERMEDIATE_SCALE) throw new Error('小数位数无效');
}

function expandExponential(value: string): string {
  const match = value.toLowerCase().match(/^([+-]?)(\d+)(?:\.(\d*))?e([+-]?\d+)$/);
  if (!match) return value;
  const sign = match[1];
  const digits = `${match[2]}${match[3] ?? ''}`;
  const decimalIndex = match[2].length + Number(match[4]);
  if (decimalIndex <= 0) return `${sign}0.${'0'.repeat(-decimalIndex)}${digits}`;
  if (decimalIndex >= digits.length) return `${sign}${digits}${'0'.repeat(decimalIndex - digits.length)}`;
  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function parseParts(input: Exclude<DecimalInput, Decimal>): { coefficient: bigint; scale: number } {
  if (typeof input === 'bigint') return { coefficient: input, scale: 0 };
  if (typeof input === 'number' && !Number.isFinite(input)) throw new Error('小数必须是有限数值');
  const expanded = expandExponential(String(input).trim());
  const match = expanded.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) throw new Error('小数格式无效');
  const fraction = match[3] ?? '';
  validateScale(fraction.length);
  const sign = match[1] === '-' ? -1n : 1n;
  return { coefficient: sign * BigInt(`${match[2]}${fraction}`), scale: fraction.length };
}

function normalize(coefficient: bigint, scale: number): { coefficient: bigint; scale: number } {
  let nextCoefficient = coefficient;
  let nextScale = scale;
  while (nextScale > 0 && nextCoefficient % 10n === 0n) {
    nextCoefficient /= 10n;
    nextScale--;
  }
  return { coefficient: nextCoefficient, scale: nextScale };
}

/** Exact immutable base-10 value backed by a scaled bigint. */
export class Decimal {
  readonly coefficient: bigint;
  readonly scale: number;

  private constructor(coefficient: bigint, scale: number) {
    const normalized = normalize(coefficient, scale);
    this.coefficient = normalized.coefficient;
    this.scale = normalized.scale;
  }

  static from(input: DecimalInput): Decimal {
    if (input instanceof Decimal) return input;
    const parts = parseParts(input);
    return new Decimal(parts.coefficient, parts.scale);
  }

  static fromScaled(coefficient: bigint, scale: number): Decimal {
    validateScale(scale);
    return new Decimal(coefficient, scale);
  }

  /** Exact product results may temporarily carry both operand scales. */
  private static fromIntermediateScaled(coefficient: bigint, scale: number): Decimal {
    validateIntermediateScale(scale);
    return new Decimal(coefficient, scale);
  }

  private align(other: Decimal): [bigint, bigint, number] {
    const scale = Math.max(this.scale, other.scale);
    return [
      this.coefficient * powerOfTen(scale - this.scale),
      other.coefficient * powerOfTen(scale - other.scale),
      scale
    ];
  }

  add(input: DecimalInput): Decimal {
    const other = Decimal.from(input);
    const [left, right, scale] = this.align(other);
    return Decimal.fromIntermediateScaled(left + right, scale);
  }

  subtract(input: DecimalInput): Decimal {
    const other = Decimal.from(input);
    const [left, right, scale] = this.align(other);
    return Decimal.fromIntermediateScaled(left - right, scale);
  }

  multiply(input: DecimalInput): Decimal {
    const other = Decimal.from(input);
    return Decimal.fromIntermediateScaled(this.coefficient * other.coefficient, this.scale + other.scale);
  }

  divide(input: DecimalInput, scale = 8, rounding: DecimalRounding = 'half-up'): Decimal {
    validateScale(scale);
    const other = Decimal.from(input);
    if (other.coefficient === 0n) throw new Error('除数不能为 0');
    const numerator = this.coefficient * powerOfTen(scale + other.scale);
    const denominator = other.coefficient * powerOfTen(this.scale);
    let quotient = numerator / denominator;
    const remainder = numerator % denominator;
    if (rounding === 'half-up' && remainder !== 0n) {
      const absoluteRemainder = remainder < 0n ? -remainder : remainder;
      const absoluteDenominator = denominator < 0n ? -denominator : denominator;
      if (absoluteRemainder * 2n >= absoluteDenominator) {
        quotient += numerator < 0n !== denominator < 0n ? -1n : 1n;
      }
    }
    return Decimal.fromScaled(quotient, scale);
  }

  round(scale: number, rounding: DecimalRounding = 'half-up'): Decimal {
    validateScale(scale);
    if (scale >= this.scale) return this;
    const factor = powerOfTen(this.scale - scale);
    let coefficient = this.coefficient / factor;
    const remainder = this.coefficient % factor;
    if (rounding === 'half-up' && remainder !== 0n) {
      const absoluteRemainder = remainder < 0n ? -remainder : remainder;
      if (absoluteRemainder * 2n >= factor) coefficient += this.coefficient < 0n ? -1n : 1n;
    }
    return Decimal.fromScaled(coefficient, scale);
  }

  compare(input: DecimalInput): -1 | 0 | 1 {
    const [left, right] = this.align(Decimal.from(input));
    return left === right ? 0 : left < right ? -1 : 1;
  }

  equals(input: DecimalInput): boolean {
    return this.compare(input) === 0;
  }

  toFixed(scale: number): string {
    validateScale(scale);
    const value = this.round(scale);
    const negative = value.coefficient < 0n;
    const digits = (negative ? -value.coefficient : value.coefficient).toString().padStart(value.scale + 1, '0');
    const whole = value.scale ? digits.slice(0, -value.scale) : digits;
    const fraction = value.scale ? digits.slice(-value.scale).padEnd(scale, '0') : ''.padEnd(scale, '0');
    return `${negative ? '-' : ''}${whole}${scale ? `.${fraction}` : ''}`;
  }

  toString(): string {
    const negative = this.coefficient < 0n;
    const digits = (negative ? -this.coefficient : this.coefficient).toString().padStart(this.scale + 1, '0');
    if (this.scale === 0) return `${negative ? '-' : ''}${digits}`;
    return `${negative ? '-' : ''}${digits.slice(0, -this.scale)}.${digits.slice(-this.scale)}`;
  }

  toNumber(): number {
    return Number(this.coefficient) / 10 ** this.scale;
  }

  toJSON(): string {
    return this.toString();
  }
}
