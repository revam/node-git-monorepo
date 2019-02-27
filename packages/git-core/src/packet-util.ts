import { TextDecoder, TextEncoder } from "util";
import { ErrorCodes } from "./enum";
import { IError } from "./main.private";

export type PacketReaderFunction = (packet: Uint8Array) => any;

export enum PacketType {
  Message = "\u0002",
  Error = "\u0003",
}

export function encodeString(source: string): Uint8Array {
  return ENCODER.encode(source);
}

/**
 * Encode packet of type `type`.
 * @param message - Source to encode.
 * @internal
 */
export function encodePacket(type: PacketType, message: string): Uint8Array {
  message = type + message;
  if (!message.endsWith("\n")) {
    message += "\n";
  }
  return ENCODER.encode((message.length + 4).toString(16).padStart(4, "0") + message);
}

/**
 * Prepares packets for `reader` from `iterable`.
 *
 * @remarks
 *
 * `iterable` should iterate packets, either iterable in a buffered array or
 * iterable seperatly.
 *
 * @param iterable - Async packet iterable.
 * @param reader - Packet reader.
 */
export async function *readPackets(
  iterable: AsyncIterableIterator<Uint8Array>,
  reader: (array: Uint8Array) => any,
): AsyncIterableIterator<Uint8Array> {
  //#region init
  const backhaul: Uint8Array[] = [];
  let array: Uint8Array | undefined;
  let done = false;
  do {
    const r = await iterable.next();
    if (r.done) {
      break;
    }
    if (array) {
      r.value = concatBuffers([array, r.value]);
      array = undefined;
    }
    done = r.done;
    const iterator = createPacketIterator(r.value, true, true);
    let result: IteratorResult<Uint8Array>;
    do {
      result = iterator.next();
      if (result.value) {
        if (result.done) {
          const length = readPacketLength(result.value);
          if (length === 0) {
            done = true;
          } else {
            array = result.value;
          }
        } else {
          await reader(result.value);
        }
      }
    } while (!done);
    backhaul.push(r.value);
  } while (array);
  yield new Uint8Array(0);
  //#endregion init
  yield* backhaul;
  if (!done) {
    yield* iterable;
  }
}

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });
/**
 * Reads next packet length after `offset`.
 * @param buffer - Packet buffer
 * @param offset - Start offset
 * @internal
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

export function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const length = buffers.reduce((p, i) => p + i.length, 0);
  const result = new Uint8Array(length);
  buffers.reduce((p, i) => { result.set(i, p); return p + i.length; }, 0);
  return result;
}

/**
 * Concats packet buffers. Can split the buffer at desired index,
 * inserting the rest buffers inbetween the split chunks.
 * @param buffers Buffers to concat
 * @param splitBufferAtIndex Index of buffer to split
 * @internal
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
  return Buffer.concat(buffers);
}

/**
 * Returns the first position of a zero packet after offset.
 * @param buffer A valid packet buffer
 * @param offset A valid packet start position
 * @internal
 */
export function findNextZeroPacketInBuffer(
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
        const error: Partial<IError> = new Error(
          `Incomplete packet ending at position ${offset + length} in buffer (${buffer.length})`,
        );
        error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
        throw error;
      }
    } else {
      const error: Partial<IError> = new Error(
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
 *
 * @internal
 */
export function *createPacketIterator(
  buffer: Uint8Array,
  breakOnZeroLength: boolean = false,
  breakOnIncompletePacket: boolean = false,
): IterableIterator<Uint8Array> {
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
      const packetEnd = offset + length;
      if (packetEnd <= buffer.length) {
        yield buffer.slice(offset, packetEnd);
        offset += length;
      } else {
        if (breakOnIncompletePacket) {
          return buffer.slice(offset);
        } else {
          const error: Partial<IError> = new Error(
            `Incomplete packet ending at position ${packetEnd} in buffer (${buffer.length})`,
          );
          error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
          throw error;
        }
      }
    } else {
      const error: Partial<IError> = new Error(
        `Invalid packet starting at position ${offset} in buffer (${buffer.length})`,
      );
      error.code = ErrorCodes.ERR_INVALID_PACKET;
      throw error;
    }
  } while (offset < buffer.length);
}
