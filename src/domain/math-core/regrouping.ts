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
  return additionCarryPositions(a, b).filter(Boolean).length;
}

/** Number of digit positions that borrow when subtracting b from a. */
export function subtractionRegroupingCount(a: number, b: number): number {
  return subtractionBorrowPositions(a, b).filter(Boolean).length;
}

/**
 * Number of digit positions that carry when multiplying `multiplicand` by
 * the single factor `factor`. For a two-digit factor the same per-digit
 * count applies (each digit of the multiplicand is multiplied by the whole
 * factor); validators and generators share this definition.
 */
export function multiplicationRegroupingCount(multiplicand: number, factor: number): number {
  return multiplicationCarryPositions(multiplicand, factor).filter(Boolean).length;
}

/** Carry-out flag per digit position (least significant first) for a + b. */
export function additionCarryPositions(a: number, b: number): boolean[] {
  const positions: boolean[] = [];
  let left = a, right = b, carry = 0;
  while (left > 0 || right > 0) {
    const sum = left % 10 + right % 10 + carry;
    carry = sum >= 10 ? 1 : 0;
    positions.push(carry === 1);
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return positions;
}

/** Borrow-out flag per digit position (least significant first) for a - b. */
export function subtractionBorrowPositions(a: number, b: number): boolean[] {
  const positions: boolean[] = [];
  let left = a, right = b, borrow = 0;
  while (left > 0 || right > 0) {
    const topDigit = left % 10 - borrow;
    const bottomDigit = right % 10;
    if (topDigit < bottomDigit) {
      borrow = 1;
    } else borrow = 0;
    positions.push(borrow === 1);
    left = Math.floor(left / 10);
    right = Math.floor(right / 10);
  }
  return positions;
}

/** Carry-out flag per multiplicand digit (least significant first) for a × factor. */
export function multiplicationCarryPositions(multiplicand: number, factor: number): boolean[] {
  const positions: boolean[] = [];
  let carry = 0;
  while (multiplicand > 0) {
    const product = multiplicand % 10 * factor + carry;
    carry = Math.floor(product / 10);
    positions.push(carry > 0);
    multiplicand = Math.floor(multiplicand / 10);
  }
  return positions;
}

/** True when two adjacent digit positions both regroup. */
export function hasConsecutivePositions(positions: readonly boolean[]): boolean {
  for (let index = 1; index < positions.length; index++) {
    if (positions[index] && positions[index - 1]) return true;
  }
  return false;
}

/** True when adding a and b carries at two adjacent digit positions. */
export function hasConsecutiveAdditionRegrouping(a: number, b: number): boolean {
  return hasConsecutivePositions(additionCarryPositions(a, b));
}

/** True when subtracting b from a borrows at two adjacent digit positions. */
export function hasConsecutiveSubtractionRegrouping(a: number, b: number): boolean {
  return hasConsecutivePositions(subtractionBorrowPositions(a, b));
}

/** True when multiplying a by factor carries at two adjacent digit positions. */
export function hasConsecutiveMultiplicationRegrouping(a: number, factor: number): boolean {
  return hasConsecutivePositions(multiplicationCarryPositions(a, factor));
}

/**
 * True when a - b is an across-zero subtraction: it borrows, and the
 * minuend has a zero in the ones or tens place. This is the contract the
 * acrossZero sub-mode and its tests use (for example 500 - 168 and
 * 40 - 27 both qualify: the borrow chain runs through a zero digit).
 */
export function hasAcrossZeroPattern(a: number, b: number): boolean {
  return subtractionRegroupingCount(a, b) > 0 && (a % 10 === 0 || Math.floor(a / 10) % 10 === 0);
}
