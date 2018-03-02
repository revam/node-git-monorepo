import * as encode from 'git-side-band-message';
import fetch, { Headers as FetchHeaders } from 'node-fetch';
import { Duplex, Readable, Transform, Writable } from 'stream';
import { promisify } from 'util';

export enum ServiceType {
  Unknown = 0,
  Advertise = 1,
//  Archive = 2,
  Pull = 3,
  Push = 4,
}

export enum RequestStatus {
  Pending,
  Accepted,
  Rejected,
}

export const SymbolSourceStream = Symbol('source stream');

export const SymbolVerboseStream = Symbol('verbose stream');

const service_headers = {
  'receive-pack': Buffer.from('001f# service=git-receive-pack\n0000'),
  'upload-pack': Buffer.from('001e# service=git-upload-pack\n0000'),
};

const parse_body = {
  'git-receive-pack': /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/([^\/]+)\/(.*?))(?:\u0000([^\n]*)?\n?$)/,
  'git-upload-pack':  /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})\n?$/,
};

const handle_metadata = {
  'git-receive-pack': (results: RegExpExecArray, metadata: RequestMetadata) => {
    metadata.old_commit = results[1];
    metadata.new_commit = results[2];
    metadata.ref = {
      name: results[5],
      path: results[3],
      type: results[4],
    };
    metadata.capabilities = results[6] ? results[6].trim().split(' ') : [];
  },
  'git-upload-pack': (results: RegExpExecArray, metadata: RequestMetadata) => {
    const type = results[1];

    if (!(type in metadata)) {
      metadata[type] = [];
    }

    metadata[type].push(results[2]);
  },
};

const valid_services: Array<[ServiceType, RegExp]> = [
  [ServiceType.INFO, /^\/?(.*?)(\/info\/refs)$/],
  [ServiceType.PULL, /^\/?(.*?)(\/git-upload-pack)$/],
  [ServiceType.PUSH, /^\/?(.*?)(\/git-receive-pack)$/],
];

const zero_buffer = Buffer.from('0000');

/**
 * Matches method, path, service and content-type against available services.
 *
 * @throws {ProxyError}
 * @returns GitProxyCore instance
 */
export function getProxy(uri: string, method: string, path: string, service_name: string,
                         content_type: string): GitProxyCore {
  for (const [service, regex] of valid_services) {
    const results = regex.exec(path);

    if (results) {
      const has_input = service !== ServiceType.INFO;

      service_name = get_service_name(has_input ? service_name : path.slice(results[1].length + 1));
      if (!service_name) {
        throw new GitProxyError({
          have: service_name,
          message: `Invalid service name '${service_name}'`,
          type: ProxyErrors.InvalidServiceName,
          want: new Set(Reflect.ownKeys(service_headers) as string[]),
        });
      }

      const expected_method = has_input ? 'GET' : 'POST';
      if (method !== expected_method) {
        throw new GitProxyError({
          have: method,
          message: `Invalid HTTP method used for service (${method} != ${expected_method})`,
          type: ProxyErrors.InvalidMethod,
          want: expected_method,
        });
      }

      const expected_content_type = `application/x-git-${service_name}-request`;
      if (has_input && content_type !== expected_content_type) {
        throw new GitProxyError({
          have: content_type,
          message: `Invalid content type used for service (${content_type} != ${expected_content_type})`,
          type: ProxyErrors.InvalidContentType,
          want: expected_content_type,
        });
      }

      return new GitProxyCore({
        has_input,
        path: has_input ? results[2] : `${results[2]}?service=${service_name}`,
        repository: results[1],
        service,
        uri,
      });
    }
  }
}

/**
 * Checks if repository exists on origin.
 *
 * @export
 * @param  origin Daemon origin uri
 * @param  repository Repository to check
 * @param  headers Additional header to send
 * @throws {TypeError}
 */
