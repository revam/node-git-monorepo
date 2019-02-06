import { ok } from "assert";
import { PassThrough, Readable } from "stream";
import {
  concatPacketBuffers,
  createPacketIterator,
  createPacketReader,
  ErrorCodes,
  IError,
  PacketReader,
  readPacketLength,
} from "../src";

// an incomplete packet
const incompletePacket = Buffer.from("0018an incompl-");
// an invalid packet
const invalidPacket = Buffer.from("an invalid packet");

function expectBuffersToMatch(actual: Uint8Array, expected: Uint8Array) {
  expect(new Uint8Array(actual)).toEqual(new Uint8Array(expected));
  // ok(expected.equals(actual), "Actual value of buffer does not match expected result");
}

describe("concatPacketBuffers", () => {

  it("should return an empty buffer when receiving no arguments", (done) => {
    const actual = concatPacketBuffers();
    expectBuffersToMatch(actual, Buffer.alloc(0));
    done();
  });

  it("should return an empty buffer when receiving an empty array", (done) => {
    const actual = concatPacketBuffers([]);
    expectBuffersToMatch(actual, Buffer.alloc(0));
    done();
  });

  it("should only concat buffers not receiving a second argument", (done) => {
    const packets = [
      Buffer.from("0007abc0000"),
      Buffer.from("0007def"),
    ];
    const result = Buffer.from("0007abc00000007def");
    const actual = concatPacketBuffers(packets);
    expectBuffersToMatch(actual, result);
    done();
  });

  it("should split desired buffer indicated by the second argument if valid.", (done) => {
    const packets = [
      Buffer.from("0007abc0000"),
      Buffer.from("0007def"),
    ];
    const result = Buffer.from("0007abc0007def0000");
    const actual = concatPacketBuffers(packets, 0);
    expectBuffersToMatch(actual, result);
    done();
  });

  it("should throw if it tries to split an invalid packet", (done) => {
    let error: IError | undefined;
    try {
      concatPacketBuffers([invalidPacket], 0);
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.ERR_INVALID_PACKET);
    }
    done();
  });

  it("should throw if it tries to split an incomplete packet", (done) => {
    let error: IError | undefined;
    try {
      concatPacketBuffers([incompletePacket], 0);
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.ERR_INCOMPLETE_PACKET);
    }
    done();
  });
});

describe("readPacketLength", () => {
  it("should read the first four bytes of buffer by default", (done) => {
    const length = readPacketLength(incompletePacket);
    expect(length).toBe(24);
    done();
  });

  it("should read the first four bytes after offset if supplied", (done) => {
    const length = readPacketLength(Buffer.from("skip0000"), 4);
    expect(length).toBe(0);
    done();
  });

  it("should return -1 when it cannot determine length of packet", (done) => {
    let length = readPacketLength(invalidPacket);
    expect(length).toBe(-1);
    length = readPacketLength(incompletePacket.slice(0, 3));
    expect(length).toBe(-1);
    done();
  });
});

describe("createPacketReader", () => {
  /**
   * It should return an instance of PacketReader
   */
  it("should return an instance of PacketReader", (done) => {
    const noop = () => void 0;
    // tslint:disable-next-line:deprecation
    const instance = createPacketReader(noop);
    expect(instance).toBeInstanceOf(PacketReader);
    done();
  });
});

