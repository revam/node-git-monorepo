import { ChildProcess, spawn } from 'child_process';
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

export const SymbolSource = Symbol('source stream');

export const SymbolVerbose = Symbol('verbose stream');

const service_headers = {
  'receive-pack': Buffer.from('001f# service=git-receive-pack\n0000'),
  'upload-pack': Buffer.from('001e# service=git-upload-pack\n0000'),
};

const parse_body = {
  'git-receive-pack': /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/([^\/]+)\/(.*?))(?:\u0000([^\n]*)?\n?$)/,
  'git-upload-pack':  /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})\n?$/,
};

const handle_metadata = {
  'git-receive-pack': (results: RegExpExecArray, metadata: IRequestMetadata) => {
    metadata.old_commit = results[1];
    metadata.new_commit = results[2];
    metadata.ref = {
      name: results[5],
      path: results[3],
      type: results[4],
    };
    metadata.capabilities = results[6] ? results[6].trim().split(' ') : [];
  },
  'git-upload-pack': (results: RegExpExecArray, metadata: IRequestMetadata) => {
    const type = results[1];

    if (!(type in metadata)) {
      metadata[type] = [];
    }

    metadata[type].push(results[2]);
  },
};

const valid_services: Array<[ServiceType, RegExp]> = [
  [ServiceType.Advertise, /^\/?(.*?)\/(info\/refs\?service=git-(.*))$/],
  [ServiceType.Pull, /^\/?(.*?)\/(git-(upload-pack))$/],
  [ServiceType.Push, /^\/?(.*?)\/(git-(receive-pack))$/],
];

const zero_buffer = Buffer.from('0000');

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

export class DeployCore extends Duplex {
  public readonly advertise: boolean;
  public readonly metadata: IRequestMetadata;
  public readonly origin: string;
  public readonly remote: boolean;
  public readonly service: ServiceType;
  public repository: string;

  private readonly path: string;
  // @ts-ignore suppress error [1166]
  private [SymbolSource]: SourceDuplex;
  // @ts-ignore suppress error [1166]
  private [SymbolVerbose]?: WritableBand;
  private __needs_flush = false;
  private __ready: number | false = false;
  private __next?: (err?: Error) => void;
  private __buffers?: Buffer[] = [];

