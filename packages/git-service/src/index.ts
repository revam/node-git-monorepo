/**
 * git-service package
 *
 * MIT License
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { IGenericDriverOptions } from "./interfaces";
import { createController, LogicController } from "./logic-controller";

export * from "./driver";
export * from "./enums";
export * from "./interfaces";
export * from "./logic-controller";

/**
 * Creates a handler for direct use with a server instance.
 *
 * @param controller LogicController instance used to serve request.
 * @param setup Setup controller before use.
 */
export function createMiddleware(
  controller: LogicController,
  setup?: (controller: LogicController) => any,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param optionsOrOrigin Origin or options for a new controller instance.
 * @param setup Setup controller before use.
 */
export function createMiddleware(
  optionsOrOrigin: string | IGenericDriverOptions,
  setup?: (controller: LogicController) => any,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param controllerOrOptions LogicController instance used to serve request, or
 *                            options to use with a new controller.
 * @param setup Setup controller before use. Usefull if options is supplied
 *              instead of an existing controller.
 */
export function createMiddleware(
  controllerOrOptions: LogicController | IGenericDriverOptions | string,
  setup?: (controller: LogicController) => any,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export function createMiddleware(
  controllerOrOptions: LogicController | IGenericDriverOptions | string,
  setup?: (controller: LogicController) => any,
): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  let controller: LogicController;
  if (controllerOrOptions instanceof LogicController) {
    controller = controllerOrOptions;
  }
  else if (typeof controllerOrOptions === "object" || typeof controllerOrOptions === "string") {
    controller = createController(controllerOrOptions);
  }
  else {
    throw new TypeError("argument `controller` must be of type 'object'.");
  }
  if (typeof setup === "function") {
    setup(controller);
  }
  return async(request: IncomingMessage, response: ServerResponse) => {
    try {
      const responseData = await controller.serve(request, request.headers, request.method!, request.url!);
      responseData.headers.forEach((header, value) => response.setHeader(header, value));
      response.statusCode = responseData.statusCode!;
      response.statusMessage = responseData.statusMessage!;
      const body = request.method !== "HEAD" && responseData.body || undefined;
      if (body) {
        await new Promise((resolve, reject) =>
          response.write(body, (err) => err ? reject(err) : resolve()));
      }
    } catch (error) {
      console.error(error);
      if (!response.headersSent) {
        response.statusCode = error && (error.status || error.statusCode) || 500;
        response.statusMessage = STATUS_CODES[response.statusCode]!;
        response.setHeader("Content-Type", "text/plain");
        response.setHeader("Content-Length", response.statusMessage.length);
        response.write(STATUS_CODES[response.statusCode]!, "utf8");
      }
    } finally {
      if (response.writable) {
        await new Promise((resolve, reject) =>
          response.end((err) => err ? reject(err) : resolve()));
      }
    }
  };
}
