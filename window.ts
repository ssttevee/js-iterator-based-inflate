export class Window {
  _buf: Uint8Array;
  _end = 0;

  constructor(windowSize: number) {
    this._buf = new Uint8Array(windowSize * 2);
  }

  read = (distance: number, length: number): Uint8Array => {
    if (distance > this._end) {
      throw new Error(
        "distance too far back: len " + length + " : go back " + distance,
      );
    }

    const result = new Uint8Array(length);
    if (distance >= length) {
      const start = this._end - distance;
      result.set(this._buf.slice(start, start + length));
    } else {
      const seq = this._buf.slice(this._end - distance, this._end);
      for (let i = 0; i < ((length / distance) | 0); i++) {
        result.set(seq, i * distance);
      }

      const remainingBytes = length % distance;
      if (remainingBytes > 0) {
        result.set(seq.slice(0, remainingBytes), length - remainingBytes);
      }
    }

    return result;
  };

  push = (chunk: Uint8Array) => {
    const newEnd = this._end + chunk.length;
    if (newEnd > this._buf.length) {
      const size = this._buf.length / 2;
      this._buf.set(this._buf.slice(newEnd - size));

      this._end = size - chunk.length;
    }

    this._buf.set(chunk, this._end);
    this._end += chunk.length;
  };
}