export async function repositoryExists(origin: string, repository: string, headers?: Headers): Promise<boolean> {
  if (!origin) {
    throw new TypeError('Origin must not be empty or undefined');
  }

  if (!repository) {
    throw new TypeError('Repository must not be empty or undefined');
  }

  if (origin.endsWith('/')) {
    origin = origin.substring(0, -1);
  }

  const url = `${origin}/${repository}/info/refs?service=git-upload-service`;
  const response = await fetch(url, {headers});

  return response.status === 200 || response.status === 304;
}

export class GitProxyCore extends Duplex {
  public readonly metadata: RequestMetadata = {};
  public readonly service: ServiceType;
  public repository: string;
  public uri: string;

  private readonly path: string;
  // @ts-ignore suppress error [1166]
  private [SymbolSourceStream]: SourceDuplex;
  // @ts-ignore suppress error [1166]
  private [SymbolVerboseStream]?: WritableBand;
  private __needs_flush = false;
  private __ready: number | false = false;
  private __next?: (err?: Error) => void;
  private __buffers?: Buffer[] = [];

  constructor(data: IGitProxyCoreData) {
    super();

    if (data.uri.endsWith('/')) {
      data.uri = data.uri.substring(0, -1);
    }

    this.repository = data.repository;
    this.service = data.service;
    this.uri = data.uri;
    this.path = data.path;

    this.once('parsed', () => {
      const source = this[SymbolSourceStream] = new Duplex() as SourceDuplex;

      source._write = async(buffer: Buffer, encoding, next) => {
        if (buffer.length === 4 && buffer.equals(zero_buffer)) {
          this.__needs_flush = true;
          this.push(buffer.slice(0, -4));
        // We weren't finished, so restore flush signal and continue.
        } else if (this.__needs_flush) {
          this.__needs_flush = false;
          this.push(zero_buffer);

          this.push(buffer);
        } else {
          this.push(buffer);
        }

        if (this.__ready) {
          next();
        } else {
          source.__next = next;
        }
      };

      source._read = (size) => {
        if (this.__buffers) {
          for (const buffer of this.__buffers) {
            source.push(buffer);
          }

          delete this.__buffers;
        }

        const next = this.__next;
        if (next) {
          delete this.__next;

          next();
        }
      };

      source.on('error', (err) => this.emit('error', err));

      const verbose = this[SymbolVerboseStream];
      const flush = async() => {
        if (verbose && verbose.writable) {
          // Stop writing
          await promisify(verbose.end)();

          verbose._write = function _write(buf, enc, next) {
            this.push(buf);
            next();
          };

          verbose.on('finish', flush);

          const buffer = verbose.__buffer;
          const resume = verbose.__next;

          if (buffer) {
            delete verbose.__buffer;
            this.push(buffer);
          }

          if (resume) {
            delete verbose.__next;
            resume();
          }

          return;
        } else if (this.__needs_flush) {
          this.push('0000');
        }

        this.push(null);
      };

      source.on('finish', flush);
      this.on('finish', () => source.push(null));

      if (this.__ready) {
        source._read(this.__ready);
      }
    });

    if (!data.has_input) {
      this.writable = false;
      setImmediate(() => this.emit('parsed'));
    }
  }

  public verbose(...messages: Array<string | Buffer>) {
    if (!this[SymbolVerboseStream]) {
      const band = this[SymbolVerboseStream] = new Writable() as WritableBand;

      band._write = function write(buffer, encoding, next) {
        band.__buffer = buffer;
        band.__next = next;
      };
    }

    const verbose = this[SymbolVerboseStream];

    if (verbose.writable) {
      for (const message of messages) {
        verbose.write(encode(message));
      }
    }
  }

  public process_input(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this[SymbolSourceStream]) {
        return resolve();
      }

