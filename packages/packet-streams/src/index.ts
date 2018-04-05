import { Readable, Transform } from "stream";

export function createPacketInspectStream(reader: (packet: Buffer) => any): [Transform, Promise<void>] {
  if (typeof reader !== 'function') {
    throw new TypeError(`Invalid arguement "reader". Expected type "function", got "${typeof reader}"`);
  }
  let ready = false;
  let underflow: Buffer;
  const stream = new Transform({
    async transform(this: Transform, buffer: Buffer, encoding: string, next: (err?: Error) => void) {
      if (ready) {
        this.push(buffer);
        next();
      } else {
        if (underflow) {
          buffer = Buffer.concat([underflow, buffer]);
          underflow = undefined;
        }
        try {
          let iterator = iteratePacketsInBuffer(buffer, true, true);
          let result: IteratorResult<Buffer>;
          do {
            // Force iteration onto next loop
            result = await iterator.next();
            if (result.value) {
              if (result.done) {
                const length = parsePacketLength(result.value);
                if (length === 0) {
                  result.done = false;
                  if (!ready) {
                    ready = true;
                    this.emit(SymbolAwait);
                  }
                  iterator = iteratePacketsInBuffer(result.value, false, true);
                } else {
                  underflow = result.value;
                }
              } else {
                reader(result.value);
              }
            }
          } while (!result.done);
          this.push(underflow ? buffer.slice(0, -(underflow.length)) : buffer);
          next();
        } catch (err) {
          this.emit(SymbolAwait);
          next(err);
        }
      }
    },
    final(this: Transform) {
      if (underflow) {
        const length = parsePacketLength(underflow);
        this.emit(
          'error',
          new Error(`Incomplete packet with length ${length} remaining in buffer (${underflow.length})`),
        );
      }
      if (!ready) {
        this.emit(SymbolAwait);
      }
    },
  });
  const promise = new Promise<void>((resolve) => stream.on(SymbolAwait as any, resolve));
  return [stream, promise];
}

export function createPacketReadableStream(buffers: Buffer[], pauseBufferIndex: number = -1): Readable {
  const iterator = iteratePacketsInBuffers(buffers, pauseBufferIndex);
  return new Readable({
    read(this: Readable, size: number) {
      try {
        const {done, value} = iterator.next();
        if (!done) {
          this.push(value);
        }
      } catch (err) {
        this.push(null);
        this.emit('error', err);
      }
    },
  });
}

const SymbolAwait = Symbol('await');

/**
 * Parse packet length from the four next bytes after `offset`
 * @param buffer Packet buffer
 * @param offset Start offset
 */
function parsePacketLength(buffer: Buffer, offset: number = 0) {
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
 * Creates an iterator yielding packets from multiple buffers.
 * @param buffers Buffers to read
 * @param index Pauseable buffer index
 */
function *iteratePacketsInBuffers(buffers: Buffer[], index: number = 0): IterableIterator<Buffer> {
  let counter = 0;
  let paused: Buffer;
  for (const buffer of buffers) {
    if (index === counter) {
      paused = yield* iteratePacketsInBuffer(buffer, true);
    } else {
      yield* iteratePacketsInBuffer(buffer);
    }
    counter++;
  }
  if (paused) {
    yield* iteratePacketsInBuffer(paused);
  }
  yield null;
}

/**
 * Iterates all packets in a single buffer.
 */
function *iteratePacketsInBuffer(
  buffer: Buffer,
  breakOnZeroLength: boolean = false,
  breakOnMissingChunk: boolean = false,
): IterableIterator<Buffer> {
  if (!buffer.length) {
    return;
  }
  let offset = 0;
  do {
    let length = parsePacketLength(buffer, offset);
    if (length === 0) {
      if (breakOnZeroLength) {
        return buffer.slice(offset);
      }
      length = 4;
    }
    if (length > 0) {
      if (offset + length <= buffer.length) {
        yield buffer.slice(offset, offset + length);
        offset += length;
      } else {
        if (breakOnMissingChunk) {
          return buffer.slice(offset);
        } else {
          throw new Error(`Invalid packet ending at position ${offset + length} in buffer (${buffer.length})`);
        }
      }
    } else if (length < 0) {
      throw new Error(`Invalid packet starting at position ${offset} in buffer (${buffer.length})`);
    }
  } while (offset < buffer.length);
}
