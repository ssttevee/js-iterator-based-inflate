import { unreachable } from "https://deno.land/x/unreachable/mod.ts";
import { concat } from "./util.ts";
import { UnexpectedEndOfStream } from "./errors.ts";

function reverseBits(v: number, size: number): number {
  let result = 0;
  for (let i = 0; i < size; i++) {
    result = (result << 1) | (v & 1);
    v = v >> 1;
  }

  return result;
}

export class BitStream {
  _buf: Uint8Array;
  _bitOffset = 8;
  _currentByte = 0;

  consumedBytes = 0;

  constructor(buf: Uint8Array = new Uint8Array()) {
    this._buf = buf;
  }

  _loadNextByte = () => {
    if (this._buf.length === 0) {
      throw new UnexpectedEndOfStream();
    }

    this._currentByte = this._buf[0];
    this._buf = this._buf.slice(1);
    this._bitOffset = 0;
    this.consumedBytes += 1;
  };

  save = (): unknown => ({
    _buf: this._buf,
    _bitOffset: this._bitOffset,
    _currentByte: this._currentByte,
  });

  restore = (state: unknown) => Object.assign(this, state);

  readBits = (n: number, result = 0) => {
    const saved = this.save();
    try {
      while (n > 0) {
        if (this._bitOffset === 8) {
          this._loadNextByte();
        }

        result = (result << 1) | ((this._currentByte >> this._bitOffset) & 1);
        this._bitOffset += 1;
        n -= 1;
      }

      return result;
    } catch (e) {
      if (e instanceof UnexpectedEndOfStream) {
        this.restore(saved);
      }

      throw e;
    }
  };

  readNumber = (width: number) => reverseBits(this.readBits(width), width);

  readUpToNBytes = (n: number) => {
    const available = Math.min(n, this._buf.length);
    if (available === 0) {
      throw new UnexpectedEndOfStream();
    }

    if (this._bitOffset === 0) {
      // bytes are lazily loaded and bitOffset is 0 only after a byte is loaded
      unreachable();
    }

    if (this._bitOffset === 8) {
      const result = this._buf.slice(0, available);
      this._buf = this._buf.slice(available);
      return result;
    }

    const result = new Uint8Array(available);
    for (let i = 0; i < available; i++) {
      result[i] = this.readNumber(8);
    }

    return result;
  };

  alignToByte = () => {
    this._bitOffset = 8;
  };

  push = (buf: Uint8Array) => {
    this._buf = concat(this._buf, buf);
  };
}
