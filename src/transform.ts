import { Readable, Transform } from "stream";
import { IRequestPullData, IRequestPushData, Service } from ".";
import { ServiceType, SymbolSource } from "./constants";

export class ParseInput extends Transform {
  public readonly done: Promise<void>;
  public regex: RegExp;
  public parse?: ParseInputHandler;
  public [SymbolSource]: Service;
  private __done: (() => void) | true;
  private underflow?: Buffer;
  constructor(service: Service, regex: RegExp, parse: ParseInputHandler) {
    super();
    Object.defineProperties(this, {
      done: {
        value: new Promise<void>((resolve) => {
          this.__done = resolve;
        }),
        writable: false,
      },
      [SymbolSource]: {
        value: service,
        writable: false,
      },
    });
    this.regex = regex;
    this.parse = parse;
    this.underflow = undefined;
  }

  public async _transform(buffer: Buffer, encoding: string, next: (err?: Error) => void) {
    if (this.__done === true) {
      this.push(buffer);
    } else {
      if (this.underflow) {
        buffer = Buffer.concat([this.underflow, buffer]);
        this.underflow = undefined;
      }
      let iterator = iteratePacketsInBuffer(buffer, true, false);
      let result: IteratorResult<Buffer>;
      do {
        result = await iterator.next();
        if (result.done) {
          if (result.value) {
            const length = parsePacketLength(result.value);
            if (length === 0) {
              result.done = false;
              if (typeof this.__done === 'function') {
                this.__done();
                this.__done = true;
              }
              iterator = iteratePacketsInBuffer(result.value, false, false);
            } else {
              this.underflow = result.value;
            }
          }
        } else if (result.value) {
          const message = result.value.toString('utf8');
          const results = this.regex.exec(message);
          if (results) {
            this.parse(results, this[SymbolSource]);
          }
        }
      } while (!result.done);
      this.push(this.underflow ? buffer.slice(0, -(this.underflow.length)) : buffer);
    }
    next();
  }

  public _final() {
    if (this.underflow) {
      this.push(this.underflow);
      this.underflow = undefined;
    }
  }
}

export type ParseInputHandler = (results: RegExpExecArray, service: Service) => any;

export class ParseOutput extends Readable {
  public byteLength: number;
  private [SymbolSource]: IterableIterator<Buffer>;
  constructor(buffers: Buffer[], index?: number) {
    super();
    this.byteLength = buffers.reduce((p, c) => p + c.length, 0);
    this[SymbolSource] = iteratePacketsInBuffers(buffers, index);
  }

  public _read() {
    const {done, value} = this[SymbolSource].next();
    if (!done) {
      this.push(value);
    }
  }
}

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
 * Iterates all packets in a single buffer. if `pause` is true will return offset when met with special symbol.
 * @param buffer Buffer
 * @param breakAtZero should break at next zero length
 * @param throwErrors should throw errors or return rest of buffer
 */
function *iteratePacketsInBuffer(buffer: Buffer, breakAtZero: boolean = false, throwErrors: boolean = true,
): IterableIterator<Buffer> {
  let offset = 0;
  do {
    let length = parsePacketLength(buffer, offset);
    if (length === 0) {
      if (breakAtZero) {
        return buffer.slice(offset);
      }
      length = 4;
    }
    if (length > 0) {
      if (offset + length < buffer.length) {
        yield buffer.slice(offset, offset + length);
        offset += length;
      } else {
        if (throwErrors) {
          throw new Error(`Invalid packet ending at position ${offset + length} in buffer (${buffer.length}`);
        } else {
          return buffer.slice(offset);
        }
      }
    } else if (length < 0) {
      if (throwErrors) {
        throw new Error(`Invalid packet starting at position ${offset} in buffer (${buffer.length})`);
      } else {
        return;
      }
    }
  } while (offset < buffer.length);
}
