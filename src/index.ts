import { createHash } from 'crypto';
import { createPacketInspectStream, createPacketReadableStream } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { STATUS_CODES } from "http";
import { Signal } from 'micro-signals';
import { Headers } from 'node-fetch';
import { Readable, Transform } from 'stream';

/**
 * Request service type.
 */
export enum RequestType {
  /**
   * Unknown request type.
   */
  Unknown = 0,
  /**
   * Requests for advertisement of references.
   */
  Advertise = 1,
  /**
   * Requests for advertisement through upload-pack service.
   */
  AdvertiseUploadPack = 3,
  /**
   * Requests for advertisement through receive-pack service.
   */
  AdvertiseReceivePack = 5,
  /**
   * Indicate a pull request.
   */
  Pull = 2,
  /**
   * Requests use of git upload-pack service.
   */
  UploadPack = 2,
  /**
   * Indicate a push request.
   */
  Push = 4,
  /**
   * Requests use of git receive-pack service
   */
  ReceivePack = 4,
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
 * Default business logic following the spec. as defined in the the technical documentation.
 *
 * See https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt for more info.
 * @param service Service instance
 * @param initNonexistant Create and initialise repository when it does not exist
 */
export async function defaultBusinessLogic(
  service: IService,
  initNonexistant: boolean = false,
): Promise<ISignalAcceptData | ISignalRejectData> {
  const promise = new Promise<ISignalAcceptData | ISignalRejectData>((resolve, reject) => {
    service.onError.addOnce(reject);
    service.onAccept.addOnce(resolve);
    service.onReject.addOnce(resolve);
  });
  // don't exist? -> Not found
  if (! await service.exists()) {
    // should we skip creation of resource?
    if (!initNonexistant) {
      service.reject(404);
      return promise;
    }
    if (! await service.init()) {
      // could not create resource
      service.reject(500, "Could not initialize new repository");
      return promise;
    }
  }
  // no access? -> Unauthorized
  if (! await service.access()) {
    service.reject(401);
    // not enabled? -> Forbidden
  } else if (! await service.enabled()) {
    service.reject(403);
    // accept or reject request
  } else {
    service.accept();
  }
  return promise;
}

/**
 * Checks if candidateDriver is a valid driver.
 * @param candidateDriver Driver candidate
 */
export function checkIfValidServiceDriver(candidateDriver: any): boolean {
  return typeof candidateDriver === 'object' &&
    'access' in candidateDriver && typeof candidateDriver.access === 'function' &&
    'enabled' in candidateDriver && typeof candidateDriver.enabled === 'function' &&
    'exists' in candidateDriver && typeof candidateDriver.exists === 'function' &&
    'get' in candidateDriver && typeof candidateDriver.get === 'function' &&
    'init' in candidateDriver && typeof candidateDriver.init === 'function' &&
    'origin' in candidateDriver && typeof candidateDriver.origin === 'string';
}

/**
 * Implemented high-level git service.
 */
export class Service implements IService {
  public readonly awaitReady: Promise<void>;
  public readonly body: Readable;
  public readonly capabilities: Map<string, string>;
  public readonly driver: IServiceDriver;
  public readonly etag: string | false;
  public readonly metadata: Array<IRequestPullData | IRequestPushData>;
  public readonly onAccept: Signal<ISignalAcceptData>;
  public readonly onReject: Signal<ISignalRejectData>;
  public readonly onError: Signal<any>;
  public readonly ready: boolean;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
  public repository: string;
  private __etag: string | false;
  private __headers: Headers;
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
   * @param options Service options
   *
   * @throws {TypeError}
   */
  constructor(
    driver: IServiceDriver,
    method: string,
    url_fragment: string,
    headers: Headers | Array<[string, string]> | {[index: string]: string | string[]},
    input: Readable,
    options: IServiceOptions = {},
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
    this.__etag = !options.useEtag ? false : undefined;
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
      etag: {
        get() { return this.__etag; },
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

    for (const [service, expected_method, regex, expected_content_type] of ServiceMap) {
      const results = regex.exec(url_fragment);
      if (results) {
        if (method !== expected_method) {
          this.onError.dispatch(
            new TypeError(`Unexpected HTTP ${method} request, expected a HTTP ${expected_method}) request`),
          );
          break;
        }

        if (expected_content_type) {
          // Only check content type for post requests
          const content_type = this.__headers.get('Content-Type');
          if (content_type !== expected_content_type) {
            this.onError.dispatch(
              new TypeError(`Unexpected content-type "${content_type}", expected "${expected_content_type}"`),
            );
            break;
          }
        }

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

      Object.defineProperties(this, {
        awaitReady: {
          value: awaitReady.then(() => {
            this.__ready = true;
            if (options.useEtag) {
              const etag = createHash("sha256");
              etag.update(this.repository);
              etag.update(this.type.toString());
              const metadata = this.metadata.slice().sort(sortMetadata).map((m) => JSON.stringify(m));
              etag.update(metadata.join(","));
              const capabilities = Array.from(this.capabilities).sort().filter((a) => a[0] !== "agent");
              etag.update(capabilities.map((a) => a.join("=")).join(","));
              this.__etag = etag.digest("hex");
            }
            disposables.forEach((d) => d());
            disposables.length = 0;
          }),
          writable: false,
        },
        body: {
          value: parser,
          writable: false,
        },
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
      if (options.useEtag) {
        const etag = createHash("sha256");
        etag.update(this.repository);
        etag.update(this.type.toString());
        this.__etag = etag.digest("hex");
      }
      Object.defineProperties(this, {
        awaitReady: {
          value: Promise.resolve(),
          writable: false,
        },
        body: {
          value: input,
          writable: false,
        },
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

    try {
      const output = await this.driver.get(this, this.__headers, this.__messages);

      if (output.status >= 400) {
        this.__status = RequestStatus.AcceptedButRejected;
        this.onReject.dispatch({...output, reason: 'Accepted, but rejected'});
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

    if (!(reason && typeof reason === 'string')) {
      reason = STATUS_CODES[status] || 'Unknown reason';
    }

    const buffer = Buffer.from(reason);
    const body = createPacketReadableStream([buffer]);
    const headers = new Headers();

    headers.set('Content-Type', 'text/plain');
    headers.set('Content-Length', buffer.length.toString());

    this.onReject.dispatch({reason, status, headers, body});
  }

  public async exists(): Promise<boolean> {
    try {
      return await this.driver.exists(this);
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
      return await this.driver.enabled(this);
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
      return await this.driver.access(this, this.__headers);
    } catch (err) {
      this.onError.dispatch(err);

      return false;
    }
  }

  public async init(): Promise<boolean> {
    try {
      return await this.driver.init(this);
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
   * @param service IService object with related information to check
   * @param headers Headers to check for access rights
   */
  access(service: IService, headers: Headers): Promise<boolean>;
  /**
   * Checks if service is enabled.
   * @param service IService object with related information to check
   */
  enabled(service: IService): Promise<boolean>;
  /**
   * Check if repository exists at origin. Can optionaly ignore empty repositories.
   * @param service IService object with related information to check
   */
  exists(service: IService): Promise<boolean>;
  /**
   * Process service indicated by hint, and return data from git.
   * @param service IService object with related information
   * @param headers HTTP headers received with request
   * @param messages Buffered messages to inform client
   */
  get(service: IService, headers: Headers, messages: Buffer[]): Promise<ISignalAcceptData>;
  /**
   * Initialise a bare repository at origin, but only if repository does not exist.
   * @param service IService object with related information
   */
  init(service: IService): Promise<boolean>;
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
   * Request body from client.
   */
  readonly body: Readable;
  /**
   * Requested capebilities client support/want.
   */
  readonly capabilities: Map<string, string>;
  /**
   * Low-level service driver
   */
  readonly driver: IServiceDriver;
  /**
   * Represents digest of generic uniform request.
   */
  readonly etag: string | false;
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

export interface IServiceOptions {
  /**
   * Digests etag for each request. Off by default.
   *
   * If you don't use etags, you can turn this off, witch in turn spares resources.
   */
  useEtag?: boolean;
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
   * Body for response.
   */
  body: Readable;
  /**
   * Reason for rejection.
   */
  reason: string;
}

const ServiceMap: Array<[RequestType, "GET" | "POST", RegExp, string]> = [
  [RequestType.AdvertiseUploadPack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-upload-pack$/, void 0],
  [RequestType.AdvertiseReceivePack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-receive-pack$/, void 0],
  [RequestType.UploadPack, 'POST',  /^\/?(.*?)\/git-upload-pack$/, 'application/x-git-upload-pack-request'],
  [RequestType.ReceivePack, 'POST',  /^\/?(.*?)\/git-receive-pack$/, 'application/x-git-receive-pack-request'],
];

const MetadataMap = new Map<RequestType, (service: Service) => (buffer: Buffer) => any>([
  [
    RequestType.ReceivePack,
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
          } else if ('0000000000000000000000000000000000000000' === results[2]) {
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
    RequestType.UploadPack,
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

function sortMetadata(a: IRequestPullData | IRequestPushData, b: IRequestPullData | IRequestPushData): number {
  // TODO: Make a predictable sort for metadata
  return 0;
}
