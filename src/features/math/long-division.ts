export interface LongDivisionStep {
  minuend?: string;
  product: string;
}

export function computeLongDivisionSteps(dividend: number, divisor: number, columns: number): { steps: LongDivisionStep[]; finalRemainder: string } {
  const digits = [...String(dividend)].map(Number);
  const padAt = (value: number, endColumn: number) => String(value).padStart(endColumn + 1, ' ').padEnd(columns, ' ');
  const steps: LongDivisionStep[] = [];
  let current = 0;
  let started = false;
  let pendingMinuend: string | undefined;

  for (let index = 0; index < digits.length; index++) {
    current = current * 10 + digits[index];
    if (started && pendingMinuend === undefined) {
      pendingMinuend = padAt(current, index);
    } else if (started) {
      pendingMinuend = padAt(current, index);
    }
    if (!started && current < divisor && index < digits.length - 1) continue;
    started = true;
    const quotientDigit = Math.floor(current / divisor);
    if (quotientDigit > 0 || steps.length === 0) {
      const product = quotientDigit * divisor;
      steps.push({
        minuend: steps.length > 0 ? pendingMinuend : undefined,
        product: padAt(product, index)
      });
      current -= product;
      pendingMinuend = undefined;
    }
  }
  return {
    steps,
    finalRemainder: padAt(current, digits.length - 1)
  };
}
