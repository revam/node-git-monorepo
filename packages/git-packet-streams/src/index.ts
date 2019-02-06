import { Readable, Transform } from "stream";
import { TextDecoder } from "util";

export type PacketReaderFunction = (packet: Uint8Array) => any;

/**
 * Error codes thrown by this package.
 */
export enum ErrorCodes {
  /**
   * Packet starting position is invalid.
   */
  ERR_INVALID_PACKET = "ERR_INVALID_PACKET_START",
  /**
   * An incomplete packet exceeds the rest of available buffer.
   */
  ERR_INCOMPLETE_PACKET = "ERR_INCOMPLETE_PACKET",
  /**
   * An argument of the wrong type was passed to the function. (Same as Node.js API)
   */
  ERR_INVALID_ARG_TYPE = "ERR_INVALID_ARG_TYPE",
}

/**
 * @deprecated Use the PacketReader class instead.
 */
export function createPacketReader(fn?: PacketReaderFunction): Transform {
  if (fn !== undefined && typeof fn !== "function") {
    throw new TypeError(`Invalid arguement "fn". Expected type "function", got "${typeof fn}"`);
  }
  return new PacketReader(fn);
}

export class PacketReader extends Transform {
  private done = false;
  private underflow?: Uint8Array;

  public constructor(fn?: PacketReaderFunction, done?: () => any) {
    super();
    if (typeof fn === "function") {
      this.on("packet-read", fn);
    }
    if (typeof done === "function") {
      this.once("packet-done", done);
    }
  }

  public async _transform(buffer: Buffer, _, next: (error?: any) => void): Promise<void> {
    if (this.done) {
      this.push(buffer);
      return next();
    }
    let iterableBuffer: Uint8Array;
    if (this.underflow) {
      iterableBuffer = Buffer.concat([this.underflow, buffer]);
      this.underflow = undefined;
    } else {
      iterableBuffer = buffer;
    }
    try {
      const iterator = createPacketIterator(iterableBuffer, true, true);
      let result: IteratorResult<Uint8Array>;
      do {
        result = iterator.next();
        if (result.value) {
          if (result.done) {
            const length = readPacketLength(result.value);
            if (length === 0) {
              this.done = true;
              this.emit("packet-done");
            } else {
              this.underflow = result.value;
            }
          } else {
            this.emit("packet-read", result.value);
          }
        }
      } while (!result.done);
      this.push(buffer);
      next();
    } catch (error) {
      next(error);
    }
  }

  public _final(next: (error?: any) => void) {
    let error: IError | undefined;
    if (this.underflow) {
      const length = readPacketLength(this.underflow);
      const missing = length - this.underflow.length;
      error = new Error(`Incomplete packet missing ${missing} bytes (${length})`);
      error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
    }
    if (!this.done) {
      this.done = true;
      this.emit("packet-done");
    }
    next(error);
  }
}

export interface PacketReader {
  addListener(event: string, listener: (...args: any[]) => void): this;
  addListener(event: "close", listener: () => void): this;
  addListener(event: "data", listener: (chunk: Buffer | string) => void): this;
  addListener(event: "drain", listener: () => void): this;
  addListener(event: "end", listener: () => void): this;
  addListener(event: "error", listener: (err: Error) => void): this;
  addListener(event: "finish", listener: () => void): this;
  addListener(event: "pipe", listener: (src: Readable) => void): this;
  addListener(event: "unpipe", listener: (src: Readable) => void): this;
  addListener(event: "close", listener: (...args: any[]) => void): this;
  addListener(event: "packet-read", listener: PacketReaderFunction): this;
  addListener(event: "packet-done", listener: () => void): this;

  emit(event: string | symbol, ...args: any[]): boolean;
  emit(event: "close"): boolean;
  emit(event: "data", chunk: Buffer | string): boolean;
  emit(event: "drain"): boolean;
  emit(event: "end"): boolean;
  emit(event: "error", err: Error): boolean;
  emit(event: "finish"): boolean;
  emit(event: "pipe", src: Readable): boolean;
  emit(event: "unpipe", src: Readable): boolean;
  emit(event: "packet-read", packet: Buffer): boolean;
  emit(event: "packet-done"): boolean;

  on(event: string, listener: (...args: any[]) => void): this;
  on(event: "close", listener: () => void): this;
  on(event: "data", listener: (chunk: Buffer | string) => void): this;
  on(event: "drain", listener: () => void): this;
  on(event: "end", listener: () => void): this;
  on(event: "error", listener: (err: Error) => void): this;
  on(event: "finish", listener: () => void): this;
  on(event: "pipe", listener: (src: Readable) => void): this;
  on(event: "unpipe", listener: (src: Readable) => void): this;
  on(event: "close", listener: (...args: any[]) => void): this;
  on(event: "packet-read", listener: PacketReaderFunction): this;
  on(event: "packet-done", listener: () => void): this;

  once(event: string, listener: (...args: any[]) => void): this;
  once(event: "close", listener: () => void): this;
  once(event: "data", listener: (chunk: Buffer | string) => void): this;
  once(event: "drain", listener: () => void): this;
  once(event: "end", listener: () => void): this;
  once(event: "error", listener: (err: Error) => void): this;
  once(event: "finish", listener: () => void): this;
  once(event: "pipe", listener: (src: Readable) => void): this;
  once(event: "unpipe", listener: (src: Readable) => void): this;
  once(event: "close", listener: (...args: any[]) => void): this;
  once(event: "packet-read", listener: PacketReaderFunction): this;
  once(event: "packet-done", listener: () => void): this;

