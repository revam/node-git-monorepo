/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { Signal } from "micro-signals";
import { Readable } from "stream";
import { RequestStatus } from "./enums";
import { Headers, HeadersInput } from "./headers";
import { IGitDriver, IResponseData, IService } from "./interfaces";
import { LogicController } from "./logic-controller";
import { createRequest, mapInputToRequest } from "./request";

export * from "./enums";
export * from "./headers";
export * from "./interfaces";
export * from "./logic-controller";
export * from "./request";

export function createController(driver: IGitDriver) {
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
    onError: onError.readOnly(),
    onRequest: onRequest.readOnly(),
    onResponse: onResponse.readOnly(),
    async serve(this: IService) {
      try {
        const requestData = await request;
        if (requestData.status !== RequestStatus.Pending) {
          return;
        }
        await onRequest.dispatch(requestData);
        const responseData = await controller.serve(requestData, this.onResponse);
        await onResponse.dispatch(responseData);
        return responseData;
      } catch (error) {
        onError.dispatch(error);
      }
    },
  };
}
export { createService as default };

export const SymbolService = Symbol("service");

class AsyncSignal<P> extends Signal<P> {
  public async dispatch(payload?: P): Promise<void> {
    await Promise.all(Array.from(this._listeners).map(async(fn) => { await fn.call(void 0, payload); }));
  }
}
