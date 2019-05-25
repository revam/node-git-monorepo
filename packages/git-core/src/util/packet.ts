import { ErrorCodes } from "../enum";
import { makeError } from "../main.private";
import { concat, decode, encode } from "./buffer";
import { ExtendedError } from "../main";

export type PacketReaderFunction = (packet: Uint8Array) => any;

export const enum PacketType {
  Message = "\u0002",
  Error = "\u0003",
}

/**
 * Encode packet of type `type`.
 *
 * @remarks
 *
 * If the message do not end with a new-line (LN), a new-line (LN) will be
 * added to the message.
 *
 * @param message - Source message to encode.
 * @param type - {@link PacketType | Packet type} to encode.
 */
export function encodePacket(message: string, type: PacketType): Uint8Array {
  message = type + message;
  if (!message.endsWith("\n")) {
    message += "\n";
  }
  return encodeRawPacket(message);
}

/**
 * Encode a packet without modifying the source message.
 *
 * @param message - Source message to encode.
 */
export function encodeRawPacket(message: string): Uint8Array {
  return encode((message.length + 4).toString(16).padStart(4, "0") + message);
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
  iterable: IterableIterator<Uint8Array> | AsyncIterableIterator<Uint8Array>,
  reader: (array: Uint8Array) => (void | never) | Promise<void | never> | PromiseLike<void | never>,
): AsyncIterableIterator<Uint8Array> {
  //#region init
  const backhaul: Uint8Array[] = [];
  let previousValue: [number, Uint8Array] | undefined;
  let parsingDone = false;
  let result: IteratorResult<Uint8Array>;
  do {
    result = await iterable.next();
    // Only parse if value is given and has a length greater than zero.
    if (result.value && result.value.length > 0) {
      backhaul.push(result.value);
      let buffer = result.value;
      // Combine current array with previous array if needed.
      if (previousValue) {
        buffer = concat([previousValue[1], result.value]);
        previousValue = undefined;
      }
      const packets = createPacketIterator(buffer, true, true);
      let packetResult: IteratorResult<Uint8Array>;
      do {
        packetResult = packets.next();
        if (packetResult.value) {
          if (packetResult.done) {
            const length = readPacketLength(packetResult.value);
            if (length === 0) {
              parsingDone = true;
            }
            else {
              previousValue = [length, packetResult.value];
            }
          }
          else {
            await reader(packetResult.value);
          }
        }
      } while (!packetResult.done);
    }
    // We're done parsing if `iterable` is done.
    if (!parsingDone && result.done) {
      parsingDone = true;
    }
  } while (!parsingDone);
  // Throw if done parsing and array is still defined.
  if (previousValue) {
    throw invalidEndPosition(previousValue[0], previousValue[1].length);
  }
  // Yield an empty array here. Because the Context constructor need to parse
  // the packets before it is fully initialised, and thus started the iterator.
  //
  // It is essentially a throw-away value.
  yield new Uint8Array(0);
  //#endregion init
  if (backhaul.length) {
    yield* backhaul;
  }
  if (!result.done) {
    yield* iterable;
  }
}

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
  const input = decode(buffer.slice(offset, offset + 4));
  if (!/^[0-9a-f]{4}$/.test(input)) {
    return -1;
  }
  return Number.parseInt(input, 16);
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
      }
      else {
        // Break if packet length exceeds rest of available buffer.
        if (breakOnIncompletePacket) {
          return buffer.slice(offset);
        }
        throw invalidEndPosition(packetEnd, buffer.length);
      }
    }
    else {
      throw invalidStartPosition(offset, buffer.length);
    }
  } while (offset < buffer.length);
}

function invalidEndPosition(end: number, length: number): ExtendedError {
  return makeError(
    `Invalid packet ending position at index ${end} in buffer with length ${length}.`,
    ErrorCodes.InvalidPacket,
  );
}

function invalidStartPosition(start: number, length: number): ExtendedError {
  return makeError(
    `Invalid packet starting position at index ${start} in buffer with length ${length}.`,
    ErrorCodes.InvalidPacket,
  );
}
