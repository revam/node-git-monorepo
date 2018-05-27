/// <reference types="koa" />
import { LogicController } from "git-service";
import { Middleware } from "koa";
export declare function createMiddleware(controller: LogicController, options?: IMiddlewareOptions): Middleware;
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
