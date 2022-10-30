import { BitStream } from "./bitstream.ts";
import { UnexpectedEndOfStream } from "./errors.ts";
import { Window } from "./window.ts";
import { concat } from "./util.ts";
import * as coding from "./coding.ts";

const endofblock = Symbol();
const storeblock = Symbol();
const fixedblock = Symbol();
const dynamicblock = Symbol();

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
  ll?: number;
  length?: number;
  code?: {
    ll: coding.MapMin;
    dist: coding.MapMin;
  };
}

interface DynamicBlockInflatorState {
  type: typeof dynamicblock;
  hlit?: number;
  hdist?: number;
  hclen?: number;
  clmap?: coding.MapMin;
  llmap?: coding.MapMin;
  distmap?: coding.MapMin;
}

type InflatorState =
  | EndOfBlockInflatorState
  | StoreBlockInflatorState
  | FixedBlockInflatorState
  | DynamicBlockInflatorState;

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

  /**
   * The final block has been fully emitted and no more data will be emitted
   * even if there is additional data in the bitstream.
   */
  get done() {
    return this._bfinal && this._state.type === endofblock;
  }

  /**
   * The buffer of prestine bytes in the bitstream. This is useful to get
   * trailing data that was not part of the deflate stream.
   */
  get buf() {
    return this._bs._buf;
  }

  /**
   * The total number of bytes consumed.
   */
  get consumedBytes() {
    return this._bs.consumedBytes;
  }

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
              this._state = { type: dynamicblock };
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

            if (this._state.length <= this._state.position) {
              this._state = { type: endofblock };
              continue;
            }

            const value = this._bs.readUpToNBytes(
              this._state.length - this._state.position,
            );
            if (value.length === 0) {
              throw new UnexpectedEndOfStream();
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
                if (this._state.ll === undefined) {
                  const ll = coding.readLiteralOrLength(
                    this._bs,
                    this._state.code?.ll || coding.fixed.ll,
                  );
                  if (ll < 256) {
                    // TODO optimize
                    this._window.push(new Uint8Array([ll]));
                    value = concat(value, new Uint8Array([ll]));
                    continue;
                  }

                  if (ll === 256) {
                    this._state = { type: endofblock };
                    return { done: false, value };
                  }

                  if (ll > 285) {
                    throw new Error("invalid symbol");
                  }

                  this._state.ll = ll;
                }

                if (this._state.length === undefined) {
                  this._state.length = coding.readAdditionalLengthBits(
                    this._bs,
                    this._state.ll,
                  );
                }

                const bytes = this._window.read(
                  coding.readDistance(
                    this._bs,
                    this._state.code?.dist || coding.fixed.dist,
                  ),
                  this._state.length,
                );
                this._window.push(bytes);
                value = concat(value, bytes);

                this._state.ll = undefined;
                this._state.length = undefined;
              }
            } catch (e) {
              if (e instanceof UnexpectedEndOfStream) {
                if (value.length > 0) {
                  return { done: false, value };
                }
              }

              throw e;
            }
          }

          case dynamicblock: {
            if (this._state.hlit === undefined) {
              this._state.hlit = this._bs.readNumber(5);
            }

            if (this._state.hdist === undefined) {
              this._state.hdist = this._bs.readNumber(5);
            }

            if (this._state.hclen === undefined) {
              this._state.hclen = this._bs.readNumber(4);
            }

            if (this._state.clmap === undefined) {
              this._state.clmap = coding.readCLMap(this._bs, this._state.hclen);
            }

            if (this._state.llmap === undefined) {
              this._state.llmap = coding.readLiteralLengthAlphabet(
                this._bs,
                this._state.clmap,
                this._state.hlit,
              );
            }

            if (this._state.distmap === undefined) {
              this._state.distmap = coding.readDistanceAlphabet(
                this._bs,
                this._state.clmap,
                this._state.hdist,
              );
            }

            this._state = {
              type: fixedblock,
              code: {
                ll: this._state.llmap,
                dist: this._state.distmap,
              },
            };
          }
        }
      }
    } catch (e) {
      if (e instanceof UnexpectedEndOfStream) {
        if (this._closed) {
          throw e;
        }

        return { done: true, value: undefined };
      }

      throw e;
    }
  };
}
