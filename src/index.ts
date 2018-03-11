import { ChildProcess, spawn } from 'child_process';
import * as encode from 'git-side-band-message';
import { Signal } from 'micro-signals';
import fetch, { Headers } from 'node-fetch';
import { Readable, Transform, Writable } from 'stream';
import { promisify } from 'util';
import { RequestStatus, ServiceErrorCode, ServiceType, SymbolSource } from './constants';
import { isDriver } from './driver';
import { ParseInput } from './transform';

export { Headers } from 'node-fetch';
export { RequestStatus, ServiceErrorCode, ServiceType, SymbolSource } from "./constants";
export { createDriver, createLocalDriver, createHttpDriver, createDriverCache, isDriver } from './driver';

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
  public readonly onAccept: Signal<IServiceAcceptData>;
  /**
   *
   */
  public readonly onReject: Signal<IServiceRejectData>;
  /**
   *
   */
  public readonly onError: Signal<Error>;
  /**
   * True if input is parsed.
   */
  public readonly ready: boolean;
  /**
   * Request status.
   */
  public readonly status: RequestStatus;
  /**
   * Service type
   */
  public readonly type: ServiceType;
  /**
   * Repository to work with.
   */
  public repository: string;

  private [SymbolSource]: ParseInput;
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
   *                   2) a key-value array, or 3) a plain object with headers as keys.
   * @param input Input (normally the request itself)
   *
   * @throws {TypeError}
   */
  constructor(driver: IServiceDriver, method: string, url_fragment: string,
              headers: Headers | string[] | {[index: string]: string},
              input: Readable) {
    if (!isDriver(driver)) {
      throw new TypeError('Driver must be a valid service driver');
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
        const advertise = service === ServiceType.Advertise;
        const service_name = results[3];
        if (!ValidServiceNames.has(service_name)) {
          this.onError.dispatch(new ServiceError({
            errorCode: ServiceErrorCode.InvalidServiceName,
            have: service_name,
            message: `Invalid service name '${service_name}'`,
            want: ValidServiceNames,
          }));
          break;
        }

        const expected_method = advertise ? 'GET' : 'POST';
        if (method !== expected_method) {
          this.onError.dispatch(new ServiceError({
            errorCode: ServiceErrorCode.InvalidMethod,
            have: method,
            message: `Invalid HTTP method used for service (${method} != ${expected_method})`,
            want: expected_method,
          }));
          break;
        }

        // Only check content type for post requests
        const content_type = this.__headers.get('Content-Type');
        const expected_content_type = `application/x-git-${service_name}-request`;
        if (!advertise && content_type !== expected_content_type) {
          this.onError.dispatch(new ServiceError({
            errorCode: ServiceErrorCode.InvalidContentType,
            have: content_type,
            message: `Invalid content type used for service (${content_type} != ${expected_content_type})`,
            want: expected_content_type,
          }));
          break;
        }

        this.__hint = this.driver.hint(...results.slice(2));
        this.repository = results[1];
        Object.defineProperties(this, {
          type: {
            value: service,
            writable: false,
          },
        });

        break;
      }
    }

    if ('type' in this && this.type !== ServiceType.Advertise) {
      const disposables: Array<() => void> = [];
      const onError = (ee, cb) => { ee.on('error', cb); disposables.push(() => ee.removeListener('error', cb)); };
      onError(input, (err) => this.onError.dispatch(err));

      const parser = this[SymbolSource] = new ParseInput(this);
      onError(parser, (err) => this.onError.dispatch(err));

      parser.done.then(() => {
        this.__ready = true;
        disposables.forEach((d) => d());
        disposables.length = 0;
      });
      Object.defineProperty(this, 'awaitReady', {
        value: parser.done,
        writable: false,
      });

      input.pipe(parser);
    } else {
      if (!('type' in this)) {
        Object.defineProperty(this, 'type', {
          value: ServiceType.Unknown,
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

    if (this.type === ServiceType.Unknown) {
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
    if (this.type === ServiceType.Unknown) {
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

export class ServiceError<T, U> extends Error {
  public errorCode: ServiceErrorCode;
  public have?: T;
  public want?: U;

  constructor(data: IServiceErrorData<T, U>) {
    super(data.message);
    this.have = data.have;
    this.errorCode = data.errorCode;
    this.want = data.want;
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
   * Driver cached responses. Optional.
   */
  readonly cache?: IServiceDriverCache;
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
  get(repository: string, hint: string, headers: Headers): Promise<IServiceAcceptData>;
  get(repository: string, hint: string, headers: Headers,
      input: Readable, messages: Buffer[]): Promise<IServiceAcceptData>;
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
 * Service driver cache interface. Stores responses from IServiceDriver.
 */
export interface IServiceDriverCache {
  /**
   * Clears all cached data.
   */
  clear();
  /**
   * Deletes an entry from cache.
   */
  delete(command: string, origin: string, repository: string): boolean;
  /**
   * Gets an entry from cache.
   */
  get<T>(command: string, origin: string, repository: string): T;
  /**
   * Checks if an entry exists in cache.
   */
  has(command: string, origin: string, repository: string): boolean;
  /**
   * Sets value for entry in cache.
   */
  set<T>(command: string, origin: string, repository: string, value: T);
}

/**
 * Contains data needed to fufill request.
 */
export interface IServiceAcceptData {
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
export interface IServiceRejectData {
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

export interface IServiceErrorData<T = undefined, U = undefined> {
  message: string;
  errorCode: ServiceErrorCode;
  want?: U;
  have?: T;
}

const ValidServiceNames = new Set(['receive-pack', 'upload-pack']);

const ServiceMap: Map<ServiceType, RegExp> = new Map([
  [ServiceType.Advertise, /^\/?(.*?)\/(info\/refs\?service=git-(.*))$/],
  [ServiceType.Pull, /^\/?(.*?)\/(git-(upload-pack))$/],
  [ServiceType.Push, /^\/?(.*?)\/(git-(receive-pack))$/],
]);
