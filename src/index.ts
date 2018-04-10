import { ChildProcess, spawn } from 'child_process';
import { createPacketInspectStream } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { Signal } from 'micro-signals';
import { Headers } from 'node-fetch';
import { Readable, Transform } from 'stream';
import { promisify } from 'util';

export { Headers } from 'node-fetch';

export enum RequestType {
  Unknown,
  Advertise,
  Pull,
  Push,
}

export enum RequestStatus {
  Pending,
  Accepted,
  Rejected,
  AcceptedButRejected,
}

/**
 * unique source symbol
 */
export const SymbolSource = Symbol('source');

/**
 * Checks if candidateDriver is a valid driver.
 * @param candidateDriver Driver candidate
 */
export function checkIfValidServiceDriver(candidateDriver: any): boolean {
  return typeof candidateDriver === 'object' &&
    'origin' in candidateDriver && typeof candidateDriver.origin === 'string' &&
    'access' in candidateDriver && typeof candidateDriver.access === 'function' &&
    'exists' in candidateDriver && typeof candidateDriver.exists === 'function' &&
    'empty' in candidateDriver && typeof candidateDriver.empty === 'function' &&
    'init' in candidateDriver && typeof candidateDriver.init === 'function' &&
    'hint' in candidateDriver && typeof candidateDriver.hint === 'function' &&
    'get' in candidateDriver && typeof candidateDriver.get === 'function';
}

/**
 * High-level git service.
 */
export class Service {
  /**
   * Resolves when metadata is ready.
   */
  public readonly awaitReady: Promise<void>;
  /**
   * Requested capebilities client support/want.
   */
  public readonly capabilities: Map<string, string>;
  /**
   * Low-level service driver
   */
  public readonly driver: IServiceDriver;
  /**
   * Request metadata, such as ref or commit info.
   */
  public readonly metadata: Array<IRequestPullData | IRequestPushData>;
  /**
   *
   */
  public readonly onAccept: Signal<ISignalAcceptData>;
  /**
   *
   */
  public readonly onReject: Signal<ISignalRejectData>;
  /**
   *
   */
  public readonly onError: Signal<any>;
  /**
   * True if input is parsed.
   */
  public readonly ready: boolean;
  /**
   * Request status.
   */
  public readonly status: RequestStatus;
  /**
   * Requested service
   */
  public readonly type: RequestType;
  /**
   * Repository to work with.
   */
  public repository: string;

  private [SymbolSource]: Transform;
  private __headers: Headers;
  private __hint: string;
  private __messages: Buffer[];
  private __status: RequestStatus;
  private __ready: boolean;

