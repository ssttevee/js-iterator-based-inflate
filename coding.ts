import { BitStream, outofdata } from "./bitstream.ts";

export function readFixedCodingSymbol(bs: BitStream): number {
  const saved = bs.save();
  try {
    let symbol = bs.readBits(7);
    if (symbol <= 0b0010111) {
      return 256 + symbol;
    }

    symbol = bs.readBits(1, symbol);
    if (symbol <= 0b10111111) {
      return symbol - 48;
    }

    if (symbol <= 0b11000111) {
      return symbol + 88;
    }

    return bs.readBits(1, symbol) - 256;
  } catch (e) {
    if (e === outofdata) {
      bs.restore(saved);
    }

    throw e;
  }
}

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

export function readFixedCodingLength(symbol: number, bs: BitStream): number {
  if (symbol > 284) {
    return 258;
  }

  return readCodeWithAdditionalBits(bs, symbol - 257, 4, 7);
}

export function readFixedCodingDistance(bs: BitStream): number {
  const saved = bs.save();
  try {
    return readCodeWithAdditionalBits(bs, bs.readBits(5), 2, 3);
  } catch (e) {
    if (e === outofdata) {
      bs.restore(saved);
    }

    throw e;
  }
}
