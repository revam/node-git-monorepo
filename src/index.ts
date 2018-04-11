import { ChildProcess, spawn } from 'child_process';
import { createPacketInspectStream } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { Signal } from 'micro-signals';
import { Headers } from 'node-fetch';
import { Readable, Transform } from 'stream';
import { promisify } from 'util';

/**
 * Request service type.
 */
export enum RequestType {
  /**
   * Indicate an unknown service request.
   */
  Unknown,
  /**
   * Indicate a request for advertisement.
   */
  Advertise,
  /**
   * Indicate a pull service request.
   */
  Pull,
  /**
   * Indicate a push service request.
   */
  Push,
}

/**
 * Request service status.
 */
export enum RequestStatus {
  /**
   * Indicate the service is still pending.
   */
  Pending,
  /**
   * Indicate the service was accepted.
   */
  Accepted,
  /**
   * Indocate the service was rejected.
   */
  Rejected,
  /**
   * Indicate the service was accepted, but result contained a rejection code and was thus rejected.
   */
  AcceptedButRejected,
}

/**
 * Unique symbol used for source object (input) in IService implementation (Service class)
 */
export const SymbolSource = Symbol('source');

/**
 * Default business logic following the spec. as defined in the the technical documentation.
 *
 * See https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt for more info.
 * @param service Service instance
 * @param initNonexistant Create and initialise repository when it does not exist
 */
export async function defaultBusinessLogic(service: IService, initNonexistant: boolean = false): Promise<void> {
  // don't exist? -> Not found
  if (! await service.exists()) {
    if (initNonexistant) {
      if (! await service.init()) {
        return service.reject(500, "Failed to initialise new repository");
      }
    } else {
      return service.reject(404);
    }
  }

  // no access? -> Unauthorized
  if (! await service.access()) {
    return service.reject(401);
  }

  // not enabled? -> Forbidden
  if (! await service.enabled()) {
    return service.reject(403);
  }

  // accept or reject request
  return service.accept();
}

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
 * Implemented high-level git service.
 */
export class Service implements IService {
  public readonly awaitReady: Promise<void>;
  public readonly capabilities: Map<string, string>;
  public readonly driver: IServiceDriver;
  public readonly metadata: Array<IRequestPullData | IRequestPushData>;
  public readonly onAccept: Signal<ISignalAcceptData>;
  public readonly onReject: Signal<ISignalRejectData>;
  public readonly onError: Signal<any>;
  public readonly ready: boolean;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
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
    headers: Headers | Array<[string, string]> | {[index: string]: string | string[]},
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

    // Workaround for string array headers
    const multi_headers: Array<[string, string[]]> = [];
    if (!(headers instanceof Headers || headers instanceof Array)) {
      (Reflect.ownKeys(headers) as string[]).filter((h) => {
        if (headers[h] instanceof Array) {
          multi_headers.push([h, headers[h] as string[]]);
          Reflect.deleteProperty(headers, h);
        }
      });
    }
    // @ts-ignore incomplete definition file for package "node-fetch"
    this.__headers = new Headers(headers);
    // Workaround for string array headers
    if (multi_headers.length) {
      for (const [header, values] of multi_headers) {
        for (const value of values) {
          this.__headers.append(header, value);
        }
      }
    }
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

