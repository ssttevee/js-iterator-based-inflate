import { assertEquals } from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { readCodeWithAdditionalBits } from "./coding.ts";
import { BitStream } from "./bitstream.ts";

Deno.test("readCodeWithOffset", async (t) => {
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
