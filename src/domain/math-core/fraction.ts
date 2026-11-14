export type IntegerLike = bigint | number | string;

function toInteger(value: IntegerLike, label: string): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new Error(`${label}必须是安全整数`);
    return BigInt(value);
  }
  if (!/^[+-]?\d+$/.test(value.trim())) throw new Error(`${label}必须是整数`);
  return BigInt(value.trim());
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

/** Exact immutable rational value used by fraction-based worksheet generators. */
export class Fraction {
  readonly numerator: bigint;
  readonly denominator: bigint;

  constructor(numerator: IntegerLike, denominator: IntegerLike = 1) {
    let top = toInteger(numerator, '分子');
    let bottom = toInteger(denominator, '分母');
    if (bottom === 0n) throw new Error('分母不能为 0');
    if (bottom < 0n) {
      top = -top;
      bottom = -bottom;
    }
    const divisor = greatestCommonDivisor(top, bottom);
    this.numerator = top / divisor;
    this.denominator = bottom / divisor;
  }

  static parse(value: string): Fraction {
    const text = value.trim();
    const mixed = text.match(/^([+-]?\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const whole = BigInt(mixed[1]);
      const numerator = BigInt(mixed[2]);
      const denominator = BigInt(mixed[3]);
      if (denominator === 0n || numerator >= denominator) throw new Error('带分数格式无效');
      // Keep an explicit minus on “-0 1/2”; converting the whole part to BigInt
      // alone would lose that sign and silently turn it into +1/2.
      const sign = mixed[1].startsWith('-') ? -1n : 1n;
      return new Fraction(whole * denominator + sign * numerator, denominator);
    }
    const simple = text.match(/^([+-]?\d+)(?:\/(\d+))?$/);
    if (!simple) throw new Error('分数格式无效');
    return new Fraction(simple[1], simple[2] ?? 1);
  }

  add(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  subtract(other: Fraction): Fraction {
    return new Fraction(
      this.numerator * other.denominator - other.numerator * this.denominator,
      this.denominator * other.denominator
    );
  }

  multiply(other: Fraction): Fraction {
    return new Fraction(this.numerator * other.numerator, this.denominator * other.denominator);
  }

  divide(other: Fraction): Fraction {
    if (other.numerator === 0n) throw new Error('除数不能为 0');
    return new Fraction(this.numerator * other.denominator, this.denominator * other.numerator);
  }

  compare(other: Fraction): -1 | 0 | 1 {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference === 0n ? 0 : difference < 0n ? -1 : 1;
  }

  equals(other: Fraction): boolean {
    return this.numerator === other.numerator && this.denominator === other.denominator;
  }

  isInteger(): boolean {
    return this.denominator === 1n;
  }

  toFractionString(): string {
    return this.denominator === 1n
      ? this.numerator.toString()
      : `${this.numerator}/${this.denominator}`;
  }

  toMixedString(): string {
    if (this.denominator === 1n) return this.numerator.toString();
    const negative = this.numerator < 0n;
    const absolute = negative ? -this.numerator : this.numerator;
    const whole = absolute / this.denominator;
    const remainder = absolute % this.denominator;
    if (whole === 0n) return `${negative ? '-' : ''}${remainder}/${this.denominator}`;
    if (remainder === 0n) return `${negative ? '-' : ''}${whole}`;
    return `${negative ? '-' : ''}${whole} ${remainder}/${this.denominator}`;
  }

  toNumber(): number {
    return Number(this.numerator) / Number(this.denominator);
  }

  toString(): string {
    return this.toFractionString();
  }

  toJSON(): string {
    return this.toFractionString();
  }
}
