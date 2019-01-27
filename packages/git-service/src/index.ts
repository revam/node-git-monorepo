/**
 * git-service package
 *
 * MIT License
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { IncomingMessage, ServerResponse, STATUS_CODES } from "http";
import { ServiceType } from "./enums";
import { GenericDriver } from "./generic-driver";
import { IDriver } from "./interfaces";
import { LogicController } from "./logic-controller";

export * from "./generic-driver";
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
  optionsOrOrigin: string | GenericDriver.Options,
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
  controllerOrOptions: LogicController | GenericDriver.Options | string,
  setup?: (controller: LogicController) => any,
): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
export function createMiddleware(
  controllerOrOptions: LogicController | GenericDriver.Options | string,
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
      response.statusCode = responseData.statusCode;
      response.statusMessage = responseData.statusMessage;
      const body = request.method !== "HEAD" && responseData.body || undefined;
      if (body && body.length) {
        await new Promise((resolve, reject) =>
          response.write(body, (err) => err ? reject(err) : resolve()));
      }
    } catch (error) {
      // tslint:disable-next-line:no-console Log errors not caught in controller
      console.error(error);
      if (!response.headersSent) {
        response.statusCode = error && (error.status || error.statusCode) || 500;
        response.statusMessage = STATUS_CODES[response.statusCode]!;
        response.setHeader("Content-Type", "text/plain");
        response.setHeader("Content-Length", response.statusMessage.length);
        response.write(response.statusMessage, "utf8");
      }
    } finally {
      if (response.writable) {
        await new Promise((resolve, reject) =>
          response.end((err: any) => err ? reject(err) : resolve()));
      }
    }
  };
}

/**
 * Creates a new logic controller configured with a driver for `origin`.
 *
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export function createController(origin: string, options?: GenericDriver.Options): LogicController;
/**
 * Creates a new logic controller configured with a driver.
 *
 * @param options Options object. Must contain property `origin`.
 */
export function createController(options: GenericDriver.Options): LogicController;
/**
 * Creates a new logic controller configured with a driver.
 *
 * @param originOrOptions Origin location or options
 * @param options Extra options. Ignored if `originOrOptions` is an object.
 */
export function createController(
  originOrOptions: string | GenericDriver.Options,
  options?: GenericDriver.Options,
): LogicController;
export function createController(
  originOrOptions: string | GenericDriver.Options,
  options?: GenericDriver.Options,
): LogicController {
  return new LogicController(new GenericDriver(originOrOptions, options));
}

/**
 * Creates an `IDriver` compatible object.
 *
 * @deprecated
 * @param options Options object. Must contain property `origin`.
 */
export function createDriver(options: GenericDriver.Options): IDriver;
/**
 * Creates an `IDriver` compatible object.
 *
 * @deprecated
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options.
 */
export function createDriver(origin: string, options?: GenericDriver.Options): IDriver;
/**
 * Creates an `IDriver` compatible object.
 *
 * @deprecated
 * @param originOrOptions Origin location or options
 * @param options Extra options. Ignored if `originOrOptions` is an object.
 */
export function createDriver(originOrOptions: string | GenericDriver.Options, options?: GenericDriver.Options): IDriver;
/**
 * @deprecated
 */
export function createDriver(origin: string | GenericDriver.Options, options: GenericDriver.Options = {}): IDriver {
  return new GenericDriver(origin, options);
}

/**
 * Creates an IDriver compatible object for use on the file system.
 *
 * @deprecated
 * @param origin Repositories root folder
 * @param enabledDefaults Service usage defaults
 */
export function createFileSystemDriver(
  origin: string,
  enabledDefaults: boolean | Partial<Record<ServiceType, boolean>> = true,
): IDriver {
  return new GenericDriver(origin, { enabledDefaults});
}

/**
 * Creates an IDriver compatible object for use over http(s).
 *
 * @deprecated
 * @param origin Origin location URL
 */
export function createWebDriver(origin: string): IDriver {
  return new GenericDriver(origin);
}
