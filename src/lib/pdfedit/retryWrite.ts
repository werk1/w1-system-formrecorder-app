const isWriteConflict = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return /write conflict|WriteConflict|TransientTransactionError/i.test(message)
}

/**
 * Runs a write and repeats it when MongoDB reports a write conflict (two
 * updates of the same document at once, e.g. an image save while a manifest is
 * stored). Other errors are thrown at once.
 */
export async function retryWriteConflict<T>(write: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write()
    } catch (error) {
      if (attempt >= attempts || !isWriteConflict(error)) throw error
      await new Promise((resolve) => setTimeout(resolve, 60 * attempt))
    }
  }
}
