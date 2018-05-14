import { OutgoingHttpHeaders } from "http";
import { Readable } from "stream";
import { DataSignal } from "./data-signal";
import { RequestStatus, ServiceType, SignalPriority } from './enums';
import { Headers } from "./headers";
import { LogicController } from "./logic-controller";
import { Signal, SymbolOnce, SymbolPriority } from "./signal";

/**
 * Async request data holder.
 */
export type RequestData = DataSignal<IRequestData>;

/**
 * Async response data holder.
 */
export type ResponseData = DataSignal<IResponseData>;

/**
 *
 */
export interface IService {
  /**
   * Async request data holder.
   */
  readonly request: RequestData;
  /**
   * Async response data holder.
   */
  readonly response: ResponseData;
  /**
   * Logic controller.
   */
  readonly controller: LogicController;
  /**
   * Serves request with default behavior and rules.
   */
  serve(): Promise<void>;
}

/**
 * Request data.
 */
export interface IRequestData {
  /**
   * Request data stream.
   */
  body: Readable;
  /**
   * Request headers.
   */
  headers: Headers;
  /**
   * Check if client only want advertisement from service.
   */
  isAdvertisement: boolean;
  /**
   * Service type.
   */
  service: ServiceType;
  /**
   * Request status.
   */
  status: RequestStatus;
  /**
   * Requested capebilities client support and/or want.
   */
  capabilities: Map<string, string>;
  /**
   * Requested commands for service.
   */
  commands: Array<IUploadPackCommand | IReceivePackCommand>;
  /**
   * Repository path for requested service.
   */
  repository: string;
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
 * Low-level service driver for working with git.
 */
export interface IGitDriver {
  /**
   * Checks access to service authenticated by headers for repository at origin.
   * @param request IService object with related information
   */
  checkForAccess(request: IRequestData, onResponse: IReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Checks if service is enabled for repository.
   * @param requestData IService object with related information
   */
  checkIfEnabled(requestData: IRequestData, onResponse: IReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Checks if repository exists at origin.
   * @param requestData IService object with related information
   */
  checkIfExists(requestData: IRequestData, onResponse: IReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Creates response data for request data.
   * @param requestData IService object with related information
   */
  createResponse(requestData: IRequestData, onResponse: IReadableSignal<IResponseData>): Promise<IGitDriverData>;
}

/**
 * Response data from driver
 */
export interface IGitDriverData {
  /**
   * Raw buffered response
   */
  body?: Buffer;
  /**
   * Status code. Uses HTTP Codes for compatibility.
   */
  statusCode: number;
  /**
   * Status message. Error message if status code is an HTTP error code.
   */
  statusMessage: string;
}

/**
 * Readable signal
 */
export interface IReadableSignal<P> {
  count: number;
  add(fn: ISignalHandle<P>, priority?: SignalPriority | number): void;
  addOnce(fn: ISignalHandle<P>, priority?: SignalPriority | number): void;
  has(fn: ISignalHandle<P> | SignalPriority | number): number;
  remove(fn: ISignalHandle<P> | SignalPriority | number): number;
  clear(): number;
}

/**
 * Writable signal
 */
export interface IWritableSignal<P> {
  dispatch(payload: P): Promise<void>;
}

/**
 * Signal handler
 */
export interface ISignalHandle<P> {
  /**
   * Call signature
   */
  (payload: P): any;
  /**
   * Signals to distach from after use.
   */
  [SymbolOnce]?: Set<Signal<P>>;
  /**
   * Priorities for different signals.
   */
  [SymbolPriority]?: Map<Signal<P>, number>;
}
