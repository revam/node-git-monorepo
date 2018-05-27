/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { Signal } from "micro-signals";
import { Readable } from "stream";
import { promisify } from "util";
import { createDriver } from "./driver";
import { ErrorCodes, RequestStatus } from "./enums";
import { Headers, HeadersInput } from "./headers";
import { IGenericDriverOptions, IOuterError, IRequestData, IResponseData, IService } from './interfaces';
import { LogicController } from "./logic-controller";
import { createRequest, mapInputToRequest } from "./request";

export * from "./driver";
export * from "./enums";
export * from "./headers";
export * from "./interfaces";
export * from "./logic-controller";
export * from "./request";

/**
 * Creates a new logic controller configured for origin.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export function createController(origin: string, options: IGenericDriverOptions) {
  const driver = createDriver(origin, options);
  return new LogicController(driver);
}

/**
 * Creates an IService compatible object.
 * @param driver Service driver to use
 * @param path Tailing url path fragment with querystring.
 * @param method Request HTTP method used
 * @param inputHeaders Incoming request HTTP Headers
 * @param body Incoming request body stream
 */
export function createService(
  controller: LogicController,
  path: string,
  method: string,
  inputHeaders: HeadersInput,
  body: Readable,
): IService {
  if (typeof path !== "string" || !path) {
    throw new TypeError("argument `url` must be of type 'string'.");
  }
  if (typeof method !== "string" || !method) {
    throw new TypeError("argument `method` must be of type 'string'.");
  }
  if (typeof inputHeaders !== "object") {
    throw new TypeError("argument `headers` must be of type 'object'.");
  }
  if (typeof body !== "object" || typeof body.pipe !== "function") {
    throw new TypeError("argument `body` must be streamable");
  }
  const headers = new Headers(inputHeaders);
  const content_type = headers.get("Content-Type");
  const [isAdvertisement, requestType, repository] = mapInputToRequest(path, method, content_type);
  const request = createRequest(body, headers, isAdvertisement, requestType, repository);
  const onRequest = new AsyncSignal<IRequestData>();
  const onResponse = new AsyncSignal<IResponseData>();
  const onError = new Signal<any>();
  return {
    controller,
    onRequest: onRequest.readOnly(),
    onResponse: onResponse.readOnly(),
    async serve(this: IService) {
      const requestData = await request;
      if (!requestData || requestData.status !== RequestStatus.Pending) {
        return;
      }
      try {
        await onRequest.dispatch(requestData);
      } catch (error) {
        throw createDispatchError(error, ErrorCodes.ERR_FAILED_REQUEST_SIGNAL);
      }
      const responseData = await controller.serve(requestData, this.onResponse);
      try {
        await onResponse.dispatch(responseData);
      } catch (error) {
        throw createDispatchError(error, ErrorCodes.ERR_FAILED_RESPONSE_SIGNAL);
      }
      return responseData;
    },
  };
}
export { createService as default };

export function createMiddleware(controller: LogicController, configure?: (service: IService) => any) {
  if (typeof configure !== "function") {
    configure = undefined;
  }
  return async(request: IncomingMessage, response: ServerResponse) => {
    const service = createService(controller, request.url,  request.method, request.headers, request);
    if (configure) {
      await configure.call(undefined, service);
    }
    try {
      const {body, headers, statusCode, statusMessage} = await service.serve();
      headers.forEach((header, value) => { response.setHeader(header, value); });
      response.statusCode = statusCode;
      response.statusMessage = statusMessage;
      await promisify(response.end.bind(response))(body);
    } catch (error) {
      console.error(error);
      if (typeof error === "object") {
        if (!response.headersSent) {
          response.statusCode = error.status || error.statusCode || 500;
          response.setHeader("Content-Type", "text/plain");
          response.setHeader("Content-Length", STATUS_CODES[response.statusCode].length);
          response.write(STATUS_CODES[response.statusCode], "utf8");
        }
      }
      if (response.writable) {
        response.end();
      }
    }
  };
}

class AsyncSignal<P> extends Signal<P> {
  public async dispatch(payload?: P): Promise<void> {
    await Promise.all(Array.from(this._listeners).map(async(fn) => { await fn.call(void 0, payload); }));
  }
}

function createDispatchError(innerError: any, code: ErrorCodes): IOuterError {
  const error: Partial<IOuterError> = new Error("");
  error.code = code;
  error.inner = innerError;
  return error as IOuterError;
}
