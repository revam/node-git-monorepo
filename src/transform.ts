import { Readable, Transform } from "stream";
import { IRequestPullData, IRequestPushData, Service } from ".";
import { ServiceType, SymbolSource } from "./constants";

export class ParseInput extends Transform {
  public readonly done: Promise<void>;
  public regex: RegExp;
  public parse?(results: RegExpExecArray, service: Service): void;
  public [SymbolSource]: Service;
  private __done: (() => void) | true;
  private underflow?: Buffer;
  constructor(service: Service) {
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
    const [regex, parse] = MetadataMap.get(service.type);
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

      let offset = 0;
      let length = parsePacketLength(buffer);
      while (length > 0 && offset < buffer.length) {
        if (offset + length > buffer.length) {
          this.underflow = buffer.slice(offset);
          break;
        }

        const message = buffer.toString('utf8', offset, offset + length);
        const results = this.regex.exec(message);
        if (results) {
          this.parse(results, this[SymbolSource]);
        }

        // Wait till next tick so we can do other stuff inbetween.
        await new Promise<void>((resolve) => process.nextTick(resolve));

        offset += length;
        length = parsePacketLength(buffer, offset);
      }

      if (length <= 0) {
        this.__done();
        this.__done = true;
      }

      this.push(this.underflow && offset > 0 ? buffer.slice(offset) : buffer);
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

const MetadataMap = new Map<ServiceType, [RegExp, (results: RegExpExecArray, service: Service) => any]>([
  [ServiceType.Push, [
    /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/,
    (results: RegExpExecArray, service: Service) => {
      let type: 'create' | 'delete' | 'update';
      if ('0000000000000000000000000000000000000000' === results[1]) {
        type = 'create';
      } else if ('0000000000000000000000000000000000000000' === results[1]) {
        type = 'delete';
      } else {
        type = 'update';
      }
      const metadata: IRequestPushData = {
        commits: [results[1], results[2]],
        refname: results[3],
        type,
      };
      service.metadata.push(metadata);
      if (results[4]) {
        for (const c of results[4].trim().split(' ')) {
          if (/=/.test(c)) {
            const [k, v] = c.split('=');
            service.capabilities.set(k, v);
          } else {
            service.capabilities.set(c, undefined);
          }
        }
      }
    },
  ]],
  [ServiceType.Pull, [
    /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/,
    (results: RegExpExecArray, service: Service) => {
      const metadata: IRequestPullData = {
        commits: [results[2]],
        type: results[1] as ('want' | 'have'),
      };
      service.metadata.push(metadata);
      if (results[3]) {
        for (const c of results[3].trim().split(' ')) {
          if (/=/.test(c)) {
            const [k, v] = c.split('=');
            service.capabilities.set(k, v);
          } else {
            service.capabilities.set(c, undefined);
          }
        }
      }
    },
  ]],
]);

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
  let paused: number;
  for (const buffer of buffers) {
    if (index === counter) {
      paused = yield* iteratePacketsInBuffer(buffer, 0, true);
    } else {
      yield* iteratePacketsInBuffer(buffer, 0);
    }
    counter++;
  }
  if (paused && paused < buffers[index].length) {
    yield* iteratePacketsInBuffer(buffers[index], paused);
  }
  yield null;
}

/**
 * Iterates all packets in a single buffer. if `pause` is true will return offset when met with special symbol.
 * @param buffer Buffer
 * @param offset Start offset
 * @param pause should pause stream
 */
function *iteratePacketsInBuffer(buffer: Buffer, offset: number, pause: boolean = false): IterableIterator<Buffer> {
  let length = parsePacketLength(buffer, offset);
  while (offset < buffer.length) {
    yield buffer.slice(offset, offset + length);
    offset += length;
    length = parsePacketLength(buffer, offset);
    if (length === 0) {
      if (pause) {
        return offset;
      }
      length = 4;
    }
  }
}
