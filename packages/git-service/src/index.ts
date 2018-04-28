/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 *
 * @module git-service
 */
import { createHash } from 'crypto';
import { createPacketInspectStream, createPacketReadableStream } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { STATUS_CODES } from "http";
import { Signal } from 'micro-signals';
import { Headers } from 'node-fetch';
import { Readable, Transform } from 'stream';

/**
 * Reference IService implementation.
 */
export default class implements IService {
  public readonly driver: IServiceDriver;
  public readonly awaitRequestReady: Promise<void>;
  public readonly awaitResponseReady: Promise<IResponseData>;
  public readonly isAdvertisement: boolean;
  public readonly isRequestReady: boolean;
  public readonly isResponseReady: boolean;
  public readonly onError: Signal<any>;
  public readonly onResponse: Signal<IResponseData>;
  public readonly requestBody: Readable;
  public readonly requestCapabilities: Map<string, string>;
  public readonly requestData: Array<IUploadPackData | IReceivePackData>;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
  public repository: string;
  private __headers: Headers;
  private __messages: Buffer[];
  private __status: RequestStatus;
  private __readyRequest: boolean;
  private __readyResponse: boolean;

  /**
   * Accepts 5 arguments and will throw if it is supplied the wrong type or to few arguments.
   *
   * @param driver Service driver to use.
   * @param method Upper-case HTTP method for request.
   * @param url Incoming URL or tail snippet. Will extract repository from here when possible.
   * @param headers Request headers supplied as: 1) an instance of [Headers](.),
   *                2) a key-value array, or 3) a plain object with headers as keys.
   * @param body Input (normally the request itself)
   *
   * @throws {TypeError}
   */
  constructor(
    driver: IServiceDriver,
    method: string,
    url: string,
    headers: Headers | Array<[string, string]> | {[index: string]: string | string[]},
    body: Readable,
  ) {
    if (!checkServiceDriver(driver)) {
      throw new TypeError('argument `driver` must be a valid service driver interface');
    }
    if (typeof method !== 'string' || !method) {
      throw new TypeError('argument `method` must be a valid string');
    }
    if (typeof url !== 'string' || !url) {
      throw new TypeError('argument `url_fragment` must be a valid string');
    }
    if (!(
      headers instanceof Headers ||
      headers instanceof Array && headers.length !== 0 ||
      typeof headers === 'object' && Reflect.ownKeys(headers).length !== 0
    )) {
      throw new TypeError('argument `in_headers` must be either a Headers object, a string array or headers object');
    }
    if (!(body instanceof Readable)) {
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
    this.__readyRequest = false;
    this.__readyResponse = false;
    Object.defineProperties(this, {
      driver: {
        value: driver,
        writable: false,
      },
      isRequestReady: {
        get() { return this.__readyRequest; },
      },
      isResponseReady: {
        get() { return this.__readyResponse; },
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
      onResponse: {
        value: new Signal(),
        writable: false,
      },
      requestCapabilities: {
        value: new Map(),
        writable: false,
      },
      requestData: {
        value: [],
        writable: false,
      },
      status: {
        get() { return this.__status; },
      },
    });
    Object.defineProperties(this, {
      awaitResponseReady: {
        value: new Promise<IResponseData>((resolve, reject) => {
          this.onError.addOnce(reject);
          this.onResponse.addOnce(() => this.__readyResponse = true);
          this.onResponse.addOnce(resolve);
        }),
        writable: false,
      },
    });
    for (const [service, expected_method, regex, expected_content_type] of Services) {
      const results = regex.exec(url);
      if (results) {
        const advertisement = !expected_content_type;
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
        Object.defineProperties(this, {
          isAdvertisement: {
            enumerable: true,
            value: advertisement,
            writable: false,
          },
          type: {
            enumerable: true,
            value: service,
            writable: false,
          },
        });
        break;
      }
    }
    if (!('type' in this)) {
      Object.defineProperties(this, {
        isAdvertisement: {
          enumerable: true,
          value: false,
          writable: false,
        },
        type: {
          enumerable: true,
          value: undefined,
          writable: false,
        },
      });
    }
    if ("isAdvertisement" in this && !this.isAdvertisement) {
      const disposables: Array<() => void> = [];
      const onError = (ee, cb) => { ee.on('error', cb); disposables.push(() => ee.removeListener('error', cb)); };
      onError(body, (err) => this.onError.dispatch(err));
      const middleware = PacketMapper.get(this.type);
      const [parser, awaitReady] = createPacketInspectStream(middleware(this));
      onError(parser, (err) => this.onError.dispatch(err));
      Object.defineProperties(this, {
        awaitRequestReady: {
          value: awaitReady.then(() => {
            this.__readyRequest = true;
            disposables.forEach((d) => d());
            disposables.length = 0;
          }),
          writable: false,
        },
        requestBody: {
          value: parser,
          writable: false,
        },
      });
      body.pipe(parser);
    } else {
      this.__readyRequest = true;
      Object.defineProperties(this, {
        awaitRequestReady: {
          value: Promise.resolve(),
          writable: false,
        },
        requestBody: {
          value: body,
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
    if (!this.type) {
      return;
    }
    try {
      const output = await this.driver.createResponse(this, this.__headers, this.__messages);
      if (output.statusCode >= 400) {
        this.__status = RequestStatus.Failure;
      }
      // Schedule dispatch for next loop
      this.dispatchResponse(output);
    } catch (err) {
      this.onError.dispatch(err);
    }
  }

  public async reject(statusCode?: number, statusMessage?: string): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }
    this.__status = RequestStatus.Rejected;
    if (!(statusCode < 600 && statusCode >= 400)) {
      statusCode = 403;
    }
    if (!(statusMessage && typeof statusMessage === 'string')) {
      statusMessage = STATUS_CODES[statusCode] || '';
    }
    const buffer = Buffer.from(statusMessage);
    const body = createPacketReadableStream([buffer]);
    const headers = new Headers();
    headers.set('Content-Type', 'text/plain');
    headers.set('Content-Length', buffer.length.toString());
    this.dispatchResponse({
      headers,
      statusCode,
      statusMessage,
      async buffer() { return Buffer.from(buffer); },
      stream() { return createPacketReadableStream([buffer]); },
    });
  }

  /**
   * Schedule payload dispatchment for next event loop.
   * @param payload Payload to dispatch
   */
  private dispatchResponse(payload: IResponseData) {
    setImmediate(() => { try { this.onResponse.dispatch(payload); } catch (err) { this.onError.dispatch(err); } });
  }

  public async checkIfExists(): Promise<boolean> {
    try {
      return await this.driver.checkIfExists(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async checkIfEnabled(): Promise<boolean> {
    if (!this.type) {
      return false;
    }
    try {
      return await this.driver.checkIfEnabled(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async checkForAccess(): Promise<boolean> {
    if (!this.type) {
      return false;
    }
    try {
      return await this.driver.checkForAccess(this, this.__headers);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async createAndInitRepository(): Promise<boolean> {
    try {
      return await this.driver.createAndInitRespository(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async createRequestSignature(): Promise<string> {
    if (!this.type) {
      return;
    }
    if (!this.isAdvertisement) {
      await this.awaitRequestReady;
    }
    const hash = createHash("sha256");
    hash.update(this.repository);
    hash.update(this.type);
    const metadata = this.requestData.slice().sort(sortMetadata).map((m) => JSON.stringify(m));
    hash.update(metadata.join(","));
    const capabilities = Array.from(this.requestCapabilities).sort(sortCapabilities).map((a) => a.join("="));
    hash.update(capabilities.join(","));
    return hash.digest("hex");
  }

  public async createResponseSignature(): Promise<string> {
    if (!this.type) {
      return;
    }
    const response = await this.awaitResponseReady;
    const hash = createHash("sha256");
    hash.update(response.statusCode.toString());
    hash.update(response.statusMessage);
    hash.update(await response.buffer());
    return hash.digest("hex");
  }

  public informClient(message: string | Buffer) {
    this.__messages.push(encode(message));
    return this;
  }
}

/**
 * Request service type.
 */
export enum RequestType {
  /**
   * Request the use of upload-pack service.
   */
  UploadPack = "UploadPack",
  /**
   * Request the use of receive-pack service.
   */
  ReceivePack = "ReceivePack",
}

/**
 * Request service status.
 */
export enum RequestStatus {
  /**
   * Indicate the service is still pending.
   */
  Pending = 0,
  /**
   * Indicate the service was accepted.
   */
  Accepted = 1,
  /**
   * Indocate the service was rejected.
   */
  Rejected = 2,
  /**
   * Indicate the service was initially accepted, but failed to fetch result for service.
   *
   * Combination of flags Accepted and Rejected. (1 | 2 -> 3)
   */
  Failure = 3,
}

/**
 * Reference business logic in line with the spec. as defined in the the technical documentation.
 *
 * See https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt for more info.
 */
export async function serveRequest(
  service: IService,
  createAndInitNonexistant: boolean = false,
): Promise<IResponseData> {
  if (! await service.checkIfExists()) {
    // should we skip creation of resource?
    if (!createAndInitNonexistant) {
      service.reject(404); // 404 Not Found
      return service.awaitResponseReady;
    }
    if (! await service.createAndInitRepository()) {
      service.reject(500, "Could not initialize new repository");
      return service.awaitResponseReady;
    }
  }
  if (! await service.checkForAccess()) {
    service.reject(401); // 401 Unauthorized
  } else if (! await service.checkIfEnabled()) {
    service.reject(403); // 403 Forbidden
  } else {
    service.accept();
  }
  return service.awaitResponseReady;
}

/**
 * Checks if candidateDriver is a valid service driver.
 * @param candidateDriver Driver candidate
 */
export function checkServiceDriver(candidateDriver: any): candidateDriver is IServiceDriver {
  return typeof candidateDriver === 'object' &&
    'checkForAccess' in candidateDriver && typeof candidateDriver.checkForAccess === 'function' &&
    'checkIfEnabled' in candidateDriver && typeof candidateDriver.checkIfEnabled === 'function' &&
    'checkIfExists' in candidateDriver && typeof candidateDriver.checkIfExists === 'function' &&
    'getResponse' in candidateDriver && typeof candidateDriver.getResponse === 'function' &&
    'createAndInitRepository' in candidateDriver && typeof candidateDriver.createAndInitRepository === 'function';
}

/**
 * Contains information of what client want to retrive from this upload-pack service request.
 */
export interface IUploadPackData {
  /**
   * Upload-pack command type.
   */
  kind: 'want' | 'have';
  /**
   * Commit. In plural form for compatibility with IRequestPushData.
   */
  commits: [string];
}

/**
 * Contains information of what client want to upload in a receive-pack request.
 */
export interface IReceivePackData {
  /**
   * Receive-pack command type.
   */
  kind: 'create' | 'update' | 'delete';
  /**
   * First child is old commit sha-hash, second is new commit sha-hash.
   */
  commits: [string, string];
  /**
   * Reference path. Can be any segmented path, but usually starting with either 'heads' or 'tags'.
   */
  reference: string;
}

/**
 * Low-level service driver for working with git.
 */
export interface IServiceDriver {
  /**
   * Repositories origin location - for reference only. Dependent of driver implementation.
   */
  readonly origin?: string;
  /**
   * Checks access to service authenticated by headers for repository at origin.
   * @param service IService object with related information to check
   * @param headers Headers to check for access rights
   */
  checkForAccess(service: IService, headers: Headers): Promise<boolean>;
  /**
   * Checks if service is enabled for repository.
   * @param service IService object with related information to check
   */
  checkIfEnabled(service: IService): Promise<boolean>;
  /**
   * Checks if repository exists at origin.
   * @param service IService object with related information to check
   */
  checkIfExists(service: IService): Promise<boolean>;
  /**
   * Create a response for service request.
   * @param service IService object with related information
   * @param headers HTTP headers received with request
   * @param messages Buffered messages to inform client
   */
  createResponse(service: IService, headers: Headers, messages: Buffer[]): Promise<IResponseData>;
  /**
   * Creates and initialise a bare repository at origin, but only if repository does not exist.
   * @param service IService object with related information
   */
  createAndInitRespository(service: IService): Promise<boolean>;
}

/**
 * High-level git service interface.
 */
export interface IService {
  /**
   * Service driver - doing the heavy-lifting for us.
   */
  readonly driver: IServiceDriver;

  /**
   * Resolves when request body has been read.
   */
  readonly awaitRequestReady: Promise<void>;
  /**
   * Resolves when response is ready for request. If any errors occurred it will throw the first error.
   */
  readonly awaitResponseReady: Promise<IResponseData>;

  /**
   * Check if client only want advertisement from service.
   */
  readonly isAdvertisement: boolean;
  /**
   * Check if request data has been read and is ready for use.
   */
  readonly isRequestReady: boolean;
  /**
   * Check if response is ready.
   */
  readonly isResponseReady: boolean;

  /**
   * Checks if repository exists.
   */
  checkIfExists(): Promise<boolean>;
  /**
   * Checks if service is enabled. (we can still atempt a forcefull use of service)
   */
  checkIfEnabled(): Promise<boolean>;
  /**
   * Checks access to service as indicated by driver.
   */
  checkForAccess(): Promise<boolean>;

  /**
   * Creates a predictable uniform signature for response status code and body.
   */
  createResponseSignature(): Promise<string>;
  /**
   * Creates a predictable uniform signature for request data, independent of agent used.
   */
  createRequestSignature(): Promise<string>;
  /**
   * Creates and initialises a new repository, but only if nonexistant. Return value indicate a new repo.
   */
  createAndInitRepository(): Promise<boolean>;

  /**
   * Dispatched when any error ocurr. Dispatched payload may be anything.
   */
  readonly onError: ISignal<any>;
  /**
   * Dispatched with response data when ready.
   */
  readonly onResponse: ISignal<IResponseData>;

  /**
   * Requested capebilities client support and/or want.
   */
  readonly requestCapabilities: Map<string, string>;
  /**
   * Request data for service.
   */
  readonly requestData: Array<IUploadPackData | IReceivePackData>;
  /**
   * Raw request body. May have been altered before it was given to service.
   */
  readonly requestBody: Readable;
  /**
   * Requested service type.
   */
  readonly type: RequestType;
  /**
   * Response status.
   */
  readonly status: RequestStatus;
  /**
   * Repository path requested.
   */
  repository: string;
  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   */
  accept(): Promise<void>;
  /**
   * Rejects request with status code and an optional status message. Only works with status error codes.
   * @param statusCode 4xx or 5xx http status code for rejection. Defaults to `403`.
   * @param statusMessage Optional reason for rejection. Defaults to status message for status code.
   */
  reject(statusCode?: number, statusMessage?: string): Promise<void>;
  /**
   * Inform client of message, but only if service is accepted.
   * @param message Message to inform client
   */
  informClient(message: string | Buffer): this;
}

/**
 * Simple signal interface compatible with most implementions.
 */
export interface ISignal<T> {
  /**
   * Adds a listener that listens till removed.
   * @param listener Listener to add
   */
  add(listener: (payload: T) => any): void;
  /**
   * Adds a listener that only listens once.
   * @param listener Listener to add
   */
  addOnce(listener: (payload: T) => any): void;
  /**
   * Dispatches payload to all listeners.
   * @param payload Payload to dispatch
   */
  dispatch(payload: T): void;
  /**
   * Removes a listener.
   * @param listener Listener to remote
   */
  remove(listener: (payload: T) => any): void;
}

/**
 * Response data for request.
 */
export interface IResponseData {
  /**
   * Process response and return response body as a buffer when done.
   */
  buffer(): Promise<Buffer>;
  /**
   * Creates a new readable stream of response body.
   */
  stream(): Readable;
  /**
   * Response headers.
   */
  headers: Headers;
  /**
   * Response status code.
   */
  statusCode: number;
  /**
   * Response status message.
   */
  statusMessage: string;
}

/**
 * Maps request url to vaild services.
 */
const Services: Array<[RequestType, "GET" | "POST", RegExp, string]> = [
  [RequestType.UploadPack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-upload-pack$/, void 0],
  [RequestType.ReceivePack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-receive-pack$/, void 0],
  [RequestType.UploadPack, 'POST',  /^\/?(.*?)\/git-upload-pack$/, 'application/x-git-upload-pack-request'],
  [RequestType.ReceivePack, 'POST',  /^\/?(.*?)\/git-receive-pack$/, 'application/x-git-receive-pack-request'],
];

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const PacketMapper = new Map<RequestType, (service: IService) => (buffer: Buffer) => any>([
  [
    RequestType.ReceivePack,
    (service) => {
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString('utf8');
        const results = regex.exec(value);
        if (results) {
          let kind: 'create' | 'delete' | 'update';
          if ('0000000000000000000000000000000000000000' === results[1]) {
            kind = 'create';
          } else if ('0000000000000000000000000000000000000000' === results[2]) {
            kind = 'delete';
          } else {
            kind = 'update';
          }
          const metadata: IReceivePackData = {
            commits: [results[1], results[2]],
            kind,
            reference: results[3],
          };
          service.requestData.push(metadata);
          if (results[4]) {
            for (const c of results[4].trim().split(' ')) {
              if (/=/.test(c)) {
                const [k, v] = c.split('=');
                service.requestCapabilities.set(k, v);
              } else {
                service.requestCapabilities.set(c, undefined);
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
          const metadata: IUploadPackData = {
            commits: [results[2]],
            kind: results[1] as ('want' | 'have'),
          };
          service.requestData.push(metadata);
          if (results[3]) {
            for (const c of results[3].trim().split(' ')) {
              if (/=/.test(c)) {
                const [k, v] = c.split('=');
                service.requestCapabilities.set(k, v);
              } else {
                service.requestCapabilities.set(c, undefined);
              }
            }
          }
        }
      };
    },
  ],
]);

/**
 * Sort metadata in uniform order.
 * @param a Data pack A
 * @param b Data pack B
 */
function sortMetadata(a: IUploadPackData | IReceivePackData , b: IUploadPackData | IReceivePackData): number {
  // TODO: Make a predictable sort for metadata
  return 0;
}

/**
 * Sort capabilities in uniform order.
 * @param a Capability a
 * @param b Capability b
 */
function sortCapabilities(a: [string, string], b: [string, string]): number {
  // TODO: Make a predictable sort for metadata
  return 0;
}
