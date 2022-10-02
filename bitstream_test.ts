import {
  assertEquals,
  fail,
} from "https://deno.land/std@0.158.0/testing/asserts.ts";
import { BitStream, outofdata } from "./bitstream.ts";

Deno.test("bitstream", async (t) => {
  const payload = new Uint8Array([0b01110011, 0b01010101]);

  await t.step("constructor", () => {
    const bs = new BitStream(payload);

    assertEquals(bs._buf.length, 2);
    assertEquals(bs._bitOffset, 8);
    assertEquals(bs._currentByte, 0);
  });

  await t.step("readBits", () => {
    const bs = new BitStream(payload);

    assertEquals(bs.readBits(3), 0b110);

    assertEquals(bs._buf.length, 1);
    assertEquals(bs._bitOffset, 3);
    assertEquals(bs._currentByte, payload[0]);

    assertEquals(bs.readBits(1), 0b0);

    assertEquals(bs._buf.length, 1);
    assertEquals(bs._bitOffset, 4);
    assertEquals(bs._currentByte, payload[0]);

    assertEquals(bs.readBits(2), 0b11);

    assertEquals(bs._buf.length, 1);
    assertEquals(bs._bitOffset, 6);
    assertEquals(bs._currentByte, payload[0]);

    assertEquals(bs.readBits(1), 0b1);

    assertEquals(bs._buf.length, 1);
    assertEquals(bs._bitOffset, 7);
    assertEquals(bs._currentByte, payload[0]);

    assertEquals(bs.readBits(9), 0b010101010);

    assertEquals(bs._buf.length, 0);
    assertEquals(bs._bitOffset, 8);
    assertEquals(bs._currentByte, payload[1]);

    try {
      bs.readBits(1);
      fail("Expected error");
    } catch (e) {
      assertEquals(e, outofdata);
    }
  });

  await t.step("readNumber", () => {
    const bs = new BitStream(payload);

    assertEquals(bs.readNumber(3), 0b011);
  });

  await t.step("readUpToNBytes", async (t) => {
    await t.step("aligned", async (t) => {
      await t.step("full", () => {
        const bs = new BitStream(payload);
        assertEquals(bs.readUpToNBytes(2), payload);
        assertEquals(bs._buf.length, 0);
      });

      await t.step("partial", () => {
        const bs = new BitStream(payload);
        assertEquals(bs.readUpToNBytes(3), payload);
        assertEquals(bs._buf.length, 0);
      });
    });

    await t.step("unaligned", () => {
      const bs = new BitStream(payload);
      assertEquals(bs.readBits(1), 0b1);
      assertEquals(bs._buf.length, 1);
      assertEquals(bs._bitOffset, 1);
      assertEquals(bs.readUpToNBytes(2), new Uint8Array([0b10111001]));
      assertEquals(bs._bitOffset, 1);
      assertEquals(bs._buf.length, 0);
    });

    await t.step("empty", () => {
      const bs = new BitStream();
      try {
        bs.readUpToNBytes(1);
        fail("Expected error");
      } catch (e) {
        assertEquals(e, outofdata);
      }
    });
  });

  await t.step("alignToByte", () => {
    const bs = new BitStream(payload);
    assertEquals(bs.readBits(1), 0b1);
    assertEquals(bs._buf.length, 1);
    assertEquals(bs._bitOffset, 1);
    bs.alignToByte();
    assertEquals(bs._bitOffset, 8);
  });

  await t.step("push", () => {
    const bs = new BitStream();
    assertEquals(bs._buf.length, 0);
    bs.push(payload);
    assertEquals(bs._buf, payload);
  });
});
