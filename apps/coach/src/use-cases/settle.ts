/** A read that may fail without failing the page: its value, or why it could not be read. */
export type Settled<T> = { value: T; error: null } | { value: null; error: string };

/** Capture a read's failure as a message the admin can see, instead of letting it throw. */
export function settle<T>(read: Promise<T>): Promise<Settled<T>> {
  return read.then(
    (value): Settled<T> => ({ value, error: null }),
    (error: unknown): Settled<T> => ({
      value: null,
      error: error instanceof Error ? error.message : String(error)
    })
  );
}
