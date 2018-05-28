/// <reference types="node" />
/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
import { IncomingMessage, ServerResponse } from "http";
import { Readable } from "stream";
import { HeadersInput } from "./headers";
import { IGenericDriverOptions, IService } from './interfaces';
import { LogicController } from "./logic-controller";
export * from "./driver";
export * from "./enums";
export * from "./headers";
export * from "./interfaces";
export * from "./logic-controller";
export * from "./request";
/**
 * Creates a new logic controller configured for origin.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export declare function createController(origin: string, options?: IGenericDriverOptions): LogicController;
/**
 * Creates an IService compatible object.
 * @param driver Service driver to use
 * @param path Tailing url path fragment with querystring.
 * @param method Request HTTP method used
 * @param inputHeaders Incoming request HTTP Headers
 * @param body Incoming request body stream
 */
export declare function createService(controller: LogicController, path: string, method: string, inputHeaders: HeadersInput, body: Readable): IService;
export { createService as default };
export declare function createMiddleware(controller: LogicController, configure?: (service: IService) => any): (request: IncomingMessage, response: ServerResponse) => Promise<void>;
