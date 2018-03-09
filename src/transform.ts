import { Transform, Writable } from "stream";
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
      let length = packet_length(buffer);
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
        length = packet_length(buffer, offset);
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

export class FuseOutput extends Transform {
  public byteLength: number;
  constructor(messages?: Buffer[]) {
    super();
    this.byteLength = 0;
    if (messages && messages.length) {
      for (const message of messages) {
        this.write(message);
      }
    }
  }

  public _transform(buffer: Buffer, encoding: string, next: (err?: Error) => void) {
    this.byteLength += buffer.length;
    this.push(buffer);
    next();
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
 * Parse packet length at offset, but reurn
 * @param buffer Packet buffer
 * @param offset Start offset
 */
function packet_length(buffer: Buffer, offset: number = 0) {
  try {
    return Number.parseInt(buffer.slice(offset, offset + 4).toString('utf8'), 16);
  } catch (err) {
    return -1;
  }
}
