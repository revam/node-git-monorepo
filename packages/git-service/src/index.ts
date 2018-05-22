/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { Signal } from "micro-signals";
import { Readable } from "stream";
import { Headers, HeadersInput } from "./headers";
import { inspectDriver, mapInputToRequest } from "./helpers";
import { IGitDriver, IResponseData, IService } from "./interfaces";
import { LogicController } from "./logic-controller";
import { createRequest } from "./request";

export * from "./enums";
export * from "./headers";
export * from "./helpers";
export * from "./interfaces";
export * from "./logic-controller";
export * from "./request";

export function createController(driver: IGitDriver) {
  inspectDriver(driver);
  return new LogicController(driver);
}

/**
 * Creates a IService compatible object.
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
  const response = new Signal<IResponseData>();
  const onError = new Signal<any>();
  return {
    controller,
    onError: onError.readOnly(),
    request,
    response: new Promise<IResponseData>((resolve) => response.addOnce(resolve)),
    async serve(this: IService) {
      try {
        const requestData = await request;
        const responseData = await controller.serve(requestData, response.readOnly());
        response.dispatch(responseData);
      } catch (error) {
        onError.dispatch(error);
      }
    },
  };
}
export { createService as default };

export const SymbolService = Symbol("service");
