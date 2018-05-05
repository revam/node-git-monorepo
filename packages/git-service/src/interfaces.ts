import { Readable } from "stream";
import { RequestStatus, RequestType } from "./enums";

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
 * Contains information of what client want to retrive from this upload-pack service request.
 */
export interface IUploadPackData {
  /**
   * Upload-pack command type.
   */
  kind: "want" | "have";
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
  kind: "create" | "update" | "delete";
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