  /**
   * Accepts 5 arguments and will throw if it is supplied the wrong type or to few arguments.
   *
   * @param driver Service driver to use.
   * @param method Upper-case HTTP method for request.
   * @param url_fragment The full URL or tail of the url. Will extract repository from here if possible.
   * @param headers Request headers supplied as: 1) an instance of [Headers](.),
   *                2) a key-value array, or 3) a plain object with headers as keys.
   * @param input Input (normally the request itself)
   *
   * @throws {TypeError}
   */
  constructor(
    driver: IServiceDriver,
    method: string,
    url_fragment: string,
    headers: Headers | Array<[string, string]> | {[index: string]: string},
    input: Readable,
  ) {
    if (!checkIfValidServiceDriver(driver)) {
      throw new TypeError('argument `driver` must be a valid service driver interface');
    }

    if (typeof method !== 'string' || !method) {
      throw new TypeError('argument `method` must be a valid string');
    }

    if (typeof url_fragment !== 'string' || !url_fragment) {
      throw new TypeError('argument `url_fragment` must be a valid string');
    }

    if (!(
      headers instanceof Headers ||
      headers instanceof Array && headers.length !== 0 ||
      typeof headers === 'object' && Reflect.ownKeys(headers).length !== 0
    )) {
      throw new TypeError('argument `in_headers` must be either a Headers object, a string array or headers object');
    }

    if (!(input instanceof Readable)) {
      throw new TypeError('argument `input` must be s sub-instance of stream.Readable');
    }

    // @ts-ignore incomplete definition file for package "node-fetch"
    this.__headers = new Headers(headers);
    this.__messages = [];
    this.__status = RequestStatus.Pending;
    this.__ready = false;
    Object.defineProperties(this, {
      capabilities: {
        value: new Map(),
        writable: false,
      },
      driver: {
        value: driver,
        writable: false,
      },
      metadata: {
        value: [],
        writable: false,
      },
      onAccept: {
        value: new Signal(),
        writable: false,
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
      onReject: {
        value: new Signal(),
        writable: false,
      },
      ready: {
        get() { return this.__ready; },
      },
      status: {
        get() { return this.__status; },
      },
    });

    for (const [service, regex] of ServiceMap) {
      const results = regex.exec(url_fragment);

      if (results) {
        const service_name = results[3];
        if (!ValidServiceNames.has(service_name)) {
          this.onError.dispatch(
            new TypeError(
              `Invalid service "${service_name}", want one of: "${Array.from(ValidServiceNames).join('", "')}"`,
            ),
          );
          break;
        }

        const advertise = service === RequestType.Advertise;
        const expected_method = advertise ? 'GET' : 'POST';
        if (method !== expected_method) {
          this.onError.dispatch(
            new TypeError(`Unexpected HTTP ${method} request, expected a HTTP ${expected_method}) request`),
          );
          break;
        }

        // Only check content type for post requests
        const content_type = this.__headers.get('Content-Type');
        const expected_content_type = `application/x-git-${service_name}-request`;
        if (!advertise && content_type !== expected_content_type) {
          this.onError.dispatch(
            new TypeError(`Unexpected content-type "${content_type}", expected "${expected_content_type}"`),
          );
          break;
        }

        this.__hint = this.driver.hint(...results.slice(2));
        this.repository = results[1];
        Object.defineProperty(this, 'type', {
          value: service,
          writable: false,
        });

        break;
      }
    }

    if ('type' in this && this.type !== RequestType.Advertise) {
      const disposables: Array<() => void> = [];
      const onError = (ee, cb) => { ee.on('error', cb); disposables.push(() => ee.removeListener('error', cb)); };
      onError(input, (err) => this.onError.dispatch(err));

      const middleware = MetadataMap.get(this.type);
      const [parser, awaitReady] = createPacketInspectStream(middleware(this));
      onError(parser, (err) => this.onError.dispatch(err));

      this[SymbolSource] = parser;
      Object.defineProperty(this, 'awaitReady', {
        value: awaitReady.then(() => {
          this.__ready = true;
          disposables.forEach((d) => d());
          disposables.length = 0;
        }),
        writable: false,
      });

      input.pipe(parser);
    } else {
      if (!('type' in this)) {
        Object.defineProperty(this, 'type', {
          value: RequestType.Unknown,
          writable: false,
        });
      }
      this.__ready = true;
      Object.defineProperty(this, 'awaitReady', {
        value: Promise.resolve(),
        writable: false,
      });
    }
  }

  /**
   * Accepts and process request for service.
   */
  public async accept(): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }

    this.__status = RequestStatus.Accepted;

    if (this.type === RequestType.Unknown) {
      return;
    }

    await this.awaitReady;

