import { concatPacketBuffers, PacketReader } from "git-packet-streams";
import * as encode from "git-side-band-message";
import { STATUS_CODES } from "http";
import { ReadableSignal, Signal } from "micro-signals";
import { URL } from "url";
import { createDriver } from "./driver";
import { ErrorCodes, RequestStatus, ServiceType } from "./enums";
import { Headers, HeadersInput } from "./headers";
import {
  IDriver,
  IError,
  IGenericDriverOptions,
  IOuterError,
  IReceivePackCommand,
  IRequestData,
  IResponseData,
  IUploadPackCommand,
} from "./interfaces";

const SymbolContext = Symbol("context");
const SymbolOnError = Symbol("on error");

const SymbolOnComplete = Symbol("on complete");
class OnCompleteSignal extends Signal<IRequestData> {
  public async dispatchAsync(request: IRequestData): Promise<void> {
    if (this._listeners.size && request.status !== RequestStatus.Pending) {
      await Promise.all(Array.from(this._listeners).map(async (fn) => fn.call(void 0, request)));
    }
  }
}

const SymbolOnUsable = Symbol("on usable");
class OnUsableSignal extends Signal<IRequestData> {
  // Dispatch payload to observers one at the time, till request is not pending.
  public async dispatchAsync(request: IRequestData): Promise<void> {
    if (this._listeners.size && request.status === RequestStatus.Pending) {
      for (const fn of this._listeners) {
        await fn.call(void 0, request);
        if (request.status !== RequestStatus.Pending) {
          break;
        }
      }
    }
  }
}

/**
 * Middeware for controller.
 */
export type LogicControllerMiddleware = (
  this: LogicControllerContext,
  request: IRequestData,
  response: IResponseData,
) => any;

/**
 * Common logic shared across service instances.
 */
export class LogicController {
  /**
   * The parent signal of `onComplete`.
   * @internal
   */
  protected [SymbolOnComplete]: OnCompleteSignal = new OnCompleteSignal();

  /**
   * The parent signal of `onError`.
   * @internal
   */
  protected [SymbolOnError]: Signal<IRequestData> = new Signal();

  /**
   * The parent signal of `onUsable`.
   * @internal
   */
  protected [SymbolOnUsable]: OnUsableSignal = new OnUsableSignal();

  /**
   * Service driver - doing the heavy-lifting for us.
   */
  public readonly driver: IDriver;

  /**
   * Payload is distpatched to any observer after processing if request is
   * **not** pending. If an observer returns a promise, will wait till the
   * promise resolves before continuing.
   *
   * **Note:** Request or response should __not__ be tempered with here unless
   * you know what you are doing.
   */
  public readonly onComplete: ReadableSignal<IRequestData> = this[SymbolOnComplete].readOnly();

  /**
   * Payload is dispatched when any error is thrown from controller or the
   * underlying driver.
   */
  public readonly onError: ReadableSignal<any> = this[SymbolOnError].readOnly();

  /**
   * Payload is dispatched to each observer in series till the (observer-)stack
   * is empty or the request is no longer pending. If an observer returns a
   * promise, will wait till the promise resolves before continuing.
   */
  public readonly onUsable: ReadableSignal<IRequestData> = this[SymbolOnUsable].readOnly();

  /**
   * Create a new `LogicController` instance.
   *
   * @param driver The driver to use.
   */
  public constructor(driver: IDriver) {
    this.driver = driver;
  }

  /**
   * Uses middleware with controller. Adds all elements in `middleware` as
   * listeners to signal `onUsable`.
   * @param middleware Middleware to use
   */
  public use(...middleware: LogicControllerMiddleware[]): this {
    middleware.forEach((m) =>
      this.onUsable.add((request) =>
        m.call(request[SymbolContext], request, request.response)));
    return this;
  }

  /**
   * Creates a new `IRequestData` compliant object.
   *
   * @param body Request body as a stream
   * @param headers HTTP headers
   * @param method HTTP method used for request
   * @param url Tailing url path fragment with querystring.
   */
  public async create(
    body: NodeJS.ReadableStream,
    headers: HeadersInput,
    method: string,
    url: string,
  ): Promise<IRequestData> {
    return createRequest(body, headers, method, url);
  }

