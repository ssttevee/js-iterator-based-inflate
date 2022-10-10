import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import {
  fixed,
  getCanonicalCodes,
  readCodeWithAdditionalBits,
  readDistance,
  readLiteralOrLength,
} from "./coding.ts";
import { BitStream } from "./bitstream.ts";

Deno.test("getCanonicalCodes", () => {
  assertEquals(
    getCanonicalCodes([3, 3, 3, 3, 3, 2, 4, 4]),
    [
      {},
      {},
      { 0: 5 },
      { 2: 0, 3: 1, 4: 2, 5: 3, 6: 4 },
      { 14: 6, 15: 7 },
    ],
  );
});

Deno.test("readCodeWithAdditionalBits", async (t) => {
  const zeroes = new Uint8Array([0b00000000, 0b00000000]);
  await t.step("distance coding", () => {
    // deno-fmt-ignore
    const expectedValues = [ 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 ];

    for (const [i, expectedValue] of expectedValues.entries()) {
      assertEquals(
        readCodeWithAdditionalBits(new BitStream(zeroes), i, 2, 1),
        expectedValue,
      );
    }
  });

  await t.step("length coding", () => {
    // deno-fmt-ignore
    const expectedValues = [ 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227 ];

    for (const [i, expectedValue] of expectedValues.entries()) {
      assertEquals(
        readCodeWithAdditionalBits(new BitStream(zeroes), i, 4, 3),
        expectedValue,
      );
    }
  });
});

Deno.test("readLiteralLength", async (t) => {
  await t.step("fixed", () => {
    for (
      const [input, expected] of [
        [[0], 256],
        [[0b01110100], 279],
        [[0b00001100], 0],
        [[0b11111101], 143],
        [[0b00000011], 280],
        [[0b11100011], 287],
        [[0b00010011, 0b00000000], 144],
        [[0b11111111, 0b00000001], 255],
      ] as Array<[number[], number]>
    ) {
      assertEquals(
        readLiteralOrLength(new BitStream(new Uint8Array(input)), fixed.ll),
        expected,
      );
    }
  });

  // TODO test with arbitrary coding
});

Deno.test("readDistance", async (t) => {
  await t.step("fixed", () => {
    for (
      const [input, expected] of [
        [[0b00000000], 1],
        [[0b00000100], 5],
        [[0b11110100], 8],
        [[0b00001100], 9],
        [[0b11111100], 16],
        [[0b00000010], 17],
        [[0b11110010], 32],
        [[0b00001010, 0x00], 33],
        [[0b11111010, 0xFF], 64],
        [[0b00000110, 0x00], 65],
        [[0b11110110, 0xFF], 128],
        [[0b00001110, 0x00], 129],
        [[0b11111110, 0xFF], 256],
        [[0b00000001, 0x00], 257],
        [[0b11110001, 0xFF], 512],
        [[0b00001001, 0x00], 513],
        [[0b11111001, 0xFF], 1024],
        [[0b00000101, 0x00], 1025],
        [[0b11110101, 0xFF], 2048],
        [[0b00001101, 0x00], 2049],
        [[0b11111101, 0xFF], 4096],
        [[0b00000011, 0x00], 4097],
        [[0b11110011, 0xFF], 8192],
        [[0b00001011, 0x00, 0x00], 8193],
        [[0b11111011, 0xFF, 0xFF], 16384],
        [[0b00000111, 0x00, 0x00], 16385],
        [[0b11110111, 0xFF, 0xFF], 32768],
      ] as Array<[number[], number]>
    ) {
      assertEquals(
        readDistance(new BitStream(new Uint8Array(input)), fixed.dist),
        expected,
      );
    }
  });

  // TODO test with arbitrary coding
});
