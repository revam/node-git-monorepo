import { ErrorCodes } from "./enum";
import { IError } from "./main";
import * as lib from "./packet-util";

// an incomplete packet
const incompletePacket = lib.encodeString("0018an incompl-");
// an invalid packet
const invalidPacket = lib.encodeString("an invalid packet");

describe("readPacketLength", () => {
  it("should read the first four bytes of buffer by default", (done) => {
    const length = lib.readPacketLength(incompletePacket);
    expect(length).toBe(24);
    done();
  });

  it("should read the first four bytes after offset if supplied", (done) => {
    const length = lib.readPacketLength(lib.encodeString("skip0000"), 4);
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

describe("createPacketIterator", () => {

  it("should return an iterator", (done) => {
    const packets = lib.encodeString("0007abc00000007def");
    const iterator = lib.createPacketIterator(packets);
    expect(Symbol.iterator in iterator).toBe(true);
    done();
  });

  it("should yield packets from provided buffer", async(resolve) => {
    const packets = lib.encodeString("0007abc00000007def");
    const results = [
      lib.encodeString("0007abc"),
      lib.encodeString("0000"),
      lib.encodeString("0007def"),
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
    const packets = lib.encodeString("0007abc00000007def");
    const results = [
      lib.encodeString("0007abc"),
      lib.encodeString("00000007def"),
    ];
    const iterator = lib.createPacketIterator(packets, true);
    for (const result of results) {
      const {value, done} = iterator.next();
      expect(done).toBe(result.length > 7 ? true : false);
      expect(value).toEqual(result);
    }
    resolve();
  });

  it("should throw if it reads an invalid packet", (done) => {
    let error: IError | undefined;
    try {
      const iterator = lib.createPacketIterator(invalidPacket);
      iterator.next();
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.ERR_INVALID_PACKET);
    }
    done();
  });

  it("should throw if it reads an incomplete packet", (done) => {
    let error: IError | undefined;
    try {
      const iterator = lib.createPacketIterator(incompletePacket);
      iterator.next();
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.ERR_INCOMPLETE_PACKET);
    }
    done();
  });
});
