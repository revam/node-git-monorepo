/// <reference types="node" />
import { ReadableSignal } from "micro-signals";
import { Readable } from "stream";
import { RequestStatus, ServiceType } from './enums';
import { Headers } from "./headers";
import { LogicController } from "./logic-controller";
/**
 *
 */
export interface IService {
    /**
     * Resolves when request is ready.
     */
    readonly onRequest: ReadableSignal<IRequestData>;
    /**
     * Resolves when response is ready.
     */
    readonly onResponse: ReadableSignal<IResponseData>;
    /**
     * Logic controller.
     */
    readonly controller: LogicController;
    /**
     * Serves request with default behavior and rules.
     * Returns the final response data, which may have been altered by any
     * observers registered on `onResponse`.
     */
    serve(): Promise<IResponseData>;
}
/**
 * Request data.
 */
export interface IRequestData {
    /**
     * Stream leading to request data.
     */
    body: Readable;
    /**
     * Incoming HTTP headers.
     */
    readonly headers: Headers;
    /**
     * Indicates that client **only** want advertisement from service.
     */
    readonly isAdvertisement: boolean;
    /**
     * Service type.
     */
    readonly service: ServiceType;
    /**
     * Request status.
     */
    status: RequestStatus;
    /**
     * Requested capebilities client support and/or want.
     */
    readonly capabilities: Map<string, string>;
    /**
     * Requested commands for service.
     */
    readonly commands: Array<IUploadPackCommand | IReceivePackCommand>;
    /**
     * Leading path fragment.
     */
    path: string;
    /**
     * Returns a signature for object.
     */
    signature(): string;
}
/**
 * Contains information of what client want to retrive from this upload-pack
 * service request.
 */
export interface IUploadPackCommand {
    /**
     * Upload-pack command type.
     */
    kind: "want" | "have";
    /**
     * Commit. In plural form for compatibility with IRequestPushData.
     */
    commits: [string];
}
/**
 * Contains information of what client want to upload in a receive-pack request.
 */
export interface IReceivePackCommand {
    /**
     * Receive-pack command type.
     */
    kind: "create" | "update" | "delete";
    /**
     * First child is old commit sha-hash, second is new commit sha-hash.
     */
    commits: [string, string];
    /**
     * Reference path. Can be any segmented path, but usually starting with either
     * "heads" or "tags".
     */
    reference: string;
}
/**
 * Response data.
 */
export interface IResponseData {
    /**
     * Response body.
     */
    body: Buffer;
    /**
     * Response headers.
     */
    headers: Headers;
    /**
     * Response status code.
     */
    statusCode: number;
    /**
     * Response status message.
     */
    statusMessage: string;
    /**
     * Returns a signature for object.
     */
    signature(): string;
}
/**
 * Low-level interface for working with git.
 */
export interface IDriver {
    /**
     * Checks access to service (e.g. authenticate by headers).
     */
    checkForAccess(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | PromiseLike<boolean>;
    /**
     * Checks if service is enabled for repository.
     */
    checkIfEnabled(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | PromiseLike<boolean>;
    /**
     * Checks if repository exists.
     */
    checkIfExists(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | PromiseLike<boolean>;
    /**
     * Creates partly response data for request data.
     */
    createResponse(request: IRequestData, onResponse: ReadableSignal<IResponseData>): IDriverResponseData | Promise<IDriverResponseData>;
}
/**
 * Generic driver options.
 */
export interface IGenericDriverOptions {
    /**
     * Default values for enabled-check with file-system driver.
     */
    enabledDefaults?: boolean | {
        [K in ServiceType]?: boolean;
    };
    /**
     * Proxied methods.
     */
    methods?: IProxiedMethods;
}
/**
 * Custom implementations of driver methods.
 */
export interface IProxiedMethods {
    /**
     * Checks access to service (e.g. authenticate by headers).
     * Return undefined, or an empty promise to fallback to default
     * implementation.
     */
    checkForAccess?(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | undefined | PromiseLike<boolean | undefined>;
    /**
     * Checks if service is enabled for repository.
     * Return undefined, or an empty promise to fallback to default
     * implementation.
     */
    checkIfEnabled?(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | undefined | PromiseLike<boolean | undefined>;
    /**
     * Checks if repository exists.
     * Return undefined, or an empty promise to fallback to default
     * implementation.
     */
    checkIfExists?(request: IRequestData, onResponse: ReadableSignal<IResponseData>): boolean | undefined | PromiseLike<boolean | undefined>;
}
/**
 * Partly response data from driver.
 */
export interface IDriverResponseData {
    /**
     * Raw buffer response.
     */
    body?: Buffer;
    /**
     * Status code. Uses HTTP status codes for compatibility.
     */
    statusCode: number;
    /**
     * Status message. May be an error message if statusCode is an HTTP error
     * code.
     */
    statusMessage?: string;
}
export interface IError extends Error {
    code: string;
}
export interface IOuterError extends IError {
    inner: any;
}
export interface IProxiedError extends IOuterError {
    methodName: string;
}
export interface IDriverError extends IError {
    exitCode: number;
    stderr: string;
}
