import { Readable, Transform } from "stream";

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

export function createPacketReader(fn: (packet: Buffer) => any): Transform {
  if (typeof fn !== 'function') {
    throw new TypeError(`Invalid arguement "reader". Expected type "function", got "${typeof fn}"`);
  }
  let underflow: Buffer;
  return new Transform({
    async transform(this: Transform, buffer: Buffer, encoding: string, next: (err?: Error) => void) {
      if (underflow) {
        buffer = Buffer.concat([underflow, buffer]);
        underflow = undefined;
      }
      try {
        const iterator = createPacketIterator(buffer, false, true);
        let result: IteratorResult<Buffer>;
        do {
          // Force async iteration
          result = await iterator.next();
          if (result.value) {
            if (result.done) {
              underflow = result.value;
            } else {
              fn.call(void 0, result.value);
            }
          }
        } while (!result.done);
        this.push(underflow ? buffer.slice(0, -(underflow.length)) : buffer);
        next();
      } catch (error) {
        next(error);
      }
    },
    final(this: Transform, next: (err?: Error) => void) {
      let error: IError;
      if (underflow) {
        const length = readPacketLength(underflow);
        const missing = length - underflow.length;
        error = new Error(`Incomplete packet missing ${missing} bytes (${length})`);
        error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
      }
      next(error);
    },
  });
}

/**
 * Reads next packet length after `offset`.
 * @param buffer Packet buffer
 * @param offset Start offset
 */
export function readPacketLength(buffer: Buffer, offset: number = 0) {
  if (buffer.length - offset < 4) {
    return -1;
  }
  const input = buffer.toString('utf8', offset, offset + 4);
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
  buffers?: Buffer[],
  splitBufferAtIndex: number = -1,
  offset?: number,
): Buffer {
  if (!buffers || !buffers.length) {
    return Buffer.alloc(0);
  }
  buffers = buffers.slice();
  if (splitBufferAtIndex >= 0 && splitBufferAtIndex < buffers.length) {
    const buffer = buffers[splitBufferAtIndex];
    const _offset = findNextZeroPacketInBuffer(buffer, offset);
    if (_offset >= 0) {
      buffers[splitBufferAtIndex] = buffer.slice(0, _offset - 1);
      buffers.push(buffer.slice(_offset - 1));
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
  buffer: Buffer,
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
  buffer: Buffer,
  breakOnZeroLength: boolean = false,
  breakOnIncompletePacket: boolean = false,
): IterableIterator<Buffer> {
  if (!buffer.length) {
    return;
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
      if (offset + length <= buffer.length) {
        yield buffer.slice(offset, offset + length);
        offset += length;
      } else {
        if (breakOnIncompletePacket) {
          return buffer.slice(offset);
        } else {
          const error: IError = new Error(
            `Incomplete packet ending at position ${offset + length} in buffer (${buffer.length})`,
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