  prependListener(event: string, listener: (...args: any[]) => void): this;
  prependListener(event: "close", listener: () => void): this;
  prependListener(event: "data", listener: (chunk: Buffer | string) => void): this;
  prependListener(event: "drain", listener: () => void): this;
  prependListener(event: "end", listener: () => void): this;
  prependListener(event: "error", listener: (err: Error) => void): this;
  prependListener(event: "finish", listener: () => void): this;
  prependListener(event: "pipe", listener: (src: Readable) => void): this;
  prependListener(event: "unpipe", listener: (src: Readable) => void): this;
  prependListener(event: "close", listener: (...args: any[]) => void): this;
  prependListener(event: "packet-read", listener: PacketReaderFunction): this;
  prependListener(event: "packet-done", listener: () => void): this;

  prependOnceListener(event: string, listener: (...args: any[]) => void): this;
  prependOnceListener(event: "close", listener: () => void): this;
  prependOnceListener(event: "data", listener: (chunk: Buffer | string) => void): this;
  prependOnceListener(event: "drain", listener: () => void): this;
  prependOnceListener(event: "end", listener: () => void): this;
  prependOnceListener(event: "error", listener: (err: Error) => void): this;
  prependOnceListener(event: "finish", listener: () => void): this;
  prependOnceListener(event: "pipe", listener: (src: Readable) => void): this;
  prependOnceListener(event: "unpipe", listener: (src: Readable) => void): this;
  prependOnceListener(event: "close", listener: (...args: any[]) => void): this;
  prependOnceListener(event: "packet-read", listener: PacketReaderFunction): this;
  prependOnceListener(event: "packet-done", listener: () => void): this;
}

const DECODER = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });
/**
 * Reads next packet length after `offset`.
 * @param buffer Packet buffer
 * @param offset Start offset
 */
export function readPacketLength(buffer: Uint8Array, offset: number = 0) {
  if (buffer.length - offset < 4) {
    return -1;
  }
  const input = DECODER.decode(buffer.slice(offset, offset + 4));
  if (!/^[0-9a-f]{4}$/.test(input)) {
    return -1;
  }
  return Number.parseInt(input, 16);
}

/**
 * Concats packet buffers. Can split the buffer at desired index,
 * inserting the rest buffers inbetween the split chunks.
 * @param buffers Buffers to concat
 * @param splitBufferAtIndex Index of buffer to split
 */
export function concatPacketBuffers(
  buffers?: Uint8Array[],
  splitBufferAtIndex: number = -1,
  offset?: number,
): Uint8Array {
  if (!buffers || !buffers.length) {
    return new Uint8Array(0);
  }
  buffers = buffers.slice();
  if (splitBufferAtIndex >= 0 && splitBufferAtIndex < buffers.length) {
    const buffer = buffers[splitBufferAtIndex];
    const _offset = findNextZeroPacketInBuffer(buffer, offset);
    if (_offset >= 0) {
      buffers[splitBufferAtIndex] = buffer.slice(0, _offset);
      buffers.push(buffer.slice(_offset));
    }
  }
  return Buffer.concat(buffers, buffers.reduce((p, c) => p + c.length, 0));
}

/**
 * Returns the first position of a zero packet after offset.
 * @param buffer A valid packet buffer
 * @param offset A valid packet start position
 * @throws {IError}
 */
function findNextZeroPacketInBuffer(
  buffer: Uint8Array,
  offset: number = 0,
): number {
  if (!buffer || !buffer.length) {
    return -1;
  }
  do {
    const length = readPacketLength(buffer, offset);
    if (length === 0) {
      return offset;
      // All packet lengths less than 4, except 0, are invalid.
    } else if (length > 3) {
      if (offset + length <= buffer.length) {
        offset += length;
      } else {
        const error: IError = new Error(
          `Incomplete packet ending at position ${offset + length} in buffer (${buffer.length})`,
        );
        error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
        throw error;
      }
    } else {
      const error: IError = new Error(
        `Invalid packet starting at position ${offset} in buffer (${buffer.length})`,
      );
      error.code = ErrorCodes.ERR_INVALID_PACKET;
      throw error;
    }
  } while (offset < buffer.length);
  return -1;
}

/**
 * Iterates all packets in a single buffer.
 * @throws {IError}
 */
export function *createPacketIterator(
  buffer: Uint8Array,
  breakOnZeroLength: boolean = false,
  breakOnIncompletePacket: boolean = false,
): IterableIterator<Uint8Array> {
  if (!buffer.length) {
    return undefined;
  }
  let offset = 0;
  do {
    let length = readPacketLength(buffer, offset);
    if (length === 0) {
      if (breakOnZeroLength) {
        return buffer.slice(offset);
      }
      length = 4;
    }
    // All packet lengths less than 4, except 0, are invalid.
    if (length > 3) {
      const packetEnd = offset + length;
      if (packetEnd <= buffer.length) {
        yield buffer.slice(offset, packetEnd);
        offset += length;
      } else {
        if (breakOnIncompletePacket) {
          return buffer.slice(offset);
        } else {
          const error: IError = new Error(
            `Incomplete packet ending at position ${packetEnd} in buffer (${buffer.length})`,
          );
          error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
          throw error;
        }
      }
    } else {
      const error: IError = new Error(
        `Invalid packet starting at position ${offset} in buffer (${buffer.length})`,
      );
      error.code = ErrorCodes.ERR_INVALID_PACKET;
      throw error;
    }
  } while (offset < buffer.length);
}

export interface IError extends Error {
  code?: string;
}
