import { Inflator } from "./inflate.ts";
import { UnexpectedEndOfStream } from "./errors.ts";

export async function* inflate(
  r: ReadableStreamReader<Uint8Array>,
  inflator: Inflator = new Inflator(),
): AsyncIterableIterator<Uint8Array> {
  yield* inflator;

  while (!inflator.done) {
    const result = await r.read();
    if (result.done) {
      throw new UnexpectedEndOfStream();
    }

    yield* inflator.push(result.value);
  }

  yield* inflator.close();
}
