"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const git_packet_streams_1 = require("git-packet-streams");
const encode = require("git-side-band-message");
const http_1 = require("http");
const micro_signals_1 = require("micro-signals");
const enums_1 = require("./enums");
const headers_1 = require("./headers");
/**
 * Controls service logic, such as
 */
class LogicController {
    constructor(driver) {
        this.__messages = [];
        Object.defineProperties(this, {
            driver: {
                value: driver,
                writable: false,
            },
            onError: {
                value: new micro_signals_1.Signal(),
                writable: false,
            },
        });
    }
    /**
     * Serves request with default behavior and rules.
     */
    async serve(request, onResponse) {
        if (!await this.checkIfExists(request, onResponse)) {
            return this.reject(request, 404); // 404 Not Found
        }
        else if (!await this.checkForAccess(request, onResponse)) {
            return this.reject(request, 401); // 401 Unauthorized
        }
        else if (!await this.checkIfEnabled(request, onResponse)) {
            return this.reject(request, 403); // 403 Forbidden
        }
        return this.accept(request, onResponse); // 2xx-5xx HTTP status code
    }
    /**
     * Accepts request and asks the underlying driver for an appropriate response.
     * If driver returns a 4xx or 5xx, then the request is rejected and marked as
     * a failure.
     */
    async accept(request, onResponse) {
        if (request.status !== enums_1.RequestStatus.Pending) {
            return;
        }
        request.status = enums_1.RequestStatus.Accepted;
        if (!request.service) {
            return;
        }
        let output;
        try {
            output = await this.driver.createResponse(request, onResponse);
        }
        catch (error) {
            this.dispatchError(error);
            output = {
                statusCode: 500,
                statusMessage: error && error.message || http_1.STATUS_CODES[500],
            };
        }
        if (output.statusCode >= 400) {
            request.status = enums_1.RequestStatus.Failure;
            return this.createRejectedResponse(output);
        }
        const packets = [];
        const headers = new headers_1.Headers();
        if (output.body) {
            packets.push(output.body);
            if (request.isAdvertisement) {
                const header = AdHeaders[request.service];
                if (!output.body.slice(0, header.length).equals(header)) {
                    packets.splice(0, 0, header);
                }
                headers.set("Content-Type", `application/x-git-${request.service}-advertisement`);
            }
            else {
                packets.push(...this.__messages);
                headers.set("Content-Type", `application/x-git-${request.service}-result`);
            }
            headers.set("Content-Length", packets.reduce((p, c) => p + c.length, 0).toString());
        }
        const body = git_packet_streams_1.concatPacketBuffers(packets, !request.isAdvertisement && this.__messages.length ? 0 : undefined);
        return createResponse({
            body,
            headers,
            statusCode: output.statusCode,
            statusMessage: output.statusMessage || http_1.STATUS_CODES[output.statusCode],
        });
    }
    /**
     * Rejects request with status code and an optional status message.
     * Only works with http status error codes.
     * @param statusCode 4xx or 5xx http status code for rejection.
     *                   Default is `500`.
     * @param statusMessage Optional reason for rejection.
     *                      Default is status message for status code.
     */
    async reject(request, statusCode, statusMessage) {
        if (request.status !== enums_1.RequestStatus.Pending) {
            return;
        }
        request.status = enums_1.RequestStatus.Rejected;
        if (!request.service) {
            return;
        }
        if (!(statusCode < 600 && statusCode >= 400)) {
            statusCode = 500;
        }
        if (!(statusMessage && typeof statusMessage === "string")) {
            statusMessage = http_1.STATUS_CODES[statusCode] || "Unknown status";
        }
        return this.createRejectedResponse({ statusCode, statusMessage });
    }
    /**
     * Checks if repository exists.
     */
    async checkIfExists(request, onResponse) {
        try {
            return this.driver.checkIfExists(request, onResponse);
        }
        catch (error) {
            this.dispatchError(error);
        }
        return false;
    }
    /**
     * Checks if service is enabled.
     * We can still *atempt* a forcefull use of service.
     */
    async checkIfEnabled(request, onResponse) {
        try {
            return this.driver.checkIfEnabled(request, onResponse);
        }
        catch (error) {
            this.dispatchError(error);
        }
        return false;
    }
    /**
     * Checks access rights to service.
     * Depends on driver implementation.
     */
    async checkForAccess(request, onResponse) {
        try {
            return this.driver.checkForAccess(request, onResponse);
        }
        catch (error) {
            this.dispatchError(error);
        }
        return false;
    }
    /**
     * Inform client of message, but only if service is accepted and not a
     * failure.
     * @param message Message to inform client
     */
    sidebandMessage(message) {
        this.__messages.push(encode(message));
        return this;
    }
    createRejectedResponse(payload) {
        const headers = new headers_1.Headers();
        let body;
        if (payload.body) {
            body = payload.body;
        }
        else {
            body = Buffer.from(payload.statusMessage);
            headers.set("Content-Type", "text/plain; charset=utf-8");
            headers.set("Content-Length", body.length);
        }
        return createResponse({
            body,
            headers,
            statusCode: payload.statusCode,
            statusMessage: payload.statusMessage,
        });
    }
    dispatchError(error) {
        setImmediate(() => this.onError.dispatch(error));
    }
}
exports.LogicController = LogicController;
/**
 * Advertisement Headers for response
 */
const AdHeaders = {
    [enums_1.ServiceType.ReceivePack]: Buffer.from("001f# service=git-receive-pack\n0000"),
    [enums_1.ServiceType.UploadPack]: Buffer.from("001e# service=git-upload-pack\n0000"),
};
/**
 * Creates a response data holder with signature.
 * @param data Response data
 */
function createResponse(data) {
    return Object.create(null, {
        __signature: {
            enumerable: false,
            value: undefined,
        },
        body: {
            value: data.body,
        },
        headers: {
            value: data.headers,
        },
        signature: {
            enumerable: false,
            value() {
                if (this.__signature) {
                    return this.__signature;
                }
                return this.__signature = crypto_1.createHash("sha256").update(JSON.stringify(this)).digest("hex");
            },
            writable: false,
        },
        statusCode: {
            value: data.statusCode,
        },
        statusMessage: {
            value: data.statusMessage,
        },
    });
}
//# sourceMappingURL=logic-controller.js.map