/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */

import { createHash } from 'crypto';
import { createPacketInspectStream, createPacketReadableStream } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { STATUS_CODES } from "http";
import { Readable } from 'stream';

/**
 * Reference implementation of IService. Works with all valid driver implementation.
 */
export default class Service implements IService {
  public readonly driver: IServiceDriver;
  public readonly awaitRequestReady: Promise<void>;
  public readonly awaitResponseReady: Promise<IResponseData>;
  public readonly isAdvertisement: boolean;
  public readonly isRequestReady: boolean;
  public readonly isResponseReady: boolean;
  public readonly onError: ISignal<any>;
  public readonly onResponse: ISignal<IResponseData>;
  public readonly requestBody: Readable;
  public readonly requestCapabilities: Map<string, string>;
  public readonly requestData: Array<IUploadPackData | IReceivePackData>;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
  public repository: string;
  private __headers: IHeaders;
  private __messages: Buffer[];
  private __readyRequest: boolean;
  private __readyResponse: boolean;
  private __repository?: string;
  private __signatureRequest?: string;
  private __signatureResponse?: string;
  private __status: RequestStatus;

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
    headers: HeadersInput,
    body: Readable,
  ) {
    inspectServiceDriver(driver);
    if (typeof method !== 'string' || !method) {
      throw new TypeError('argument `method` must be a valid string');
    }
    if (typeof url !== 'string' || !url) {
      throw new TypeError('argument `url_fragment` must be a valid string');
    }
    if (!(body instanceof Readable)) {
      throw new TypeError('argument `input` must be s sub-instance of stream.Readable');
    }
    this.__headers = new Headers(headers);
    this.__messages = [];
    this.__status = RequestStatus.Pending;
    this.__readyRequest = false;
    this.__readyResponse = false;
    this.__repository = undefined;
    this.__signatureRequest = undefined;
    this.__signatureResponse = undefined;
    Object.defineProperties(this, {
      driver: {
        value: driver,
        writable: false,
      },
      isRequestReady: {
        get() {
          return this.__readyRequest;
        },
      },
      isResponseReady: {
        get() {
          return this.__readyResponse;
        },
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
      onResponse: {
        value: new Signal(),
        writable: false,
      },
      repository: {
        get() {
          return this.__repository;
        },
        set(value) {
          if (this.__repository !== value) {
            this.__signatureRequest = undefined;
            this.__repository = value;
          }
        },
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
        get() {
          return this.__status;
        },
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
        this.__repository = results[1];
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
    setImmediate(async() => {
      try {
        await this.onResponse.dispatch(payload);
      } catch (err) {
        await this.onError.dispatch(err);
      }
    });
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
    if (this.__signatureRequest) {
      return this.__signatureRequest;
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
    return this.__signatureRequest = hash.digest("hex");
  }

  public async createResponseSignature(): Promise<string> {
    if (!this.type) {
      return;
    }
    if (this.__signatureResponse) {
      return this.__signatureResponse;
    }
    const response = await this.awaitResponseReady;
    const hash = createHash("sha256");
    hash.update(response.statusCode.toString());
    hash.update(response.statusMessage);
    response.headers.forEach((header, value) => hash.update(`${header}: ${value}`));
    hash.update(await response.buffer());
    return this.__signatureResponse = hash.digest("hex");
  }

  public informClient(message: string | Buffer) {
    this.__messages.push(encode(message));
    return this;
  }
}

/**
 * Valid inputs for Headers class constructor
 */
export type HeadersInput = Headers | Map<string, string[]> | string[][] | {[key: string]: string | string[]};

/**
 * Simple class implementing IHeaders
 */
export class Headers implements IHeaders {
  private __raw: Map<string, string[]>;
  constructor(input?: HeadersInput) {
    if (input instanceof Headers || input instanceof Map) {
      this.__raw = new Map(input);
    } else {
      this.__raw = new Map();
      if (input instanceof Array && input.length > 1) {
        for (const [header, ...values] of input) {
          for (const value of values) {
            this.append(header, value);
          }
        }
      } else if (typeof input === "object") {
        for (const header of Object.keys(input)) {
          const values = input[header];
          if (values instanceof Array) {
            for (const value of values) {
              this.append(header, value);
            }
          } else {
            this.append(header, values);
          }
        }
      }
    }
  }
  public get(header) { return this.__raw.get(sanitizeHeader(header))!.join(','); }
  public set(header, value) { this.__raw.set(sanitizeHeader(header), [value]); }
  public has(header) { return this.__raw.has(sanitizeHeader(header)); }
  public delete(header) { return this.__raw.delete(sanitizeHeader(header)); }
  public append(header, value) { this.__raw.get(sanitizeHeader(header))!.push(value); }
  public forEach<T>(fn, thisArg) { this.__raw.forEach((v, k) => fn.call(thisArg, k, v)); }
  public keys() { return this.__raw.keys(); }
  public values() { return this.__raw.values(); }
  public entries() { return this.__raw.entries(); }
  public [Symbol.iterator]() { return this.__raw.entries(); }
}

const SymbolSignals = Symbol("signals");

/**
 * Simple class implementing ISignal
 */
export class Signal<P> implements ISignal<P> {
  private __raw: Set<(payload: P) => void | PromiseLike<void>>;
  constructor() {
    this.__raw = new Set();
  }

  public add(fn: (payload: P) => void | PromiseLike<void>): void {
    this.__raw.add(fn);
    if (fn[SymbolSignals] && fn[SymbolSignals].has(this)) {
      (fn[SymbolSignals] as Set<Signal<any>>).delete(this);
    }
  }

  public addOnce(fn: (payload: P) => void | PromiseLike<void>): void {
    if (!(SymbolSignals in fn)) {
      fn[SymbolSignals] = new Set();
    }
    (fn[SymbolSignals] as Set<Signal<any>>).add(this);
    this.__raw.add(fn);
  }

  public has(fn: (payload: P) => void | PromiseLike<void>): boolean {
    return this.__raw.has(fn);
  }

  public delete(fn: (payload: P) => void | PromiseLike<void>): boolean {
    return this.__raw.delete(fn);
  }

  public async dispatch(payload: P): Promise<void> {
    const stack = Array.from(this.__raw);
    // Remove singular listeners from stack
    stack.forEach((fn) => {
      if (fn[SymbolSignals] && fn[SymbolSignals].has(this)) {
        fn[SymbolSignals].delete(this);
        this.__raw.delete(fn);
      }
    });
    await Promise.all(stack.map(async(fn) => { await fn.call(void 0, payload); }));
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
 * Symbol used to check if candidate has been checked previously.
 */
const SymbolChecked = Symbol("checked");

/**
 * Inspects candidate for any missing or invalid methods from `IServiceDriver`,
 * and throws an error if found. Will only check the same candidate once if
 * no errors was found.
 * @param candidate Service driver candidate
 * @throws {TypeError}
 */
export function inspectServiceDriver(candidate: any): candidate is IServiceDriver {
  if (SymbolChecked in candidate) {
    return true;
  }

  if (typeof candidate !== "object") {
    throw new TypeError("Candidate is not an object primitive type");
  }

  if (!("checkForAccess" in candidate) || typeof candidate.checkForAccess !== "function") {
    throw new TypeError("Candidate is missing method 'checkForAccess'");
  }

  if (candidate.checkForAccess.length !== 2) {
    throw new TypeError("Method 'checkForAccess' on candidate has invalid call signature");
  }

  if (!("checkIfEnabled" in candidate) || typeof candidate.checkIfEnabled !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfEnabled'");
  }

  if (candidate.checkIfEnabled.length !== 1) {
    throw new TypeError("Method 'checkIfEnabled' on candidate has invalid call signature");
  }

  if (!("checkIfExists" in candidate) || typeof candidate.checkIfExists !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfExists'");
  }

  if (candidate.checkIfExists.length !== 1) {
    throw new TypeError("Method 'checkIfExists' on candidate has invalid call signature");
  }

  if (!("createResponse" in candidate) || typeof candidate.createResponse !== "function") {
    throw new TypeError("Candidate driver is missing valid method 'createResponse'");
  }

  if (candidate.createResponse.length !== 3) {
    throw new TypeError("Method 'createResponse' on candidate has invalid call signature");
  }

  if (!("createAndInitRepository" in candidate) || typeof candidate.createAndInitRepository !== "function") {
    throw new TypeError("Candidate is missing method 'createAndInitRepository'");
  }

  if (candidate.createAndInitRepository.length !== 1) {
    throw new TypeError("Method 'createAndInitRepository' on candidate has invalid call signature");
  }

  candidate[SymbolChecked] = undefined;
  return true;
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
  checkForAccess(service: IService, headers: IHeaders): Promise<boolean>;
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
  createResponse(service: IService, headers: IHeaders, messages: Buffer[]): Promise<IResponseData>;
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
 * Sync and async signal interface.
 */
export interface ISignal<P> {
  /**
   * Adds a listener that listens till removed.
   * @param fn Listener to add
   */
  add(fn: (payload: P) => any): void;
  /**
   * Adds a listener that only listens once.
   * @param fn Listener to add
   */
  addOnce(fn: (payload: P) => any): void;
  /**
   * Removes a listener.
   * @param fn Listener to remote
   */
  delete(fn: (payload: P) => any): boolean;
  /**
   * Dispatches payload to all listener and waits till all finish.
   * Throws if one of the listeners encounter an error.
   * @param payload Payload to dispatch
   */
  dispatch(payload: P): Promise<void>;
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
  headers: IHeaders;
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
 * simple headers holder
 */
export interface IHeaders  {
  /**
   * Returns value under key from internal collection.
   * @param header Header name
   */
  get(header: string): string;
  /**
   * Sets value under key in internal collection
   * @param header   Header name
   * @param value  Header value to set
   */
  set(header: string, value: string): void;
  /**
   * Appends value onto existing header, creating it if not.
   * @param header Header name
   * @param value Header value to append
   */
  append(header: string, value: string): void;
  /**
   * Checks if header name exists
   * @param header Header name
   */
  has(header: string): boolean;
  /**
   * Deletes header and accossiated values.
   * @param header Header name
   */
  delete(header: string): boolean;
  /**
   * Iterates over each header-value pair. If multiple headers
   * @param fn Callback
   * @param thisArg Value of `this` in `fn`
   */
  forEach<T = undefined>(fn: (this: T, header: string, value: string[]) => any, thisArg?: T): void;
  /**
   * Returns an iterator for the header names.
   */
  keys(): IterableIterator<string>;
  /**
   * Returns an iterator for the values of each header.
   */
  values(): IterableIterator<string[]>;
  /**
   * Returns an iterator for the header and values in pairs.
   */
  entries(): IterableIterator<[string, string[]]>;
  /**
   * Returns an iterator for the header and values in pairs.
   */
  [Symbol.iterator](): IterableIterator<[string, string[]]>;
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

function sanitizeHeader(header: string) {
  header += "";
  if (!/^[^_`a-zA-Z\-0-9!#-'*+.|~]*$/.test(header)) {
    throw new TypeError(`${header} is not a legal HTTP header name`);
  }
  return header.toLowerCase();
}

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
