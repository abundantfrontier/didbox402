/** Detect vitest/workers test pool without assuming Node `process` exists. */
export function isVitestRuntime(): boolean {
  try {
    return typeof process !== 'undefined'
      && (process.env?.NODE_ENV === 'test' || process.env?.VITEST === 'true');
  } catch {
    return false;
  }
}