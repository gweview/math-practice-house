/**
 * Digit-level regrouping counters: how many digit positions carry (addition,
 * multiplication) or borrow (subtraction) when the computation is carried
 * out column by column.
 *
 * This module is the single source for the count. Vertical generators
 * (src/core/generators/vertical.ts) and the vertical validators
 * (src/question-types/calculation/fill-vertical.ts) used to carry separate
 * copies of the same loops; a fix to one side could silently disagree with
 * the other. Both sides import these functions now, so a generated question
 * and its validation always count regroupings the same way.
 *
 * The loops propagate the carry/borrow digit by digit, so chained
 * regroupings (for example 998 + 15, where the ones carry triggers the tens
 * carry) count once per affected position.
 */

/** Number of digit positions that carry when adding a and b. */
export function additionRegroupingCount(a: number, b: number): number {
  let left = a, right = b, carry = 0, count = 0;
  while (left > 0 || right > 0) {
    const sum = left % 10 + right % 10 + carry;
    carry = sum >= 10 ? 1 : 0;
    if (carry) count++;
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return count;
}

/** Number of digit positions that borrow when subtracting b from a. */
export function subtractionRegroupingCount(a: number, b: number): number {
  let left = a, right = b, borrow = 0, count = 0;
  while (left > 0 || right > 0) {
    const topDigit = left % 10 - borrow;
    const bottomDigit = right % 10;
    if (topDigit < bottomDigit) {
      borrow = 1;
      count++;
    } else borrow = 0;
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return count;
}

/**
 * Number of digit positions that carry when multiplying `multiplicand` by
 * the single factor `factor`. For a two-digit factor the same per-digit
 * count applies (each digit of the multiplicand is multiplied by the whole
 * factor); validators and generators share this definition.
 */
export function multiplicationRegroupingCount(multiplicand: number, factor: number): number {
  let carry = 0, count = 0;
  while (multiplicand > 0) {
    const product = multiplicand % 10 * factor + carry;
    carry = Math.floor(product / 10);
    if (carry > 0) count++;
    multiplicand = Math.floor(multiplicand / 10);
  }
  return count;
}
