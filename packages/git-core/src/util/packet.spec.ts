import { ErrorCodes } from "../enum";
import { ExtendedError } from "../main";
import * as buffer from "./buffer";
import * as lib from "./packet";
import * as assert from "../../test/helpers/assert";

// an incomplete packet
const incompletePacket = buffer.encode("0018an incompl-");
// an invalid packet
const invalidPacket = buffer.encode("an invalid packet");

describe("function encodePacket()", () => {
  test("encode some packets", () => {
    const sources: Array<[lib.PacketType, string]> = [
      [lib.PacketType.Message, "Some encoded message"],
      [lib.PacketType.Message, "Some encoded message\n"],
      [lib.PacketType.Error, "Some encoded error message"],
      [lib.PacketType.Error, "Some encoded error message\n"],
    ];
    // Manually encoded packets, with the "right" algorithm.
    const results = [
      // "001A\x02Some encoded message\n"
      lib.encodeRawPacket("\x02Some encoded message\n"),
      lib.encodeRawPacket("\x02Some encoded message\n"),
      // "0018\x03Some encoded error\n"
      lib.encodeRawPacket("\x03Some encoded error message\n"),
      lib.encodeRawPacket("\x03Some encoded error message\n"),
    ];
    for (let i = 0; i < sources.length; i += 1) {
      const [type, source] = sources[i];
      const result = results[i];
      const packed = lib.encodePacket(source, type);
      expect(buffer.compare(packed, result)).toBe(true);
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
    const length = lib.readPacketLength(buffer.encode("skip0000"), 4);
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
    const packets = buffer.encode("0007abc00000007def");
    const iterator = lib.createPacketIterator(packets);
    expect(Symbol.iterator in iterator).toBe(true);
    done();
  });

  it("should return early if buffer is empty", async () => {
    const packets = new Uint8Array(0);
    const iterator = lib.createPacketIterator(packets);
    // FIXME: Temp. workaround till Mircosoft/TypeScript#11375 lands on master.
    assert.deepStrictEqual(iterator.next(), { done: true, value: undefined });
    // await assert.resolves<IteratorResult<Uint8Array>>(iterator.next(), { done: true, value: undefined })
  });

  it("should yield packets from provided buffer", async(resolve) => {
    const packets = buffer.encode("0007abc00000007def");
    const results = [
      buffer.encode("0007abc"),
      buffer.encode("0000"),
      buffer.encode("0007def"),
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
    const packets = buffer.encode("0007abc00000007def");
    const results = [
      buffer.encode("0007abc"),
      buffer.encode("00000007def"),
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

describe("function readPackets()", () => {
  function noReader(): never {
    throw new Error("Argument `reader` should not be called.");
  }

  test("should return an async iterable iterator", () => {
    const iterator = lib.readPackets(function*() { /**/ }(), noReader);
    if (!(Symbol.asyncIterator in iterator) || iterator[Symbol.asyncIterator]() !== iterator) {
      throw new TypeError("Returned value must be an async iterable iterator");
    }
  });

  test("should always yield an empty value on first iteration", async () => {
    const iterator = lib.readPackets(function*() { /**/ }(), noReader);
    await assert.resolves(iterator.next(), { done: false, value: new Uint8Array(0) });
  });

  test("should read all packets from first argument", async () => {
    const results = [
      "this is a test packet",
      "this is another test packet",
      "this is a third test packet",
    ];
    function *body(): IterableIterator<Uint8Array> {
      yield* results.map(lib.encodeRawPacket);
    }
    function reader(packet: Uint8Array): void | never {
      const decodedPacket = buffer.decode(packet.slice(4));
      const result = results.shift();
      assert.ok(result, "No more results to compare");
      assert.strictEqual(decodedPacket, result);
    }
    const iterator = lib.readPackets(body(), reader);
    await assert.resolves(iterator.next());
  });

  test("should throw if encounter an invalid end position", async () => {
    function *body(): IterableIterator<Uint8Array> {
      // Packet length offset by +1.
      yield buffer.encode("0013want something");
    }
    const iterator = lib.readPackets(body(), noReader);
    await assert.rejectsWithCode(iterator.next(), ErrorCodes.InvalidPacket);
  });

  test("should concat values from `iterable` if packet is split across multiple buffers", async () => {
    function *body(): IterableIterator<Uint8Array> {
      yield buffer.encode("0013wa");
      yield buffer.encode("nt som");
      yield buffer.encode("ething");
      yield buffer.encode("\n");
    }
    function reader(packet: Uint8Array): void | never {
      const decodedPacket = buffer.decode(packet.slice(4));
      const result = "want something\n";
      assert.strictEqual(decodedPacket, result);
    }
    const iterator = lib.readPackets(body(), reader);
    await assert.resolves(iterator.next());
  });

  test("should pipe through all data as it was received", async () => {
    const Values: Uint8Array[] = [
      buffer.encode("0013want something\n0013have something\n0000POST"),
      buffer.encode("Some text that will NEVER be parsed by the iterator."),
      buffer.encode("Some more text, just for some good messure."),
    ];
    const PacketResults: Uint8Array[] = [
      buffer.encode("0013want something\n"),
      buffer.encode("0013have something\n"),
    ];
    function reader(packet: Uint8Array): void {
      const result = PacketResults.shift();
      assert.ok(result, "No more results to compare");
      assert.deepStrictEqual(packet, result);
    }
    const ResultIterator = Values.values();
    const ValueIterator = lib.readPackets(Values.values(), reader);
    // Parse packets.
    await assert.resolves(ValueIterator.next());
    // Compare input with output, should be same instance.
    for await(const value of ValueIterator) {
      const result = ResultIterator.next();
      assert.ok(result.value);
      assert.strictEqual(value, result.value);
    }
  });
});
