/// <reference types="node" />
import { Transform } from "stream";
/**
 * Error codes thrown by this package.
 */
export declare enum ErrorCodes {
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
export declare function createPacketReader(fn: (packet: Buffer) => any): Transform;
/**
 * Reads next packet length after `offset`.
 * @param buffer Packet buffer
 * @param offset Start offset
 */
export declare function readPacketLength(buffer: Buffer, offset?: number): number;
/**
 * Concats packet buffers. Can split the buffer at desired index,
 * inserting the rest buffers inbetween the split chunks.
 * @param buffers Buffers to concat
 * @param splitBufferAtIndex Index of buffer to split
 */
export declare function concatPacketBuffers(buffers?: Buffer[], splitBufferAtIndex?: number, offset?: number): Buffer;
/**
 * Iterates all packets in a single buffer.
 * @throws {IError}
 */
export declare function createPacketIterator(buffer: Buffer, breakOnZeroLength?: boolean, breakOnIncompletePacket?: boolean): IterableIterator<Buffer>;
export interface IError extends Error {
    code?: string;
}
