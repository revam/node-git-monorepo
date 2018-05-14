/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { IncomingMessage, ServerRequest, ServerResponse, STATUS_CODES } from "http";
import { Readable } from "stream";
import { DataSignal } from "./data-signal";
import { SignalPriority } from "./enums";
import { Headers, HeadersInput } from "./headers";
import { inspectDriver, mapInputToRequest } from "./helpers";
import { IGitDriver, IResponseData, IService } from "./interfaces";
import { LogicController } from "./logic-controller";
import { createRequest } from "./request";

export * from "./data-signal";
export * from "./enums";
export * from "./headers";
export * from "./helpers";
export * from "./interfaces";
export * from "./logic-controller";
export * from "./request";
export * from "./signal";

/**
 * Creates a IService compatible object.
 * @param driver Service driver to use
 * @param path Tailing url path fragment with querystring.
 * @param method Request HTTP method used
 * @param inputHeaders Incoming request HTTP Headers
 * @param body Incoming request body stream
 */
export function createService(
  driver: IGitDriver,
  path: string,
  method: string,
  inputHeaders: HeadersInput,
  body: Readable,
): IService {
  inspectDriver(driver);
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
  const response = new DataSignal<IResponseData>();
  const controller = new LogicController(driver, request.awaitData, response);
  return {
    controller,
    request,
    response,
    async serve(this: IService) {
      const onError = (err) => this.response.onError.dispatch(err);
      this.controller.onError.add(onError, SignalPriority.Early);
      // Will safely await response data and throw errors on response object.
      this.response.dispatch(this.controller.serve());
      await this.response.awaitData;
      this.controller.onError.remove(onError);
    },
  };
}
export { createService as default };

export const SymbolService = Symbol("service");