describe("PacketReader", () => {
  /**
   * It should read out all packets to the supplied handler
   */
  it("should read all packets to supplied handler", async(done) => {
    const source = [
      Buffer.from("0007abc00000007def"),
      Buffer.from("0007ghi"),
    ];
    const results = [
      Buffer.from("0007abc"),
      Buffer.from("0000"),
      Buffer.from("0007def"),
      Buffer.from("0007ghi"),
    ];
    const error = await waitForErrorOrFinish(source, (b) => expectBuffersToMatch(b, results.shift()!));
    expect(error).toBeUndefined();
    done();
  });

  it("should seamlessly combine multi-chunked packets", async(done) => {
    const source = [
      Buffer.from("0008te"),
      Buffer.from("st"),
      Buffer.from("000a"),
      Buffer.from("pac"),
      Buffer.from("ket"),
    ];
    const results = [
      Buffer.from("0008test"),
      Buffer.from("000apacket"),
    ];
    const error = await waitForErrorOrFinish(source, (b) => expectBuffersToMatch(b, results.shift()!));
    expect(error).toBeUndefined();
    done();
  });

  it("should throw if it reads an invalid packet", async(done) => {
    const error = await waitForErrorOrFinish([invalidPacket]);
    expect(error && error.code).toMatch(ErrorCodes.ERR_INVALID_PACKET);
    done();
  });

  it("should throw if it reads an incomplete packet", async(done) => {
    const error = await waitForErrorOrFinish([incompletePacket]);
    expect(error && error.code).toMatch(ErrorCodes.ERR_INCOMPLETE_PACKET);
    done();
  });

  it("should emit the 'packet-done' event even if it still receives input", (done) => {
    const pt = new PassThrough();
    const pr = new PacketReader();
    pt.write("000ca packet00000023another packet, but is not readPACK...data...");
    // we should only read a single packet from the above data.
    const results = [
      "000ca packet",
    ];
    let int = 0;
    pr.on("error", (error) => {
      done.fail(error);
    });
    pr.on("packet-read", (packet) => {
      if (int >= results.length) {
        done.fail("read more packets then needed");
      } else {
        expect(packet.toString()).toEqual(results[int]);
      }
      int++;
    });
    pr.on("packet-done", () => {
      if (int === 1) {
        done();
      }
    });
    pt.pipe(pr);
  });

  it("should ignore all data transmitted after the first zero-packet", (done) => {
    const pt = new PassThrough();
    const pr = new PacketReader();
    pr.on("error", (error) => done.fail(error));
    pr.on("packet-read", () => done.fail("read more packets then needed"));
    pr.on("packet-done", done);
    pt.end("0000some data not read");
    pt.pipe(pr);
  });
});

describe("createPacketIterator", () => {
  it("should return an iterator", (done) => {
    const packets = Buffer.from("0007abc00000007def");
    const iterator = createPacketIterator(packets);
    expect(Symbol.iterator in iterator).toBe(true);
    done();
  });

  it("should yield packets from provided buffer", async(resolve) => {
    const packets = Buffer.from("0007abc00000007def");
    const results = [
      Buffer.from("0007abc"),
      Buffer.from("0000"),
      Buffer.from("0007def"),
    ];
    const iterator = createPacketIterator(packets);
    for (const result of results) {
      const {value, done} = iterator.next();
      expect(done).toBe(false);
      expectBuffersToMatch(value, result);
    }
    const output = iterator.next();
    expect(output.value).toBeUndefined();
    expect(output.done).toBe(true);
    resolve();
  });

  it("should break at zero length if second argument is true", (resolve) => {
    const packets = Buffer.from("0007abc00000007def");
    const results = [
      Buffer.from("0007abc"),
      Buffer.from("00000007def"),
    ];
    const iterator = createPacketIterator(packets, true);
    for (const result of results) {
      const {value, done} = iterator.next();
      expect(done).toBe(result.length > 7 ? true : false);
      ok(result.equals(value), `Actual value does not match expected result ${result}`);
    }
    resolve();
  });

  it("should throw if it reads an invalid packet", (done) => {
    let error: IError | undefined;
    try {
      const iterator = createPacketIterator(invalidPacket);
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
      const iterator = createPacketIterator(incompletePacket);
      iterator.next();
    } catch (err) {
      error = err;
    } finally {
      expect(error && error.code).toMatch(ErrorCodes.ERR_INCOMPLETE_PACKET);
    }
    done();
  });
});

async function waitForErrorOrFinish(buffers: Buffer[], fn?: (p: Uint8Array) => any): Promise<IError> {
  const iterator = buffers[Symbol.iterator]();
  const output = new Readable({
    read() {
      const {value, done} = iterator.next();
      if (!done) {
        this.push(value);
      } else {
        this.push(null);
      }
    },
  });
  const input = new PacketReader(fn);
  output.pipe(input);
  return Promise.race([
    new Promise<Error>((resolve) => input.once("error", resolve)),
    new Promise<never>((resolve) => input.once("finish", resolve)),
  ]);
}
