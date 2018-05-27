"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */
const http_1 = require("http");
const micro_signals_1 = require("micro-signals");
const util_1 = require("util");
const driver_1 = require("./driver");
const enums_1 = require("./enums");
const headers_1 = require("./headers");
const logic_controller_1 = require("./logic-controller");
const request_1 = require("./request");
__export(require("./driver"));
__export(require("./enums"));
__export(require("./headers"));
__export(require("./logic-controller"));
__export(require("./request"));
/**
 * Creates a new logic controller configured for origin.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
function createController(origin, options) {
    const driver = driver_1.createDriver(origin, options);
    return new logic_controller_1.LogicController(driver);
}
exports.createController = createController;
/**
 * Creates an IService compatible object.
 * @param driver Service driver to use
 * @param path Tailing url path fragment with querystring.
 * @param method Request HTTP method used
 * @param inputHeaders Incoming request HTTP Headers
 * @param body Incoming request body stream
 */
function createService(controller, path, method, inputHeaders, body) {
    if (typeof path !== "string" || !path) {
        throw new TypeError("argument `url` must be of type 'string'.");
    }
    if (typeof method !== "string" || !method) {
        throw new TypeError("argument `method` must be of type 'string'.");
    }
    if (typeof inputHeaders !== "object") {
        throw new TypeError("argument `headers` must be of type 'object'.");
    }
    if (typeof body !== "object" || typeof body.pipe !== "function") {
        throw new TypeError("argument `body` must be streamable");
    }
    const headers = new headers_1.Headers(inputHeaders);
    const content_type = headers.get("Content-Type");
    const [isAdvertisement, requestType, repository] = request_1.mapInputToRequest(path, method, content_type);
    const request = request_1.createRequest(body, headers, isAdvertisement, requestType, repository);
    const onRequest = new AsyncSignal();
    const onResponse = new AsyncSignal();
    const onError = new micro_signals_1.Signal();
    return {
        controller,
        onRequest: onRequest.readOnly(),
        onResponse: onResponse.readOnly(),
        async serve() {
            const requestData = await request;
            if (!requestData || requestData.status !== enums_1.RequestStatus.Pending) {
                return;
            }
            try {
                await onRequest.dispatch(requestData);
            }
            catch (error) {
                throw createDispatchError(error, enums_1.ErrorCodes.ERR_FAILED_REQUEST_SIGNAL);
            }
            const responseData = await controller.serve(requestData, this.onResponse);
            try {
                await onResponse.dispatch(responseData);
            }
            catch (error) {
                throw createDispatchError(error, enums_1.ErrorCodes.ERR_FAILED_RESPONSE_SIGNAL);
            }
            return responseData;
        },
    };
}
exports.createService = createService;
exports.default = createService;
function createMiddleware(controller, configure) {
    if (typeof configure !== "function") {
        configure = undefined;
    }
    return async (request, response) => {
        const service = createService(controller, request.url, request.method, request.headers, request);
        if (configure) {
            await configure.call(undefined, service);
        }
        try {
            const { body, headers, statusCode, statusMessage } = await service.serve();
            headers.forEach((header, value) => { response.setHeader(header, value); });
            response.statusCode = statusCode;
            response.statusMessage = statusMessage;
            await util_1.promisify(response.end.bind(response))(body);
        }
        catch (error) {
            console.error(error);
            if (typeof error === "object") {
                if (!response.headersSent) {
                    response.statusCode = error.status || error.statusCode || 500;
                    response.setHeader("Content-Type", "text/plain");
                    response.setHeader("Content-Length", http_1.STATUS_CODES[response.statusCode].length);
                    response.write(http_1.STATUS_CODES[response.statusCode], "utf8");
                }
            }
            if (response.writable) {
                response.end();
            }
        }
    };
}
exports.createMiddleware = createMiddleware;
class AsyncSignal extends micro_signals_1.Signal {
    async dispatch(payload) {
        await Promise.all(Array.from(this._listeners).map(async (fn) => { await fn.call(void 0, payload); }));
    }
}
function createDispatchError(innerError, code) {
    const error = new Error("");
    error.code = code;
    error.inner = innerError;
    return error;
}
//# sourceMappingURL=index.js.map