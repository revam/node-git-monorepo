import { OutgoingHttpHeaders } from "http";
import { Readable } from "stream";
import { RequestStatus, RequestType } from "./enums";
import { HeadersInput } from './headers';

/**
 * Request data.
 */
export interface IRequestData {
  /**
   * Requested capebilities client support and/or want.
   */
  capabilities: Map<string, string>;
  /**
   * Requested commands for service.
   */
  commands: Array<IUploadPackCommand | IReceivePackCommand>;
}

/**
 * Response data.
 */
export interface IResponseData {
  /**
   * Response body.
   */
  body: Buffer;
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
 * Response data from driver
 */
export interface IResponseRawData {
  /**
   * Status code. Uses HTTP Codes for compatibility.
   */
  statusCode: number;
  /**
   * Status message. Error message if status code is an error code.
   */
  statusMessage: string;
  /**
   * Additional headers for response.
   */
  headers?: OutgoingHttpHeaders;
  /**
   * Raw buffered response
   */
  body?: Buffer;
}

/**
 * Contains information of what client want to retrive from this upload-pack
 * service request.
 */
export interface IUploadPackCommand {
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
export interface IReceivePackCommand {
  /**
   * Receive-pack command type.
   */
  kind: "create" | "update" | "delete";
  /**
   * First child is old commit sha-hash, second is new commit sha-hash.
   */
  commits: [string, string];
  /**
   * Reference path. Can be any segmented path, but usually starting with either
   * "heads" or "tags".
   */
  reference: string;
}

/**
 * Sync and async signal interface.
 */
export interface ISignal<P> {
  /**
   * Number of active listeners.
   */
  readonly count: number;
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
   * Number of headers in object.
   */
  readonly count: number;
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
  set(header: string, value: number | string | string[]): void;
  /**
   * Appends value onto existing header, creating it if not.
   * @param header Header name
   * @param value Header value to append
   */
  append(header: string, value: number | string | string[]): void;
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
  /**
   * Convert data to a JSON-friendly format.
   */
  toJSON(key?: PropertyKey): OutgoingHttpHeaders;
}

/**
 * Service Input data
 */
export interface IServiceInput {
  /**
   * Input body
   */
  body: Readable;
  /**
   * Input headers
   */
  headers?: HeadersInput;
  /**
   * Service requested is advertisement only.
   */
  isAdvertisement: boolean;
  /**
   * Repository path.
   */
  repository: string;
  /**
   * Service request type.
   */
  requestType: RequestType;
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
   * Resolves when request data is ready. If any errors occurred it will throw
   * the first error.
   */
  readonly awaitRequestData: Promise<IRequestData>;
  /**
   * Resolves when response data is ready. If any errors occurred it will throw
   * the first error.
   */
  readonly awaitResponseData: Promise<IResponseData>;

  /**
   * Check if client only want advertisement from service.
   */
  readonly isAdvertisement: boolean;

  /**
   * Checks if repository exists.
   */
  checkIfExists(): Promise<boolean>;
  /**
   * Checks if service is enabled.
   * We can still *atempt* a forcefull use of service.
   */
  checkIfEnabled(): Promise<boolean>;
  /**
   * Checks access rights to service.
   * Depends on driver implementation.
   */
  checkForAccess(): Promise<boolean>;

  /**
   * Creates a uniform signature for request data, response data, or both.
   * @param type Signature type. Default type is `"request"`.
   */
  createSignature(type?: "request" | "response" | "shared"): Promise<string>;
  /**
   * Creates and initialises a new repository, but only if nonexistant.
   * Return value indicate a new repo.
   */
  createAndInitRepository(): Promise<boolean>;

  /**
   * Dispatched when any error ocurr.
   */
  readonly onError: ISignal<any>;
  /**
   * Dispatched with request data when data is ready.
   */
  readonly onRequest: ISignal<IRequestData>;
  /**
   * Dispatched with response data when data is ready.
   */
  readonly onResponse: ISignal<IResponseData>;

  /**
   * Raw request body or a stream leading to the raw body.
   */
  readonly body: Readable;
  /**
   * Requested service type.
   */
  readonly type: RequestType;
  /**
   * Response status.
   */
  readonly status: RequestStatus;
  /**
   * Repository path for requested service.
   */
  repository: string;

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   */
  accept(): Promise<void>;
  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   * @param statusCode 4xx or 5xx http status code for rejection.
   *                   Default is `403`.
   * @param statusMessage Optional reason for rejection.
   *                      Default is status message for status code.
   */
  reject(statusCode?: number, statusMessage?: string): Promise<void>;
  /**
   * Inform client of message, but only if service is accepted and not a
   * failure.
   * @param message Message to inform client
   */
  sidebandMessage(message: string | Buffer): this;
}

/**
 * Low-level service driver for working with git.
 */
export interface IServiceDriver {
  /**
   * Repositories origin location - for reference only. Dependent of driver
   * implementation.
   */
  readonly origin?: string;
  /**
   * Checks access to service authenticated by headers for repository at origin.
   * @param service IService object with related information
   * @param headers HTTP headers received with request
   */
  checkForAccess(service: IService, headers: IHeaders): Promise<boolean>;
  /**
   * Checks if service is enabled for repository.
   * @param service IService object with related information
   */
  checkIfEnabled(service: IService): Promise<boolean>;
  /**
   * Checks if repository exists at origin.
   * @param service IService object with related information
   */
  checkIfExists(service: IService): Promise<boolean>;
  /**
   * Create a response for service request.
   * @param service IService object with related information
   * @param headers HTTP headers received with request
   * @param messages Buffered messages to inform client
   */
  createResponse(service: IService, headers: IHeaders): Promise<IResponseRawData>;
  /**
   * Creates and initialise a new repository at origin, but only if repository does not exist.
   * @param service IService object with related information
   * @param headers HTTP headers received with request
   */
  createAndInitRespository(service: IService, headers: IHeaders): Promise<boolean>;
}