    try {
      const output = await this.driver.get(
        this.repository,
        this.__hint,
        this.__headers,
        this[SymbolSource],
        this.__messages,
      );

      if (output.status >= 400) {
        this.__status = RequestStatus.AcceptedButRejected;
        this.onReject.dispatch({status: output.status, headers: output.headers, reason: 'Accepted, but rejected'});
      } else {
        this.onAccept.dispatch(output);
      }
    } catch (err) {
      this.onError.dispatch(err);
    }
  }

  /**
   * Rejects service with status code and an optional reason. Only accepts codes above or equal 400.
   * @param status Http status code
   * @param reason Reason for rejection
   */
  public async reject(status?: number, reason?: string): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }

    this.__status = RequestStatus.Rejected;

    if (!(status < 600 && status >= 400)) {
      status = 403;
    }

    const headers = new Headers();

    headers.set('Content-Type', 'text/plain');

    this.onReject.dispatch({reason, status, headers});
  }

  /**
   * Check if repository exists
   */
  public async exists(): Promise<boolean> {
    try {
      return await this.driver.exists(this.repository);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  /**
   * Check access to service
   */
  public async access(): Promise<boolean> {
    if (this.type === RequestType.Unknown) {
      return false;
    }

    try {
      return await this.driver.access(this.repository, this.__hint);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  /**
   * Init repository if not exists. Return value indicate a new repo.
   */
  public async init(): Promise<boolean> {
    try {
      return await this.driver.init(this.repository);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  /**
   * Send messages to client. Messages appear in console.
   * Messages are only sent if service is accepted.
   * @param messages Messages to show
   */
  public inform(message: string | Buffer): this;
  public inform(...messages: Array<string | Buffer>): this {
    messages.forEach((message) => this.__messages.push(encode(message)));
    return this;
  }
}

/**
 * Contains data of what client wants from this pull request.
 */
export interface IRequestPullData {
  /**
   * Request type.
   */
  type: 'want' | 'have';
  /**
   * Commit. In plural form for compatibility with IRequestPushData.
   */
  commits: [string];
}

/**
 * Contains data of what client want to do in this push request.
 */
export interface IRequestPushData {
  /**
   * Push type, can be one of create, update or delete.
   */
  type: 'create' | 'update' | 'delete';
  /**
   * Commits. In order of old commit, new commit.
   */
  commits: [string, string];
  /**
   * Reference to work with
   */
  refname: string;
}

/**
 * Abstract driver to work with git.
 */
export interface IServiceDriver {
  /**
   * Either an URL or absolute path leading to repositories.
   */
  readonly origin: string;
  /**
   * Checks access to service indicated by hint for repository at origin.
   * @param repository Repository to check.
   * @param hint Hint indicating service to check.
   */
  access(repository: string, hint: string): Promise<boolean>;
  /**
   * Check if repository exists and is empty at origin.
   * @param repository Repository to check.
   */
  empty(repository: string): Promise<boolean>;
  /**
   * Check if repository exists at origin.
   * @param repository Repository to check.
   */
  exists(repository: string): Promise<boolean>;
  /**
   * Process service indicated by hint, and return data from git.
   * @param repository Repository to work with
   * @param hint Service hint
   * @param headers Http headers to append if sent over http(s)
   * @param input Input (processed request body)
   * @param messages Buffered messages to client
   */
  get(repository: string, hint: string, headers: Headers): Promise<ISignalAcceptData>;
  get(repository: string, hint: string, headers: Headers,
      input: Readable, messages: Buffer[]): Promise<ISignalAcceptData>;
  /**
   * Choose hint used to determine service for this driver.
   * @param hints strings to choose from
   */
  hint(...hints: string[]): string;
  /**
   * Initialise a bare repository at origin, but only if repository does not exist.
   * @param repository Repository to init
   */
  init(repository: string): Promise<boolean>;
}

/**
 * Contains data needed to fufill request.
 */
export interface ISignalAcceptData {
  /**
   * Status code for response. Either a `2xx` or `3xx` code.
   */
  status: number;
  /**
   * Headers for response.
   */
  headers: Headers;
  /**
   * Body for response.
   */
  body: Readable;
}

/**
 * Contains data needed to reject request.
 */
export interface ISignalRejectData {
  /**
   * Status code for response. Either a `4xx` or `5xx` code.
   */
  status: number;
  /**
   * Headers for response.
   */
  headers: Headers;
  /**
   * Optional reason for rejection.
   */
  reason?: string;
}

const ValidServiceNames = new Set(['receive-pack', 'upload-pack']);

const ServiceMap: Map<RequestType, RegExp> = new Map([
  [RequestType.Advertise, /^\/?(.*?)\/(info\/refs\?service=git-(.*))$/],
  [RequestType.Pull, /^\/?(.*?)\/(git-(upload-pack))$/],
  [RequestType.Push, /^\/?(.*?)\/(git-(receive-pack))$/],
]);

const MetadataMap = new Map<RequestType, (service: Service) => (buffer: Buffer) => any>([
  [
    RequestType.Push,
    (service) => {
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString('utf8');
        const results = regex.exec(value);
        if (results) {
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
        }
      };
    },
  ],
  [
    RequestType.Pull,
    (service) => {
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString('utf8');
        const results = regex.exec(value);
        if (results) {
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
        }
      };
    },
  ],
]);
