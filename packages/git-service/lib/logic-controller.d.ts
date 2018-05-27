/// <reference types="node" />
import { ReadableSignal, Signal } from "micro-signals";
import { IDriver, IRequestData, IResponseData } from "./interfaces";
/**
 * Controls service logic, such as
 */
export declare class LogicController {
    /**
     * Service driver - doing the heavy-lifting for us.
     */
    readonly driver: IDriver;
    /**
     * Dispatched when any error ocurr.
     */
    readonly onError: Signal<any>;
    private __messages;
    constructor(driver: IDriver);
    /**
     * Serves request with default behavior and rules.
     */
    serve(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<IResponseData>;
    /**
     * Accepts request and asks the underlying driver for an appropriate response.
     * If driver returns a 4xx or 5xx, then the request is rejected and marked as
     * a failure.
     */
    accept(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<IResponseData>;
    /**
     * Rejects request with status code and an optional status message.
     * Only works with http status error codes.
     * @param statusCode 4xx or 5xx http status code for rejection.
     *                   Default is `500`.
     * @param statusMessage Optional reason for rejection.
     *                      Default is status message for status code.
     */
    reject(request: IRequestData, statusCode?: number, statusMessage?: string): Promise<IResponseData>;
    /**
     * Checks if repository exists.
     */
    checkIfExists(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
    /**
     * Checks if service is enabled.
     * We can still *atempt* a forcefull use of service.
     */
    checkIfEnabled(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
    /**
     * Checks access rights to service.
     * Depends on driver implementation.
     */
    checkForAccess(request: IRequestData, onResponse: ReadableSignal<IResponseData>): Promise<boolean>;
    /**
     * Inform client of message, but only if service is accepted and not a
     * failure.
     * @param message Message to inform client
     */
    sidebandMessage(message: string | Buffer): this;
    private createRejectedResponse(payload);
    private dispatchError(error);
}