  /**
   * Serves request with sane behaviour.
   *
   *
   * @param request An existing request.
   * @throws if any observer in either `onUsable` or `onComplete` throws.
   * @see LogicController#accept
   * @see LogicController#reject
   * @returns response data.
   */
  public serve(request: IRequestData): Promise<IResponseData>;
  /**
   * Serves request with sane behaviour.
   *
   * @param body Request body as a stream
   * @param headers HTTP headers
   * @param method HTTP method used for request
   * @param url Tailing url path fragment with querystring.
   * @throws if any input data is invalid.
   * @throws if any observer in either `onUsable` or `onComplete` throws.
   * @see LogicController#accept
   * @see LogicController#reject
   * @returns response data.
   */
  public serve(
    body: NodeJS.ReadableStream,
    headers: HeadersInput,
    method: string,
    url: string,
  ): Promise<IResponseData>;
  public async serve(
    body: NodeJS.ReadableStream | IRequestData,
    headers?: HeadersInput,
    method?: string,
    url?: string,
  ): Promise<IResponseData> {
    let request: IRequestData;
    if (arguments.length === 1 && typeof body === "object") {
      request = body as IRequestData;
    }
    else if (arguments.length === 4) {
      request = await this.create(body as NodeJS.ReadableStream, headers!, method!, url!);
    }
    else {
      throw new Error('Invalid arguments supplied to method "serve".');
    }
    if (request.status === RequestStatus.Pending) {
      request[SymbolContext] = new LogicControllerContext(this, request);
      try {
        await this[SymbolOnUsable].dispatchAsync(request);
      } catch (error) {
        throw wrapError(error, ErrorCodes.ERR_FAILED_IN_USABLE_SIGNAL);
      }
      delete request[SymbolContext];
      // Recheck status because an observer might have changed it.
      if (request.status === RequestStatus.Pending) {
        if (! await this.checkIfExists(request)) {
          await this.reject(request, 404); // 404 Not Found
        }
        else if (! await this.checkForAccess(request)) {
          await this.reject(request, 401); // 401 Unauthorized
        }
        else if (! await this.checkIfEnabled(request)) {
          await this.reject(request, 403); // 403 Forbidden
        }
        else {
          await this.accept(request); // 2xx-5xx HTTP status code
        }
      }
      try {
        await this[SymbolOnComplete].dispatchAsync(request);
      } catch (error) {
        throw wrapError(error, ErrorCodes.ERR_FAILED_IN_COMPLETE_SIGNAL);
      }
    }
    return request.response;
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   * If driver returns a 4xx or 5xx, then the request is rejected and marked as
   * a failure.
   *
   * @param request An existing request.
   */
  public async accept(request: IRequestData): Promise<void> {
    if (request.status !== RequestStatus.Pending) {
      return;
    }
    const response = request.response;
    // No service -> invalid input -> 404 Not Found.
    if (!request.service) {
      request.status = RequestStatus.Failure;
      response.statusCode = 404;
      response.body = undefined;
      this.createPlainBodyForResponse(response);
      return;
    }
    if (response.statusCode > 300 && response.statusCode < 400) {
      return this.redirect(request);
    }
    request.status = RequestStatus.Accepted;
    try {
      await this.driver.serve(request, response);
    } catch (error) {
      this.dispatchError(error);
      response.statusCode = error && (error.status || error.statusCode) || 500;
      response.body = undefined;
    }
    // If no status code is set or is below 300 with no body, reset response
    // status and body and throw error.
    if (response.statusCode < 300 && !response.body) {
      const error = new Error("Response is within the 2xx range, but contains no body.") as IError;
      error.code = ErrorCodes.ERR_INVALID_BODY_FOR_2XX;
      this.dispatchError(error);
      response.statusCode = 500;
      response.body = undefined;
    }
    // Mark any response with a status above or equal to 400 as a failure.
    if (response.statusCode >= 400) {
      request.status = RequestStatus.Failure;
      this.createPlainBodyForResponse(response);
    }
    // Return here if not OK
    if (response.statusCode !== 200) {
      return;
    }
    const packets: Buffer[] = [];
    const headers = response.headers;
    if (response.body) {
      packets.push(response.body);
      if (request.isAdvertisement) {
        const header = AdHeaders[request.service];
        // Add header to response if none was found.
        if (!response.body.slice(0, header.length).equals(header)) {
          packets.unshift(header);
        }
      }
      // Add messages at the end of stream
      else if (response.messages.length) {
        response.messages.forEach((message) => packets.push(encode(message)));
      }
    }
    response.body = concatPacketBuffers(packets, !request.isAdvertisement && response.messages.length ? 0 : undefined);
    headers.set("Content-Type", `application/x-git-${request.service}-${request.isAdvertisement ?
      "advertisement" : "result"}`);
    headers.set("Content-Length", response.body.length);
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   *
   * Will redirect if statusCode is in the 3xx range.
   *
   * @param request An existing request.
   * @param statusCode 3xx, 4xx or 5xx http status code.
   *                   Default is `500`.
   *
   *                   Code will only be set if no prior code is set.
   * @param body Reason for rejection.
   */
  public async reject(request: IRequestData, statusCode?: number, body?: string): Promise<void> {
    if (request.status !== RequestStatus.Pending) {
      return;
    }
    const response = request.response;
    // Redirect instead if the statusCode is in the 3xx range.
    if (response.statusCode && response.statusCode > 300 && response.statusCode < 400) {
      return this.redirect(request);
    }
    request.status = RequestStatus.Rejected;
    if (response.statusCode < 400) {
      if (!(statusCode && statusCode < 600 && statusCode >= 300)) {
        statusCode = 500;
      }
      response.statusCode = statusCode;
    }
    this.createPlainBodyForResponse(response, body);
  }

  /**
   * Redirects client with "Location" header. Header must be set beforehand.
   */
  public redirect(request: IRequestData): Promise<void>;
  /**
   * Redirects client to cached entry.
   */
  public redirect(request: IRequestData, ststuCode: 304): Promise<void>;
  /**
   * Redirects client with "Location" header.
   */
  public redirect(request: IRequestData, statusCode: number): Promise<void>;
  /**
   * Redirects client to `location`. Can optionally set status code of redirect.
   * @param location The location to redirect to.
   */
  public redirect(request: IRequestData, location: string, statusCode?: number): Promise<void>;
  public redirect(reqiest: IRequestData, locationOrStatus?: string | number, statusCode?: number): Promise<void>;
  public async redirect(request: IRequestData, location?: string | number, statusCode?: number): Promise<void> {
    if (request.status !== RequestStatus.Pending) {
      return;
    }
    const response = request.response;
    if (typeof location === "number") {
      statusCode = location;
      location = undefined;
    }
    if (location) {
      response.headers.set("Location", location[0] !== "/" ? `/${location}` : location);
    }
    // Reject if no "Location" header is not found and status is not 304
    if (!response.headers.has("Location") && response.statusCode !== 304) {
      response.statusCode = 500;
      return this.reject(request);
    }
    request.status = RequestStatus.Redirect;
    if (!(response.statusCode > 300 && response.statusCode < 400)) {
      if (!(statusCode && statusCode > 300 && statusCode < 400)) {
        statusCode = 308;
      }
      response.statusCode = statusCode;
    }
    response.headers.delete("Content-Type");
    response.headers.delete("Content-Length");
    response.body = undefined;
  }

  /**
   * Checks if repository exists.
   */
  public async checkIfExists(request: IRequestData): Promise<boolean> {
    try {
      return this.driver.checkIfExists(request, request.response);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Checks if service is enabled.
   * Can still *atempt* forcefull use of service.
   */
  public async checkIfEnabled(request: IRequestData): Promise<boolean> {
    try {
      return this.driver.checkIfEnabled(request, request.response);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Check for access to repository and/or service.
   */
  public async checkForAccess(request: IRequestData): Promise<boolean> {
    try {
      return this.driver.checkForAccess(request, request.response);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Creates a plain-text body for response, but only if no body exists.
   *
   * The body is populated with `data` and any additional messages from
   * `response.messages`.
   *
   * @param response The response to create for
   * @param data Defaults to `response.statusMessage`.
   */
  private createPlainBodyForResponse(
    response: IResponseData,
    data: string = response.statusMessage,
  ): void {
    if (!response.body) {
      const messages = response.messages.slice();
      messages.unshift(data);
      for (const [index, value] of messages.entries()) {
        if (!value.endsWith("\n")) {
          messages[index] += "\n";
        }
      }
      const headers = response.headers;
      const body = response.body = Buffer.from(messages.join(""));
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Length", body.length);
    }
  }

  /**
   * Dispatch error onto signal `onError`.
   */
  private dispatchError(error: any): void {
    setImmediate(() => this[SymbolOnError].dispatch(error));
  }
}

class LogicControllerContext {
  /* @internal */
  private [SymbolContext]: LogicController;

  /**
   * Request data.
   */
  public readonly request: IRequestData;

  /**
   * Response data.
   */
  public readonly response: IResponseData;

  public constructor(controller: LogicController, request: IRequestData) {
    this[SymbolContext] = controller;
    this.request = request;
    this.response = request.response;
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   * If driver returns a 4xx or 5xx, then the request is rejected and marked as
   * a failure.
   */
  public async accept(): Promise<void> {
    return this[SymbolContext].accept(this.request);
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   *
   * Will redirect if statusCode is in the 3xx range.
   *
   * @param statusCode 3xx, 4xx or 5xx http status code.
   *                   Default is `500`.
   *
   *                   Code will only be set if no prior code is set.
   * @param body Reason for rejection.
   */
  public async reject(statusCode?: number, body?: string): Promise<void> {
    return this[SymbolContext].reject(this.request, statusCode, body);
  }

  /**
   * Redirects client with "Location" header. Header must be set beforehand.
   */
  public redirect(): Promise<void>;
  /**
   * Redirects client to cached entry.
   */
  public redirect(ststuCode: 304): Promise<void>;
  /**
   * Redirects client with "Location" header.
   */
  public redirect(statusCode: number): Promise<void>;
  /**
   * Redirects client to `location`. Can optionally set status code of redirect.
   * @param location The location to redirect to.
   */
  public redirect(location: string, statusCode?: number): Promise<void>;
  public async redirect(location?: string | number, statusCode?: number): Promise<void> {
    return this[SymbolContext].redirect(this.request, location, statusCode);
  }

  /**
   * Check for access to repository and/or service.
   */
  public async checkForAccess(): Promise<boolean> {
    return this[SymbolContext].checkForAccess(this.request);
  }

  /**
   * Checks if service is enabled.
   * Can still *atempt* forcefull use of service.
   */
  public async checkIfEnabled(): Promise<boolean> {
    return this[SymbolContext].checkIfEnabled(this.request);
  }

  /**
   * Checks if repository exists.
   */
  public async checkIfExists(): Promise<boolean> {
    return this[SymbolContext].checkIfExists(this.request);
  }
}

/**
 * Creates a new logic controller configured with a driver for `origin`.
 *
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export function createController(origin: string, options?: IGenericDriverOptions): LogicController;
/**
 * Creates a new logic controller configured with a driver.
 *
 * @param options Options object. Must contain property `origin`.
 */
export function createController(options: IGenericDriverOptions): LogicController;
/**
 * Creates a new logic controller configured with a driver.
 *
 * @param originOrOptions Origin location or options
 * @param options Extra options. Ignored if `originOrOptions` is an object.
 */
export function createController(
  originOrOptions: string | IGenericDriverOptions,
  options?: IGenericDriverOptions,
): LogicController;
export function createController(
  originOrOptions: string | IGenericDriverOptions,
  options?: IGenericDriverOptions,
): LogicController {
  return new LogicController(createDriver(originOrOptions, options));
}

function wrapError(error: any, code: ErrorCodes): IOuterError {
  const outerError: Partial<IOuterError> = new Error("Error thown from signal");
  outerError.code = code;
  if (error && (error.status || error.statusCode)) {
    outerError.statusCode = error.status || error.statusCode;
  }
  outerError.inner = error;
  return outerError as IOuterError;
}

async function createRequest(
  body: NodeJS.ReadableStream,
  inputHeaders: HeadersInput,
  method: string,
  url: string,
): Promise<IRequestData> {
  if (typeof body !== "object") {
    throw new TypeError("argument `body` must be of type 'object'.");
  }
  if (typeof inputHeaders !== "object") {
    throw new TypeError("argument `inputHeaders` must be of type 'object'.");
  }
  method = method && method.trim().toUpperCase();
  if (typeof method !== "string" || !method) {
    throw new TypeError("argument `method` must be of type 'string'.");
  }
  if (typeof url !== "string" || !url) {
    throw new TypeError("argument `url` must be of type 'string'.");
  }
  const headers = new Headers(inputHeaders);
  const content_type = headers.get("Content-Type");
  const [isAdvertisement, path, service] = mapInputToRequest(url, method, content_type);
  const requestData: IRequestData = Object.create(null, {
    body: {
      enumerable: true,
      value: body,
      writable: true,
    },
    capabilities: {
      enumerable: true,
      value: new Map(),
      writable: false,
    },
    commands: {
      enumerable: true,
      value: new Array(),
      writable: false,
    },
    headers: {
      enumerable: true,
      value: headers,
      writable: false,
    },
    isAdvertisement: {
      enumerable: true,
      value: isAdvertisement,
      writable: false,
    },
    method: {
      enumerable: true,
      value: method,
      writable: false,
    },
    path: {
      enumerable: true,
      value: path,
      writable: true,
    },
    service: {
      enumerable: true,
      value: service,
      writable: false,
    },
    state: {
      enumerable: true,
      value: {},
      writable: true,
    },
    status: {
      enumerable: true,
      value: RequestStatus.Pending,
      writable: true,
    },
    url: {
      enumerable: true,
      value: url,
      writable: false,
    },
  });
  Object.defineProperty(requestData, "response", {
    value: createResponse(requestData),
    writable: false,
  });
  if (service && !isAdvertisement) {
    const middleware = ServiceReaders.get(service)!;
    const passthrough = new PacketReader(middleware(requestData));
    requestData.body = passthrough;
    await new Promise((ok, nok) => body.pipe(passthrough).on("error", nok).on("packet-done", ok));
  }
  return requestData;
}

function createResponse(request: IRequestData): IResponseData {
  return Object.create(null, {
    addMessage: {
      enumerable: false,
      value(this: IResponseData, message: string): void {
        (this.messages as string[]).push(message);
      },
      writable: false,
    },
    body: {
      enumerable: true,
      value: undefined,
      writable: true,
    },
    headers: {
      enumerable: true,
      value: new Headers(),
      writable: false,
    },
    messages: {
      enumerable: true,
      value: [],
      writable: false,
    },
    request: {
      enumerable: true,
      value: request,
      writable: false,
    },
    state: {
      enumerable: true,
      get(this: IResponseData): any {
        return this.request.state;
      },
      set(this: IResponseData, value: any) {
        this.request.state = value;
      },
    },
    statusCode: {
      enumerable: true,
      value: 200,
      writable: true,
    },
    statusMessage: {
      enumerable: true,
      get(this: IResponseData): string {
        return STATUS_CODES[this.statusCode] || "";
      },
    },
  }) as IResponseData;
}

/**
 * Maps vital request properties to vital service properties.
 * @param fragment Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 * @internal
 */
function mapInputToRequest(
  fragment: string,
  method: string,
  content_type?: string,
): [boolean, string?, ServiceType?] {
  const url = new URL(fragment, "https://127.0.0.1/");
  // Get advertisement from service
  let results: RegExpExecArray | null = /^\/?(.*?)\/info\/refs$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    if (!(method === "GET" || method === "HEAD") || !url.searchParams.has("service")) {
      return [true, path];
    }
    const serviceName = url.searchParams.get("service")!;
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [true, path];
    }
    return [true, path, results[1] as ServiceType];
  }
  // Use service directly
  results = /^\/?(.*?)\/(git-[\w\-]+)$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    const serviceName = results[2];
    if (method !== "POST" || !content_type) {
      return [false, path];
    }
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [false, path];
    }
    const service = results[1];
    if (content_type !== `application/x-git-${service}-request`) {
      return [false, path];
    }
    return [false, path, service as ServiceType];
  }
  return [false];
}

function reader(
  commands: Array<IUploadPackCommand | IReceivePackCommand>,
  capabilities: Map<string, string | undefined>,
  result: string,
  metadata: IUploadPackCommand | IReceivePackCommand,
) {
  commands.push(metadata);
  if (result) {
    for (const c of result.trim().split(" ")) {
      if (/=/.test(c)) {
        const [k, v] = c.split("=");
        capabilities.set(k, v);
      }
      else {
        capabilities.set(c, undefined);
      }
    }
  }
}

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const ServiceReaders = new Map<ServiceType, (s: IRequestData) => (b: Buffer) => any>([
  [
    ServiceType.ReceivePack,
    (request) => {
      const pre_check = /[0-9a-f]{40} [0-9a-f]{40}/;
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
      return (buffer) => {
        if (pre_check.test(buffer.slice(4, 85).toString("utf8"))) {
          const value = buffer.toString("utf8");
          const results = regex.exec(value);
          if (results) {
            let kind: "create" | "delete" | "update";
            if (results[1] === "0000000000000000000000000000000000000000") {
              kind = "create";
            }
            else if (results[2] === "0000000000000000000000000000000000000000") {
              kind = "delete";
            }
            else {
              kind = "update";
            }
            reader(request.commands as any, request.capabilities as any, results[4], {
              commits: [results[1], results[2]],
              kind,
              reference: results[3],
            });
          }
        }
      };
    },
  ],
  [
    ServiceType.UploadPack,
    (request) => {
      const pre_check = /want|have/;
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
      return (buffer) => {
        if (pre_check.test(buffer.slice(4, 8).toString("utf8"))) {
          const value = buffer.toString("utf8");
          const results = regex.exec(value);
          if (results) {
            reader(request.commands as any, request.capabilities as any, results[3], {
              commits: [results[2]],
              kind: results[1] as ("want" | "have"),
            });
          }
        }
      };
    },
  ],
]);

/**
 * Advertisement Headers for response
 */
const AdHeaders = {
  [ServiceType.ReceivePack]: Buffer.from("001f# service=git-receive-pack\n0000"),
  [ServiceType.UploadPack]: Buffer.from("001e# service=git-upload-pack\n0000"),
};
