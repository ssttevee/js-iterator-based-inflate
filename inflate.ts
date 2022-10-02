import { BitStream, outofdata } from "./bitstream.ts";
import { Window } from "./window.ts";
import { concat } from "./util.ts";
import {
  readFixedCodingDistance,
  readFixedCodingLength,
  readFixedCodingSymbol,
} from "./coding.ts";

const endofblock = Symbol();
const storeblock = Symbol();
const fixedblock = Symbol();

interface EndOfBlockInflatorState {
  type: typeof endofblock;
}

interface StoreBlockInflatorState {
  type: typeof storeblock;
  length?: number;
  lengthComplement?: number;
  position: number;
}

interface FixedBlockInflatorState {
  type: typeof fixedblock;
  symbol?: number;
  length?: number;
}

type InflatorState =
  | EndOfBlockInflatorState
  | StoreBlockInflatorState
  | FixedBlockInflatorState;

export interface InflateOptions {
  windowSize?: number;
  initialBuffer?: Uint8Array;
}

// https://www.ietf.org/rfc/rfc1951.txt
export class Inflator implements IterableIterator<Uint8Array> {
  _closed = false;
  _bfinal = false;
  _state: InflatorState = { type: endofblock };
  _bs: BitStream;

  _window: Window;

  constructor(options: InflateOptions = {}) {
    this._window = new Window(options.windowSize ?? (1 << 15));
    this._bs = new BitStream(options.initialBuffer);
  }

  [Symbol.iterator] = () => this;

  push = (chunk: Uint8Array) => {
    this._bs.push(chunk);
    return this;
  };

  close = () => {
    this._closed = true;
    return this;
  };

  next = (): IteratorResult<Uint8Array, void> => {
    try {
      while (true) {
        switch (this._state.type) {
          case endofblock: {
            if (this._bfinal) {
              // last block was already read
              return { done: true, value: undefined };
            }

            this._bfinal = this._bs.readBits(1) === 1;
            const btype = this._bs.readNumber(2);
            if (btype === 0) {
              this._bs.alignToByte();
              this._state = { type: storeblock, position: 0 };
            } else if (btype === 1) {
              this._state = { type: fixedblock };
            } else if (btype === 2) {
              throw new Error("not implemented");
            } else if (btype === 3) {
              throw new Error("invalid btype");
            }

            continue;
          }

          case storeblock: {
            if (this._state.length === undefined) {
              this._state.length = this._bs.readNumber(16);
            }

            if (this._state.lengthComplement === undefined) {
              this._state.lengthComplement = this._bs.readNumber(16);
            }

            if (
              this._state.length !== (this._state.lengthComplement ^ 0xffff)
            ) {
              throw new Error("invalid block: len !== ~nlen");
            }

            const value = this._bs.readUpToNBytes(
              this._state.length - this._state.position,
            );
            if (value.length === 0) {
              throw outofdata;
            }

            this._state.position += value.length;
            if (this._state.position === this._state.length) {
              this._state = { type: endofblock };
            }

            this._window.push(value);
            return { done: false, value };
          }

          case fixedblock: {
            let value = new Uint8Array();
            try {
              while (true) {
                if (this._state.symbol === undefined) {
                  const symbol = readFixedCodingSymbol(this._bs);

                  if (symbol < 256) {
                    // TODO optimize
                    value = concat(value, new Uint8Array([symbol]));
                    continue;
                  }

                  if (symbol === 256) {
                    this._state = { type: endofblock };
                    this._window.push(value);
                    return { done: false, value };
                  }

                  if (symbol > 285) {
                    throw new Error("invalid symbol");
                  }

                  this._state.symbol = symbol;
                }

                if (this._state.length === undefined) {
                  this._state.length = readFixedCodingLength(
                    this._state.symbol,
                    this._bs,
                  );
                }

                value = concat(
                  value,
                  this._window.read(
                    readFixedCodingDistance(this._bs),
                    this._state.length,
                  ),
                );

                this._state.symbol = undefined;
                this._state.length = undefined;
              }
            } catch (e) {
              if (e === outofdata && value.length > 0) {
                this._window.push(value);
                return { done: false, value };
              }

              throw e;
            }
          }
        }
      }
    } catch (e) {
      if (e === outofdata) {
        if (this._closed) {
          throw new Error("unexpected end of stream");
        }

        return { done: true, value: undefined };
      }

      throw e;
    }
  };
}
