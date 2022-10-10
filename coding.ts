import { BitStream } from "./bitstream.ts";
import { UnexpectedEndOfStream } from "./errors.ts";

export function readCodeWithAdditionalBits(
  bs: BitStream,
  code: number,
  groupSize: number,
  base: number,
): number {
  const additionalBits = Math.max(0, ((code - groupSize) / groupSize) | 0);
  if (additionalBits === 0) {
    return base + code;
  }

  // some maths work went into deriving this closed form expression
  const groupIndex = code % groupSize;
  return base + code - (additionalBits + 1) * groupSize - groupIndex +
    (1 << additionalBits) * (groupSize + groupIndex) +
    bs.readNumber(additionalBits);
}

interface SymbolMap {
  [symbol: number]: number | undefined;
}

export interface MapMin {
  maps: SymbolMap[];
  min: number;
}

function makeMapMinEntry(f: (i: number) => number | undefined): SymbolMap {
  return new Proxy({}, { get: (_, i) => f(+(i as any)) }) as any;
}

export const fixed = {
  ll: {
    maps: [
      makeMapMinEntry((i) => i <= 0b0010111 ? i + 256 : undefined),
      makeMapMinEntry((i) =>
        i <= 0b10111111 ? i - 48 : i <= 0b11000111 ? i + 88 : undefined
      ),
      makeMapMinEntry((i) => i - 256),
    ],
    min: 7,
  },
  dist: {
    maps: [
      makeMapMinEntry((i) => i),
    ],
    min: 5,
  },
};

function readSymbolWithMapMin(bs: BitStream, mm: MapMin): number {
  let symbol = bs.readBits(mm.min - 1);
  let value: number | undefined;
  for (const m of mm.maps) {
    value = m[symbol = bs.readBits(1, symbol)];
    if (value !== undefined) {
      return value;
    }
  }

  throw new Error("invalid symbol");
}

export function readLiteralOrLength(bs: BitStream, mm: MapMin): number {
  const saved = bs.save();
  try {
    return readSymbolWithMapMin(bs, mm);
  } catch (e) {
    if (e instanceof UnexpectedEndOfStream) {
      bs.restore(saved);
    }

    throw e;
  }
}

export function readAdditionalLengthBits(
  bs: BitStream,
  symbol: number,
): number {
  if (symbol > 284) {
    return 258;
  }

  return readCodeWithAdditionalBits(bs, symbol - 257, 4, 3);
}

export function readDistance(bs: BitStream, mm: MapMin): number {
  const saved = bs.save();
  try {
    return readCodeWithAdditionalBits(bs, readSymbolWithMapMin(bs, mm), 2, 1);
  } catch (e) {
    if (e instanceof UnexpectedEndOfStream) {
      bs.restore(saved);
    }

    throw e;
  }
}

export function getCanonicalCodes(
  codeLenths: number[],
): SymbolMap[] {
  const blCount = [0];
  for (const codeLen of codeLenths) {
    if (!codeLen) {
      continue;
    }

    if (blCount.length < codeLen + 1) {
      blCount.push(...new Array(codeLen - blCount.length + 1).fill(0));
    }

    blCount[codeLen] += 1;
  }

  const nextCode = [0];
  let code = 0;
  for (let i = 1; i < blCount.length; i++) {
    code = (code + blCount[i - 1]) << 1;
    nextCode.push(code);
  }

  const canonicalCode = Array.from(
    { length: blCount.length },
    (): SymbolMap => ({}),
  );
  for (let i = 0; i < codeLenths.length; i++) {
    const codeLen = codeLenths[i];
    if (!codeLen) {
      continue;
    }

    canonicalCode[codeLen][nextCode[codeLen]] = i;
    nextCode[codeLen] += 1;
  }

  return canonicalCode;
}

function buildCodeMap(
  canonicalCodes: SymbolMap[],
): MapMin {
  const min = canonicalCodes.findIndex((m) => Object.keys(m).length);
  const maps = canonicalCodes.slice(min);

  return { maps, min };
}

// deno-fmt-ignore
const clorder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

export function readCLMap(bs: BitStream, hclen: number): MapMin {
  const state = bs.save();
  try {
    const clens = new Array<number>(19).fill(0);

    for (let i = 0; i < hclen + 4; i++) {
      clens[clorder[i]] = bs.readNumber(3);
    }

    // apply canonical Huffman code algorithm
    return buildCodeMap(getCanonicalCodes(clens));
  } catch (e) {
    if (e instanceof UnexpectedEndOfStream) {
      bs.restore(state);
    }

    throw e;
  }
}

function readAlphabetWithCLMap(
  bs: BitStream,
  clMap: MapMin,
  readCount: number,
  alphabetSize: number,
): MapMin {
  const state = bs.save();
  try {
    const codes = new Array<number>(alphabetSize).fill(0);

    let stagedCode = 0;
    let codeCount = 0;
    for (let i = 0; i < readCount; i++) {
      if (!codeCount) {
        const code = readSymbolWithMapMin(bs, clMap);
        if (code === undefined) {
          throw new Error("invalid code");
        }

        if (code <= 15) {
          stagedCode = code;
          codeCount = 1;
        } else if (code == 16) {
          codeCount = bs.readNumber(2) + 3;
        } else if (code == 17) {
          stagedCode = 0;
          codeCount = bs.readNumber(3) + 3;
        } else if (code == 18) {
          stagedCode = 0;
          codeCount = bs.readNumber(7) + 11;
        } else {
          throw new Error("invalid code");
        }
      }

      codeCount -= 1;
      codes[i] = stagedCode;
    }

    return buildCodeMap(getCanonicalCodes(codes));
  } catch (e) {
    if (e instanceof UnexpectedEndOfStream) {
      bs.restore(state);
    }

    throw e;
  }
}

export function readLiteralLengthAlphabet(
  bs: BitStream,
  clMap: MapMin,
  hlit: number,
) {
  return readAlphabetWithCLMap(bs, clMap, hlit + 257, 286);
}

export function readDistanceAlphabet(
  bs: BitStream,
  clMap: MapMin,
  hdist: number,
) {
  return readAlphabetWithCLMap(bs, clMap, hdist + 1, 30);
}
