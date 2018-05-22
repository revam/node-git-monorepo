import { ReadableSignal } from "micro-signals";
import { Readable } from "stream";
import { RequestStatus, ServiceType } from './enums';
import { Headers } from "./headers";
import { LogicController } from "./logic-controller";

/**
 *
 */
export interface IService {
  /**
   * Resolves when request is ready.
   */
  readonly request: Promise<IRequestData>;
  /**
   * Resolves when response is ready.
   */
  readonly response: Promise<IResponseData>;
  /**
   * Dispatched if any errors occurr while serving.
   */
  readonly onError: ReadableSignal<any>;
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
  readonly body: Readable;
  /**
   * Request headers.
   */
  readonly headers: Headers;
  /**
   * Check if client only want advertisement from service.
   */
  readonly isAdvertisement: boolean;
  /**
   * Service type.
   */
  readonly service: ServiceType;
  /**
   * Request status.
   */
  status: RequestStatus;
  /**
   * Requested capebilities client support and/or want.
   */
  readonly capabilities: Map<string, string>;
  /**
   * Requested commands for service.
   */
  readonly commands: Array<IUploadPackCommand | IReceivePackCommand>;
  /**
   * Leading path fragment.
   */
  readonly path: string;
  /**
   * Returns a signature for object.
   */
  signature(): string;
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
  readonly body: Buffer;
  /**
   * Response headers.
   */
  readonly headers: Headers;
  /**
   * Response status code.
   */
  readonly statusCode: number;
  /**
   * Response status message.
   */
  readonly statusMessage: string;
  /**
   * Returns a signature for object.
   */
  signature(): string;
}

/**
 * Low-level service driver for working with git.
 */
export interface IGitDriver {
  /**
   * Checks access to service (e.g. authenticate by headers).
   * @param request IService object with related information
   */
  checkForAccess(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Checks if service is enabled for repository.
   * @param requestData IService object with related information
   */
  checkIfEnabled(requestData: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Checks if repository exists.
   * @param requestData IService object with related information
   */
  checkIfExists(requestData: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
  /**
   * Creates partly response data for request data.
   * @param requestData IService object with related information
   */
  createResponse(requestData: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<IGitDriverData>;
}

/**
 * Partly response data from driver.
 */
export interface IGitDriverData {
  /**
   * Raw buffer response.
   */
  body?: Buffer;
  /**
   * Status code. Uses HTTP status codes for compatibility.
   */
  statusCode: number;
  /**
   * Status message. May be an error message if statusCode is an HTTP error code.
   */
  statusMessage?: string;
}
