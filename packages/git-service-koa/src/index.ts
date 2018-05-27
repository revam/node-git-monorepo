import { createService, LogicController } from "git-service";
import { Middleware } from "koa";

export function createMiddleware(controller: LogicController, options: IMiddlewareOptions = {}): Middleware {
  const keyName = options.keyName || "service";
  const autoDeploy = options.autoDeploy || true;
  return async(context, next) => {
    const service = context.state[keyName] = createService(
      controller,
      context.url,
      context.method.toUpperCase(),
      context.headers,
      context.req,
    );
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

export interface IMiddlewareOptions {
  /**
   * Where to store proxy in `Context.state`. Defaults to `"service"`.
   */
  keyName?: string;
  /**
   * If set, then automatically serves request. Defaults to `true`.
   */
  autoDeploy?: boolean;
}
