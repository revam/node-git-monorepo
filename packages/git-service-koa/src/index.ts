import { createService, LogicController } from "git-service";
import { Middleware } from "koa";

export * from "git-service";

export function createKoaMiddleware(controller: LogicController, options: IKoaMiddlewareOptions = {}): Middleware {
  const keyName = options.keyName || "service";
  const autoDeploy = "autoDeploy" in options ? options.autoDeploy : true;
  return async(context, next) => {
    const service = context.state[keyName] = createService(
      controller,
      context.url,
      context.method.toUpperCase(),
      context.headers,
      context.req,
    );
    // Link service state to context state.
    service.onRequest.addOnce((request) => request.state = context.state);
    await next();
    if (autoDeploy) {
      try {
        // Will only work if request is not already served.
        const response = await service.serve();
        if (response) {
          response.headers.forEach((h, v) => context.set(h, v));
          context.status = response.statusCode;
          context.message = response.statusMessage;
          context.body = response.body;
        }
      } catch (error) {
        context.throw(error);
      }
    }
  };
}

export interface IKoaMiddlewareOptions {
  /**
   * Where to store proxy in `Context.state`. Defaults to `"service"`.
   */
  keyName?: string;
  /**
   * If set, then automatically serves request. Defaults to `true`.
   */
  autoDeploy?: boolean;
}
