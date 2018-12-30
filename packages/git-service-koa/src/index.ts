import { createController, IGenericDriverOptions, LogicController } from "git-service";
import { Middleware } from "koa";

export * from "git-service";
export default createKoaMiddleware;

/**
 * Creates a handler for direct use with a server instance.
 *
 * @param controller LogicController instance used to serve request.
 * @param keyName Where to store data in `Context.state`.
 *                Defaults to `"gitService"`.
 */
export function createKoaMiddleware(
  controller: LogicController,
  keyName?: string | symbol,
): Middleware;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param optionsOrOrigin Origin or options for a new controller instance.
 * @param keyName Where to store data in `Context.state`.
 *                Defaults to `"gitService"`.
 */
export function createKoaMiddleware(
  optionsOrOrigin: string | IGenericDriverOptions,
  keyName?: string | symbol,
): Middleware;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param controller LogicController instance used to serve request.
 * @param setup Setup controller before use.
 * @param keyName Where to store data in `Context.state`.
 *                Defaults to `"gitService"`.
 */
export function createKoaMiddleware(
  controller: LogicController,
  setup?: (controller: LogicController) => any,
  keyName?: string | symbol,
): Middleware;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param optionsOrOrigin Origin or options for a new controller instance.
 * @param setup Setup controller before use.
 * @param keyName Where to store data in `Context.state`.
 *                Defaults to `"gitService"`.
 */
export function createKoaMiddleware(
  optionsOrOrigin: string | IGenericDriverOptions,
  setup?: (controller: LogicController) => any,
  keyName?: string | symbol,
): Middleware;
/**
 * Creates a handler for direct use with a server instance.
 *
 * @param controllerOrOptions LogicController instance used to serve request, or
 *                            options to use with a new controller.
 * @param setup Setup controller before use. Usefull if options is supplied
 *              instead of an existing controller.
 * @param keyName Where to store data in `Context.state`.
 *                Defaults to `"gitService"`.
 */
export function createKoaMiddleware(
  controllerOrOptions: LogicController | IGenericDriverOptions | string,
  setup?: ((controller: LogicController) => any) | string | symbol,
  keyName?: string | symbol,
): Middleware;
export function createKoaMiddleware(
  controllerOrOptions: LogicController | IGenericDriverOptions | string,
  setup?: ((controller: LogicController) => any) | string | symbol,
  keyName: string | symbol = "gitService",
): Middleware {
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
  else if (typeof setup === "string" || typeof setup === "symbol") {
    keyName = setup;
    setup = undefined;
  }
  return async(context, next) => {
    try {
      const request = await controller.create(
        context.req,
        context.req.headers,
        context.method,
        context.url,
      );
      request.state = context.state;
      request.state.koa = context;
      request.state[keyName] = request;
      const response = await controller.serve(request);
      response.headers.forEach((h, v) => context.set(h, v));
      context.status = response.statusCode;
      context.message = response.statusMessage;
      context.body = response.body;
    } catch (error) {
      return context.throw(error);
    }
    return next();
  };
}
