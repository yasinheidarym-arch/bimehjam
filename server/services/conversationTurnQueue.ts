/** The production app is one Node process. Serialize complete turns, including persistence and send. */
const tails = new Map<string, Promise<void>>();
export async function withConversationTurn<T>(key: string, run: () => Promise<T>): Promise<T> {
  const prior = tails.get(key) || Promise.resolve();
  let release!: () => void;
  const tail = new Promise<void>(resolve => { release = resolve; });
  tails.set(key, tail);
  await prior;
  try { return await run(); }
  finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