  public async exists(ignoreEmpty: boolean = false): Promise<boolean> {
    try {
      return await this.driver.exists(this.repository, ignoreEmpty);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  public async enabled(): Promise<boolean> {
    if (this.type === RequestType.Unknown) {
      return false;
    }

    try {
      return await this.driver.enabled(this.repository, this.__hint);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  public async access(): Promise<boolean> {
    if (this.type === RequestType.Unknown) {
      return false;
    }

    try {
      return await this.driver.access(this.repository, this.__hint, this.__headers);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  public async init(): Promise<boolean> {
    try {
      return await this.driver.init(this.repository);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  public inform(message: string | Buffer): void {
    this.__messages.push(encode(message));
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
   * Reference name
   */
  refname: string;
}

/**
 * Lov-level service driver for working with git.
 */
export interface IServiceDriver {
  /**
   * Repositories origin.
   */
  readonly origin: string;
  /**
   * Checks access to service indicated by hint authenticated with headers for repository at origin.
   * @param repository Repository to check.
   * @param hint Hint indicating service to check.
   * @param headers Headers to check for access rights
   */
  access(repository: string, hint: string, headers: Headers): Promise<boolean>;
  /**
   * Checks if service is enabled.
   * @param repository Repository to check.
   * @param hint Hint indication service to check.
   */
  enabled(repository: string, hint: string): Promise<boolean>;
  /**
   * Check if repository exists at origin. Can optionaly ignore empty repositories.
   * @param repository Repository to check.
   */
  exists(repository: string, ignoreEmpty?: boolean): Promise<boolean>;
  /**
   * Process service indicated by hint, and return data from git.
   * @param repository Repository to get
   * @param hint Service hint
   * @param headers HTTP headers received with request
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
 * High-level git service.
 */
export interface IService {
  /**
   * Resolves when metadata is ready.
   */
  readonly awaitReady: Promise<void>;
  /**
   * Requested capebilities client support/want.
   */
  readonly capabilities: Map<string, string>;
  /**
   * Low-level service driver
   */
  readonly driver: IServiceDriver;
  /**
   * Request metadata, such as ref or commit info.
   */
  readonly metadata: Array<IRequestPullData | IRequestPushData>;
  /**
   * Dispatched if request is accepted.
   */
  readonly onAccept: ISignal<ISignalAcceptData>;
  /**
   * Dispatched if request is rejected.
   */
  readonly onReject: ISignal<ISignalRejectData>;
  /**
   * Dispatched when any error ocurr. Dispatched payload may be anything.
   */
  readonly onError: ISignal<any>;
  /**
   * Determine if all metadata is parsed and ready for use.
   */
  readonly ready: boolean;
  /**
   * Request status.
   */
  readonly status: RequestStatus;
  /**
   * Requested service type.
   */
  readonly type: RequestType;
  /**
   * Repository path to use.
   */
  repository: string;
  /**
   * Accepts and process request for service.
   */
  accept(): Promise<void>;
  /**
   * Rejects service with status code and an optional reason. Only accepts codes above or equal 400.
   * @param status 4xx or 5xx http status code with rejection. Defaults to `403`.
   * @param reason Reason for rejection
   */
  reject(status?: number, reason?: string): Promise<void>;
  /**
   * Check if repository exists. Can optionaly ignore empty repositories.
   * @param ignoreEmpty Should treat empty repositories as nonexistant.
   */
  exists(ignoreEmpty?: boolean): Promise<boolean>;
  /**
   * Check if service is enabled. (can still atempt a forcefull use of service)
   */
  enabled(): Promise<boolean>;
  /**
   * Checks access to service as indicated by driver.
   */
  access(): Promise<boolean>;
  /**
   * Initialise a new repository, but only if nonexistant. Return value indicate a new repo.
   */
  init(): Promise<boolean>;
  /**
   * Inform client of message, but only if service is accepted.
   * @param message Messages to inform
   */
  inform(message: string | Buffer): void;
}

/**
 * Simple signal interface, compatible with most implementions.
 */
export interface ISignal<T> {
  /**
   * Adds a listener that listens till removed.
   * @param listener
   */
  add(listener: (payload: T) => any): void;
  /**
   * Adds a listener that only listens once.
   * @param listener
   */
  addOnce(listener: (payload: T) => any): void;
  /**
   * Dispatches payload to all listeners.
   * @param payload
   */
  dispatch(payload: T): void;
  /**
   * Removes a listener.
   * @param listener
   */
  remove(listener: (payload: T) => any): void;
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
