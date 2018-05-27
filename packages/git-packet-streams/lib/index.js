"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const stream_1 = require("stream");
/**
 * Error codes thrown by this package.
 */
var ErrorCodes;
(function (ErrorCodes) {
    /**
     * Packet starting position is invalid.
     */
    ErrorCodes["ERR_INVALID_PACKET"] = "ERR_INVALID_PACKET_START";
    /**
     * An incomplete packet exceeds the rest of available buffer.
     */
    ErrorCodes["ERR_INCOMPLETE_PACKET"] = "ERR_INCOMPLETE_PACKET";
    /**
     * An argument of the wrong type was passed to the function. (Same as Node.js API)
     */
    ErrorCodes["ERR_INVALID_ARG_TYPE"] = "ERR_INVALID_ARG_TYPE";
})(ErrorCodes = exports.ErrorCodes || (exports.ErrorCodes = {}));
function createPacketReader(fn) {
    if (typeof fn !== 'function') {
        throw new TypeError(`Invalid arguement "reader". Expected type "function", got "${typeof fn}"`);
    }
    let done = false;
    let underflow;
    return new stream_1.Transform({
        async transform(buffer, encoding, next) {
            if (done) {
                this.push(buffer);
                return next();
            }
            let iterableBuffer;
            if (underflow) {
                iterableBuffer = Buffer.concat([underflow, buffer]);
                underflow = undefined;
            }
            else {
                iterableBuffer = buffer;
            }
            try {
                const iterator = createPacketIterator(iterableBuffer, true, true);
                let result;
                do {
                    // Force async iteration
                    result = await iterator.next();
                    if (result.value) {
                        if (result.done) {
                            const length = readPacketLength(result.value);
                            if (length === 0) {
                                done = true;
                            }
                            else {
                                underflow = result.value;
                            }
                        }
                        else {
                            fn.call(void 0, result.value);
                        }
                    }
                } while (!result.done);
                this.push(buffer);
                next();
            }
            catch (error) {
                next(error);
            }
        },
        final(next) {
            let error;
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
exports.createPacketReader = createPacketReader;
/**
 * Reads next packet length after `offset`.
 * @param buffer Packet buffer
 * @param offset Start offset
 */
function readPacketLength(buffer, offset = 0) {
    if (buffer.length - offset < 4) {
        return -1;
    }
    const input = buffer.toString('utf8', offset, offset + 4);
    if (!/^[0-9a-f]{4}$/.test(input)) {
        return -1;
    }
    return Number.parseInt(input, 16);
}
exports.readPacketLength = readPacketLength;
/**
 * Concats packet buffers. Can split the buffer at desired index,
 * inserting the rest buffers inbetween the split chunks.
 * @param buffers Buffers to concat
 * @param splitBufferAtIndex Index of buffer to split
 */
function concatPacketBuffers(buffers, splitBufferAtIndex = -1, offset) {
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
exports.concatPacketBuffers = concatPacketBuffers;
/**
 * Returns the first position of a zero packet after offset.
 * @param buffer A valid packet buffer
 * @param offset A valid packet start position
 * @throws {IError}
 */
function findNextZeroPacketInBuffer(buffer, offset = 0) {
    if (!buffer || !buffer.length) {
        return -1;
    }
    do {
        const length = readPacketLength(buffer, offset);
        if (length === 0) {
            return offset;
            // All packet lengths less than 4, except 0, are invalid.
        }
        else if (length > 3) {
            if (offset + length <= buffer.length) {
                offset += length;
            }
            else {
                const error = new Error(`Incomplete packet ending at position ${offset + length} in buffer (${buffer.length})`);
                error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
                throw error;
            }
        }
        else {
            const error = new Error(`Invalid packet starting at position ${offset} in buffer (${buffer.length})`);
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
function* createPacketIterator(buffer, breakOnZeroLength = false, breakOnIncompletePacket = false) {
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
            }
            else {
                if (breakOnIncompletePacket) {
                    return buffer.slice(offset);
                }
                else {
                    const error = new Error(`Incomplete packet ending at position ${offset + length} in buffer (${buffer.length})`);
                    error.code = ErrorCodes.ERR_INCOMPLETE_PACKET;
                    throw error;
                }
            }
        }
        else {
            const error = new Error(`Invalid packet starting at position ${offset} in buffer (${buffer.length})`);
            error.code = ErrorCodes.ERR_INVALID_PACKET;
            throw error;
        }
    } while (offset < buffer.length);
}
exports.createPacketIterator = createPacketIterator;
//# sourceMappingURL=index.js.map