  /**
   * Matches method, url and content type against available services, and returns an instance if matched.
   *
   * @param method HTTP Method
   * @param url HTTP Url w/wo query
   * @param content_type HTTP Content-Type Header
   * @param origin Origin
   * @throws {TypeError}
   * @throws {GitProxyError}
   */
  constructor(origin: string, method: string, url: string, content_type: string) {
    super();

    if (typeof content_type !== 'string' || !content_type) {
      throw new TypeError('content_type must not be empty');
    }

    if (typeof url !== 'string' || !url) {
      throw new TypeError('url must not be empty');
    }

    if (typeof method !== 'string' || !method) {
      throw new TypeError('method must not be empty');
    }

    if (typeof origin !== 'string' || !origin) {
      throw new TypeError('origin must not be empty');
    }

    if (origin.endsWith('/')) {
      origin = origin.substring(0, -1);
    }

    Object.defineProperties(this, {
      metadata: {
        value: {},
        writable: false,
      },
      origin: {
        value: origin,
        writable: false,
      },
      remote: {
        value: /^https?:\/\//.test(origin),
        writable: false,
      },
    });

    for (const [service, regex] of valid_services) {
      const results = regex.exec(url);
      const advertise = /\?service=/.test(results[2]);

      if (results) {
        const service_name = results[3];
        if (!check_service_name(service_name)) {
          throw new GitProxyError({
            errorCode: GitProxyErrors.InvalidServiceName,
            have: service_name,
            message: `Invalid service name '${service_name}'`,
            want: new Set(Reflect.ownKeys(service_headers) as string[]),
          });
        }

        const expected_method = this.advertise ? 'GET' : 'POST';
        if (method !== expected_method) {
          throw new GitProxyError({
            errorCode: GitProxyErrors.InvalidMethod,
            have: method,
            message: `Invalid HTTP method used for service (${method} != ${expected_method})`,
            want: expected_method,
          });
        }

        // Only check content type for post requests
        const expected_content_type = `application/x-git-${service_name}-request`;
        if (!this.advertise && content_type !== expected_content_type) {
          throw new GitProxyError({
            errorCode: GitProxyErrors.InvalidContentType,
            have: content_type,
            message: `Invalid content type used for service (${content_type} != ${expected_content_type})`,
            want: expected_content_type,
          });
        }

        this.path = results[this.remote ? 2 : 3];
        this.repository = results[1];
        Object.defineProperties(this, {
          advertise: {
            value: advertise,
            writable: false,
          },
          service: {
            value: service,
            writable: false,
          },
        });

        break;
      }
    }

    if (!this.service) {
      throw new TypeError('Service unavailable');
    }

    this.once('parsed', () => {
      const source = this[SymbolSource] = new Duplex() as SourceDuplex;

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

      const verbose = this[SymbolVerbose];
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

    if (!this.advertise) {
      this.writable = false;
      setImmediate(() => this.emit('parsed'));
    }
  }

  public inform_client(...messages: Array<string | Buffer>) {
    if (!this[SymbolVerbose]) {
      const band = this[SymbolVerbose] = new Writable() as WritableBand;

      band._write = function write(buffer, encoding, next) {
        band.__buffer = buffer;
        band.__next = next;
      };
    }

    const verbose = this[SymbolVerbose];

    if (verbose.writable) {
      for (const message of messages) {
        verbose.write(encode(message));
      }
    }
  }

  public process_input(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this[SymbolSource]) {
        return resolve();
      }

      this.once('parsed', resolve);
    });
  }

  public async process_output(): Promise<IDeployCoreOutputResult>;
  public async process_output(repository: string): Promise<IDeployCoreOutputResult>;
  public async process_output(repository: string, headers: Headers): Promise<IDeployCoreOutputResult>;
  public async process_output(repository?: string, headers?: Headers): Promise<IDeployCoreOutputResult> {
    if (typeof repository === 'string') {
      this.repository = repository;
    }

    if (!this.repository) {
      throw new GitProxyError({
        errorCode: ProxyErrors.RepositoryEmpty,
        have: this.repository,
        message: 'repository cannot be empty',
        want: 'any non-empty string value',
      });
    }

    if (this.remote) {
      try {
        const url = `${this.origin}/${this.repository}/${this.path}`;
        const source = this[SymbolSource];
        const response = await fetch(url, this.writable ? {method: 'POST', body: source, headers} : {headers});

        response.body.pipe(new Seperator()).pipe(source);

        return {status: response.status, headers: response.headers};
      } catch (err) {
        this.emit('error', err);

        return {status: 500};
      }
    } else {
      try {
        const cwd = `${this.origin}/${this.repository}`;
        const args = [this.path.slice(4), this.advertise ? '--advertise-refs' : '--stateless-rpc', '.'];
        const child = spawn('git', args, {cwd});
        const source = this[SymbolSource];

        source.pipe(child.stdin);

        const {exitCode, stdout, stderr} = await exec(child);

        if (exitCode) {
          const {status, errorCode} = map_error(stderr);

          this.emit('error', new ServiceError({
            errorCode,
            message: 'Failed to execute git',
          }));

          return {status};
        }

        stdout.pipe(new Seperator()).pipe(source);

        const out_headers = new FetchHeaders();

        out_headers.set('Content-Type', this.advertise ? 'text/plain' : `x-git-${this.path}-result`);

        return {status: 200, headers: out_headers};
      } catch (err) {
        this.emit('error', err);

        return {status: 500};
      }
    }
  }

  public _read(size) {
    const source = this[SymbolSource];

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
    if (this[SymbolSource]) {
      this.__next = next;
      this[SymbolSource].push(buffer);

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
  public errorCode: ProxyErrors;
  public have?: T;
  public want?: U;

  constructor(data: IGitProxyErrorData<T, U>) {
    super(data.message);
    this.have = data.have;
    this.errorCode = data.errorCode;
    this.want = data.want;
  }
}

export enum ProxyErrors {
  InvalidMethod = 'InvalidMethod',
  InvalidServiceName = 'InvalidServiceName',
  InvalidContentType = 'InvalidContentType',
  RepositoryEmpty = 'RepositoryEmpty',
}

export type Headers = FetchHeaders | string[] | {[index: string]: string};

  want?: string[];
  have?: string[];
export interface IRequestMetadata {
  ref?: {
    name: string;
    path: string;
    type: string;
  };
  old_commit?: string;
  new_commit?: string;
  capabilities?: string[];
}


export interface IDeployCoreOutputResult {
  status: number;
  headers?: FetchHeaders;
}

export interface IGitProxyErrorData<T = undefined, U = undefined> {
  message: string;
  errorCode: ProxyErrors;
  want?: U;
  have?: T;
}

function check_service_name(input: string): boolean {
  if (!input || !input.startsWith('git-')) {
    return false;
  }

  return Reflect.has(service_headers, input);
}

function packet_length(buffer: Buffer, offset: number = 0) {
  try {
    return Number.parseInt(buffer.slice(offset, 4).toString('utf8'), 16);
  } catch (err) {
    return -1;
  }
}

function map_error(stderr: string): {status: number; errorCode: ServiceErrors} {
  return {status: 500, errorCode: ProxyErrors.RepositoryEmpty};
}

// Taken and modified from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
async function exec(child: ChildProcess): Promise<IExecutionResult> {
  const disposables: Array<() => void> = [];

  const once = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
    ee.once(name, fn);
    disposables.push(() => ee.removeListener(name, fn));
  };

  const on = (ee: NodeJS.EventEmitter, name: string, fn: (...args: any[]) => void) => {
    ee.on(name, fn);
    disposables.push(() => ee.removeListener(name, fn));
  };

  const result = Promise.all([
    new Promise<number>((resolve, reject) => {
      once(child, 'error', reject);
      once(child, 'exit', resolve);
    }),
    new Promise<Readable>((resolve) => {
      once(child.stdout, 'close', () => resolve(child.stdout));
    }),
    new Promise<string>((resolve) => {
      const buffers: Buffer[] = [];
      on(child.stderr, 'data', (b: Buffer) => buffers.push(b));
      once(child.stderr, 'close', () => resolve(Buffer.concat(buffers).toString('utf8')));
    }),
  ]);

  try {
    const [exitCode, stdout, stderr] = await result;

    return { exitCode, stdout, stderr };
  } finally {
    disposables.forEach((d) => d());
  }
}

interface IExecutionResult {
  exitCode: number;
  stdout: Readable;
  stderr: string;
}

interface SourceDuplex extends Duplex {
  __next?(err?: Error): void;
  __buffer?: Buffer;
}

interface WritableBand extends Writable {
  __next?(err?: Error): void;
  __buffer?: Buffer;
}
