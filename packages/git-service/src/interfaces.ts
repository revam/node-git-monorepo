import { RequestStatus, ServiceType } from "./enums";
import { Headers } from "./headers";

/**
 * Request data.
 */
export interface IRequestData {
  /**
   * Stream leading to request data.
   */
  body: NodeJS.ReadableStream;
  /**
   * Incoming HTTP headers.
   */
  readonly headers: Headers;
  /**
   * Indicates that client **only** want advertisement from service.
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
  readonly capabilities: ReadonlyMap<string, string | undefined>;
  /**
   * Requested commands for service.
   */
  readonly commands: ReadonlyArray<IUploadPackCommand | IReceivePackCommand>;
  /**
   * Leading path fragment.
   */
  path: string;
  /**
   * The response object.
   */
  readonly response: IResponseData;
  /**
   * Request state. Can be used by application(s) to store state data.
   * Shared with response.
   */
  state: any;
  /**
   * URL for request.
   */
  readonly url: string;
  /**
   * HTTP method used with request.
   */
  readonly method: string;
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
  body?: Buffer;
  /**
   * Response headers.
   */
  readonly headers: Headers;
  /**
   * The request object.
   */
  readonly request: IRequestData;
  /**
   * Response status code.
   */
  statusCode: number;
  /**
   * Response status message as indiacted by statusCode.
   */
  readonly statusMessage: string;
  /**
   * Show message to client.
   * @param message Message to show client
   */
  addMessage(message: string): void;
  /**
   * Encoded messages to show client.
   */
  readonly messages: ReadonlyArray<string>;
  /**
   * Response state. Can be used by application(s) to store state data.
   * Shared with request.
   */
  state: any;
}

/**
 * Low-level part of the controller for handling common actions with git.
 */
export interface IDriver {
  /**
   * Check for access to repository and/or service. (e.g. authenticate by
   * headers).
   *
   * @param request Request data to check. Any writable properties can be
   *                modified.
   * @param response Response data. Any writable properties can be modified.
   * @returns True if request should gain access to repository and/or service.
   */
  checkForAccess(
    request: IRequestData,
    response: IResponseData,
  ): boolean | PromiseLike<boolean>;
  /**
   * Checks if service is enabled for repository.
   *
   * **Note:** You can still _atempt_ forcefull use of service.
   *
   * @param request Request data to check. Any writable properties can be
   *                modified.
   * @param response Response data. Any writable properties can be modified.
   * @returns True if service is enabled on selected repository.
   */
  checkIfEnabled(
    request: IRequestData,
    response: IResponseData,
  ): boolean | PromiseLike<boolean>;
  /**
   * Checks if repository exists.
   *
   * @param request Request data to check. Any writable properties can be
   *                modified.
   * @param response Response data. Any writable properties can be modified.
   * @returns True if repository exists.
   */
  checkIfExists(
    request: IRequestData,
    response: IResponseData,
  ): boolean | PromiseLike<boolean>;
  /**
   * Fetch body and status code for request.
   *
   * At the bare minimum the response status-code should be set. If the request
   * was OK than a body should also be set.
   * If the response is set to an error code (4xx or 5xx), then it will be
   * marked a failure by the controller.
   *
   * @param request Request data to use.
   * @param response Response data to modify.
   */
  serve(
    request: IRequestData,
    response: IResponseData,
  ): void | Promise<void>;
}

/**
 * Generic driver options.
 */
export interface IGenericDriverOptions {
  /**
   * Default values for enabled-check with file-system driver.
   */
  enabledDefaults?: boolean | { [K in ServiceType]?: boolean; };
  /**
   * Proxied methods.
   */
  methods?: ProxiedMethods;
  /**
   * Origin location as an URI or relative/abolute path.
   */
  origin?: string;
}

/**
 * Custom implementations for driver methods.
 *
 * All proxied methods should act the same as the methods they are proxying,
 * with the exception of allowing void as a return type.
 *
 * When a proxied method returns undefined, or a promise-like object resolving
 * to undefined, the proxided method will fallback to the original method
 * implementation.
 */
export type ProxiedMethods = {
  [P in keyof Exclude<IDriver, "createResponse">]?: (
    request: IRequestData,
    response: IResponseData,
  ) => ReturnType<IDriver[P]> | void | PromiseLike<void>;
};

export interface IError extends Error {
  code: string;
  statusCode?: number;
}

export interface IOuterError extends IError {
  inner: any;
}

export interface IProxiedError extends IOuterError {
  methodName: string;
}

export interface IDriverError extends IError {
  exitCode: number;
  stderr: string;
}