      this.once('parsed', resolve);
    });
  }

  public async forward(repository?: string, headers?: Headers): Promise<IForwardedResult> {
    if (!repository) {
      if (!this.repository) {
        throw new TypeError('Repository cannot be empty');
      }

      repository = this.repository;
    }

    const url = `${this.uri}/${repository}/${this.path}`;
    const source = this[SymbolSourceStream];
    const response = await fetch(url, this.writable ? {method: 'POST', body: source, headers} : {headers});

    response.body.pipe(new Seperator()).pipe(source);

    return {status: response.status, headers: response.headers, repository};
  }

  public _read(size) {
    const source = this[SymbolSourceStream];

    if (source && source.__next) {
        this.__ready = false;

        const next = source.__next;
        delete source.__next;

        next();
    } else {
      this.__ready = size;
    }
  }

  public async _write(buffer: Buffer, enc, next) {
    if (this[SymbolSourceStream]) {
      this.__next = next;
      this[SymbolSourceStream].push(buffer);

      return;
    }

    // Stack buffers till fully parsed
    this.__buffers.push(buffer);

    // Buffer is pre-divided to correct length
    const length = packet_length(buffer);

    // Parse till we reach specal signal (0000) or unrecognisable data.
    if (length > 0) {
      const message = buffer.toString('utf8');
      const results = parse_body[this.service].exec(message);

      if (results) {
        handle_metadata[this.service](results, this.metadata);
      }

      next();
    } else {
      this.__next = next;
      this.emit('parsed');
    }
  }
}

export class Seperator extends Transform {
  private underflow?: Buffer;

  public async _transform(buffer: Buffer, encoding, next) {
    // Start where previous stopped
    if (this.underflow) {
      buffer = Buffer.concat([this.underflow, buffer]);
      this.underflow = undefined;
    }

    let length = 0;
    let offset = -1;
    do {
      offset = offset + length + 1;
      length = packet_length(buffer, offset);

      // Break if no length found on first iteration
      if (offset === 0 && length === -1) {
        break;
      }

      // Special signal (0000) is 4 char long
      if (length === 0) {
        length = 4;
      }

      // We got data underflow (assume one more buffer)
      if (length >= 0 && offset + length > buffer.length) {
        this.underflow = buffer.slice(offset);
        break;
      }

      if (length >= 4) {
        this.push(buffer.slice(offset, length));
      } else {
        this.push(buffer.slice(offset));
      }

      // Wait till next tick so we can do other stuff inbetween.
      await new Promise<void>((resolve) => process.nextTick(resolve));
    } while (length !== -1);

    // We got a data overflow, so append extra data
    if (!this.underflow && offset < buffer.length) {
      this.push(buffer.slice(offset));
    }

    next();
  }
}

export class GitProxyError<T, U> extends Error {
  public type: ProxyErrors;
  public have: T;
  public want: U;

  constructor(data: IGitProxyErrorData<T, U>) {
    super(data.message);
    this.have = data.have;
    this.type = data.type;
    this.want = data.want;
  }
}

export enum ProxyErrors {
  InvalidMethod = 'InvalidMethod',
  InvalidServiceName = 'InvalidServiceName',
  InvalidContentType = 'InvalidContentType',
}

export type Headers = FetchHeaders | string[] | {[index: string]: string};

export interface RequestMetadata {
  want?: string[];
  have?: string[];
  ref?: {
    name: string;
    path: string;
    type: string;
  };
  old_commit?: string;
  new_commit?: string;
  capabilities?: string[];
}

export interface IGitProxyCoreData {
  has_input: boolean;
  path: string;
  repository: string;
  service: ServiceType;
  uri: string;
}

export interface IForwardedResult {
  status: number;
  headers: FetchHeaders;
  repository: string;
}

export interface IGitProxyErrorData<T, U> {
  message: string;
  type: ProxyErrors;
  want: U;
  have: T;
}

function get_service_name(input: string): string {
  if (!input || !input.startsWith('git-')) {
    return;
  }

  if (Reflect.has(service_headers, input)) {
    return input;
  }
}

function packet_length(buffer: Buffer, offset: number = 0) {
  try {
    return Number.parseInt(buffer.slice(offset, 4).toString('utf8'), 16);
  } catch (err) {
    return -1;
  }
}

interface SourceDuplex extends Duplex {
  __next?(err?: Error): void;
  __buffer?: Buffer;
}

interface WritableBand extends Writable {
  __next?(err?: Error): void;
  __buffer?: Buffer;
}
