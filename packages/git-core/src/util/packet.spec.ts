import { ErrorCodes } from "../enum";
import { ExtendedError } from "../main";
import { compare, encode } from "./buffer";
import * as lib from "./packet";

// an incomplete packet
const incompletePacket = encode("0018an incompl-");
// an invalid packet
const invalidPacket = encode("an invalid packet");

describe("function encodePacket()", () => {
  test("Encode some packets", () => {
    const sources: Array<[lib.PacketType, string]> = [
      [lib.PacketType.Message, "Some encoded message"],
      [lib.PacketType.Error, "Some encoded error"],
    ];
    // Manually encoded packets, with the "right" algorithm.
    const results = [
      // "001A\x02Some encoded message\n"
      new Uint8Array([
        48,
        48,
        49,
        97,
        2,
        83,
        111,
        109,
        101,
        32,
        101,
        110,
        99,
        111,
        100,
        101,
        100,
        32,
        109,
        101,
        115,
        115,
        97,
        103,
        101,
        10,
      ]),
      // "0018\x03Some encoded error\n"
      new Uint8Array([
        48,
        48,
        49,
        56,
        3,
        83,
        111,
        109,
        101,
        32,
        101,
        110,
        99,
        111,
        100,
        101,
        100,
        32,
        101,
        114,
        114,
        111,
        114,
        10,
      ]),
    ];
    for (let i = 0; i > sources.length; i += 1) {
      const [type, source] = sources[i];
      const result = results[i];
      const packed = lib.encodePacket(type, source);
      expect(compare(packed, result)).toBe(true);
    }
  });
});

describe("function readPacketLength()", () => {
  it("should read the first four bytes of buffer by default", (done) => {
    const length = lib.readPacketLength(incompletePacket);
    expect(length).toBe(24);
    done();
  });

  it("should read the first four bytes after offset if supplied", (done) => {
    const length = lib.readPacketLength(encode("skip0000"), 4);
    expect(length).toBe(0);
    done();
  });

  it("should return -1 when it cannot determine length of packet", (done) => {
    let length = lib.readPacketLength(invalidPacket);
    expect(length).toBe(-1);
    length = lib.readPacketLength(incompletePacket.slice(0, 3));
    expect(length).toBe(-1);
    done();
  });
});

describe("function createPacketIterator()", () => {

  it("should return an iterator", (done) => {
    const packets = encode("0007abc00000007def");
    const iterator = lib.createPacketIterator(packets);
    expect(Symbol.iterator in iterator).toBe(true);
    done();
  });

  it("should yield packets from provided buffer", async(resolve) => {
    const packets = encode("0007abc00000007def");
    const results = [
      encode("0007abc"),
      encode("0000"),
      encode("0007def"),
    ];
    const iterator = lib.createPacketIterator(packets);
    for (const result of results) {
      const {value, done} = iterator.next();
      expect(done).toBe(false);
      expect(value).toEqual(result);
    }
    const output = iterator.next();
    expect(output.value).toBeUndefined();
    expect(output.done).toBe(true);
    resolve();
  });

  it("should break at zero length if second argument is true", (resolve) => {
    const packets = encode("0007abc00000007def");
    const results = [
      encode("0007abc"),
      encode("00000007def"),
    ];
    const iterator = lib.createPacketIterator(packets, true);
    for (const result of results) {
      const {value, done} = iterator.next();
      expect(done).toBe(result.length > 7 ? true : false);
      expect(value).toEqual(result);
    }
    resolve();
  });

  it("should throw if it reads a packet with an invalid start position", (done) => {
    let error: ExtendedError | undefined;
    try {
      const iterator = lib.createPacketIterator(invalidPacket);
      iterator.next();
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.InvalidPacket);
    }
    done();
  });

  it("should throw if it reads a packet with an invalid end position", (done) => {
    let error: ExtendedError | undefined;
    try {
      const iterator = lib.createPacketIterator(incompletePacket);
      iterator.next();
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.InvalidPacket);
    }
    done();
  });
});
