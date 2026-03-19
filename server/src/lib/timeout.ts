export async function withTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await operation(controller.signal);
  } catch (error) {
    const err = error as Error;
    if (err.name === "AbortError") {
      throw new Error(timeoutMessage);
    }

    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
