import type { PrintTarget } from './app-config';

export type { PrintTarget } from './app-config';

interface PrintEnvironment {
  document?: { body?: { dataset: DOMStringMap } };
  window?: {
    print?: () => void;
    setTimeout?: typeof setTimeout;
    clearTimeout?: typeof clearTimeout;
    addEventListener?: Window['addEventListener'];
    removeEventListener?: Window['removeEventListener'];
  };
}

let cleanup: (() => void) | undefined;

/**
 * Select exactly one worksheet family for printing, and always clear the
 * transient selection after the browser's print lifecycle completes.
 */
export function printTarget(target: PrintTarget): void {
  const environment = globalThis as typeof globalThis & PrintEnvironment;
  const body = environment.document?.body;
  const windowObject = environment.window;
  if (!body) return;

  cleanup?.();
  body.dataset.printTarget = target;

  const timerRef: { value?: ReturnType<typeof setTimeout> } = {};
  const finish = () => {
    if (timerRef.value !== undefined) windowObject?.clearTimeout?.(timerRef.value);
    if (body.dataset.printTarget === target) delete body.dataset.printTarget;
    if (windowObject?.removeEventListener) windowObject.removeEventListener('afterprint', finish);
    if (cleanup === finish) cleanup = undefined;
  };
  cleanup = finish;
  windowObject?.addEventListener?.('afterprint', finish, { once: true });
  timerRef.value = windowObject?.setTimeout?.(finish, 60_000);
  if (typeof windowObject?.print !== 'function') {
    finish();
    return;
  }
  try {
    windowObject.print();
  } catch {
    // Some embedded browsers expose print() but throw when printing is
    // blocked. The transient selector must not leak into the next print.
    finish();
  }
}

export class PrintController {
  print(target: PrintTarget): void { printTarget(target); }
}

export const printController = new PrintController();
