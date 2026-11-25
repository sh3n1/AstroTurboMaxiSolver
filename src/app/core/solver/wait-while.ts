// Waiting for something under way to end, such as a plate solve, checking every so often.

/** How often the condition is checked, in milliseconds. */
const CHECK_EVERY_MS = 100;

/**
 * Waits while `busy()` is true, for at most `limitMs`, then carries on either way. Resolves
 * at once if it is already false.
 */
export async function waitWhile(busy: () => boolean, limitMs: number): Promise<void> {
  for (let waited = 0; busy() && waited < limitMs; waited += CHECK_EVERY_MS) {
    await new Promise((resolve) => setTimeout(resolve, CHECK_EVERY_MS));
  }
}
