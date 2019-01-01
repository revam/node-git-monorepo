import { createController, IGenericDriverOptions, IRequestData, LogicController } from "git-service";
import { Middleware } from "koa";

export default createKoaMiddleware;

/**
 * Creates a handler for use with a koa instance.
 *
 * @param controller LogicController instance used to serve request.
 * @param setup Setup controller before use.
 */
export function createKoaMiddleware(
  controller: LogicController,
  setup?: (controller: LogicController) => any,
): Middleware;
/**
 * Creates a handler for use with a koa instance.
 *
 * @param optionsOrOrigin Origin or options for a new controller instance.
 * @param setup Setup controller before use.
 */
export function createKoaMiddleware(
  optionsOrOrigin: string | IGenericDriverOptions,
  setup?: (controller: LogicController) => any,
): Middleware;
/**
 * Creates a handler for use with a koa instance.
 *
 * @param controllerOrOptions LogicController instance or options for a new
 *                            instance.
 * @param setup Setup controller before use.
 */
export function createKoaMiddleware(
  controllerOrOptions: string | IGenericDriverOptions | LogicController,
  setup?: (controller: LogicController) => any,
): Middleware;
export function createKoaMiddleware(
  controllerOrOptions: LogicController | IGenericDriverOptions | string,
  setup?: (controller: LogicController) => any,
): Middleware {
  let controller: LogicController;
  if (controllerOrOptions instanceof LogicController) {
    controller = controllerOrOptions;
  }
  else if (typeof controllerOrOptions === "object" || typeof controllerOrOptions === "string") {
    controller = createController(controllerOrOptions);
  }
  else {
    throw new TypeError("argument `controllerOrOptions` must be of type 'object' or 'string'.");
  }
  if (typeof setup === "function") {
    setup(controller);
  }
  const notAllowed = new Set(["content-length", "content-type"]);
  return async(context, next) => {
    let request: IRequestData;
    try {
      request = await controller.create(
        context.req,
        context.req.headers,
        context.method,
        context.url,
      );
      request.state = context.state;
      request.state.koa = context;
      await controller.serve(request);
    } catch (error) {
      return context.throw(error);
    }
    const response = request.response;
    if (response.statusCode === 404) {
      return next();
    }
    if (response.statusCode >= 400) {
      response.headers.forEach((h, v) => !notAllowed.has(h.toLowerCase()) && context.set(h, v));
      return context.throw(response.statusCode);
    }
    response.headers.forEach((h, v) => context.set(h, v));
    context.status = response.statusCode;
    context.body = response.body;
  };
}
