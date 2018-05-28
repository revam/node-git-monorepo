/// <reference types="koa" />
import { LogicController } from "git-service";
import { Middleware } from "koa";
export * from "git-service";
export declare function createKoaMiddleware(controller: LogicController, options?: IKoaMiddlewareOptions): Middleware;
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
