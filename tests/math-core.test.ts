import { describe, expect, it } from 'vitest';
import { DEFAULT_PI, UNIT_FACTORS } from '../src/domain/math-core/constants';
import { Decimal } from '../src/domain/math-core/decimal';
import { Fraction } from '../src/domain/math-core/fraction';
import { generateUnitConversion } from '../src/core/generators/grade3';

describe('exact fraction kernel', () => {
  it('normalizes signs and reduces fractions', () => {
    expect(new Fraction(12, -18).toString()).toBe('-2/3');
    expect(new Fraction(0, 99).toString()).toBe('0');
  });

  it('calculates exactly and formats mixed numbers', () => {
    expect(new Fraction(1, 3).add(new Fraction(1, 6)).toString()).toBe('1/2');
    expect(new Fraction(7, 4).subtract(new Fraction(1, 2)).toMixedString()).toBe('1 1/4');
    expect(new Fraction(3, 5).multiply(new Fraction(10, 9)).toString()).toBe('2/3');
    expect(new Fraction(3, 4).divide(new Fraction(2, 5)).toMixedString()).toBe('1 7/8');
  });

  it('parses simple and mixed fraction notation', () => {
    expect(Fraction.parse('2 3/5').toString()).toBe('13/5');
    expect(Fraction.parse('-2 3/5').toString()).toBe('-13/5');
    expect(Fraction.parse('-0 1/2').toString()).toBe('-1/2');
    expect(Fraction.parse('-0 1/2').toMixedString()).toBe('-1/2');
    expect(new Fraction(6, -8).toString()).toBe('-3/4');
    expect(new Fraction(-12, -18).toString()).toBe('2/3');
    expect(new Fraction(0, -99).toString()).toBe('0');
    expect(() => new Fraction(1, 0)).toThrow('分母不能为 0');
    expect(() => Fraction.parse('1 2/2')).toThrow('带分数格式无效');
    expect(() => Fraction.parse('-1/-2')).toThrow('分数格式无效');
  });
});

describe('fixed decimal kernel', () => {
  it('avoids binary floating point drift', () => {
    expect(Decimal.from('0.1').add('0.2').toString()).toBe('0.3');
    expect(Decimal.from('12.50').multiply('0.4').toString()).toBe('5');
  });

  it('supports deterministic division and rounding', () => {
    expect(Decimal.from(1).divide(3, 2).toFixed(2)).toBe('0.33');
    expect(Decimal.from('2.675').round(2).toFixed(2)).toBe('2.68');
    expect(Decimal.from('-2.675').round(2).toFixed(2)).toBe('-2.68');
    expect(Decimal.from('-1').divide(8, 2).toFixed(2)).toBe('-0.13');
    expect(Decimal.from('1').divide(-8, 2).toFixed(2)).toBe('-0.13');
    expect(Decimal.from('1.005').round(2).toFixed(2)).toBe('1.01');
    expect(Decimal.from('-1.005').round(2).toFixed(2)).toBe('-1.01');
    const maxScale = Decimal.fromScaled(1n, 30);
    expect(maxScale.divide(maxScale, 30).toString()).toBe('1');
    const maxProduct = maxScale.multiply(maxScale);
    expect(maxProduct.toFixed(30)).toBe('0.000000000000000000000000000000');
    expect(maxProduct.scale).toBe(60);
    expect(maxProduct.add(maxProduct).toFixed(30)).toBe('0.000000000000000000000000000000');
    expect(maxProduct.subtract(maxProduct).toString()).toBe('0');
    expect(maxProduct.divide(maxProduct, 30).toString()).toBe('1');
    expect(() => Decimal.from('1').round(1.5)).toThrow('小数位数无效');
    expect(() => Decimal.from('1').toFixed(-1)).toThrow('小数位数无效');
    expect(() => Decimal.from('1').toFixed(31)).toThrow('小数位数无效');
    expect(() => Decimal.from('1').divide(3, 31)).toThrow('小数位数无效');
  });

  it('provides explicit curriculum-profile constants', () => {
    expect(DEFAULT_PI.toString()).toBe('3.14');
    expect(DEFAULT_PI.multiply(Decimal.from(9)).toString()).toBe('28.26');
    expect(UNIT_FACTORS.length['米:厘米'].toString()).toBe('100');
  });

  it('keeps unit conversion generation total for underspecified ranges', () => {
    const question = generateUnitConversion('standard', 1, () => 0);
    expect(question.type).toBe('unitConversion');
    expect(question.answer).toBe(10);
    expect(() => generateUnitConversion('standard', Number.NaN, () => 0)).not.toThrow();
  });
});
