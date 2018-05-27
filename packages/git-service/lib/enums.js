"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Error codes thrown by this package.
 */
var ErrorCodes;
(function (ErrorCodes) {
    /**
     * Something went wrong when executing git bin.
     */
    ErrorCodes["ERR_FAILED_GIT_EXECUTION"] = "ERR_FAILED_GIT_EXECUTION";
    /**
     * Something went wrong in a proxied driver method.
     */
    ErrorCodes["ERR_FAILED_PROXY_METHOD"] = "ERR_FAILED_PROXY_METHOD";
    /**
     * Something went wrong in a listener for request data.
     */
    ErrorCodes["ERR_FAILED_REQUEST_SIGNAL"] = "ERR_FAILED_REQUEST_SIGNAL";
    /**
     * Something went wrong in a listener for response data.
     */
    ErrorCodes["ERR_FAILED_RESPONSE_SIGNAL"] = "ERR_FAILED_RESPONSE_SIGNAL";
})(ErrorCodes = exports.ErrorCodes || (exports.ErrorCodes = {}));
/**
 * Service types.
 */
var ServiceType;
(function (ServiceType) {
    /**
     * Git upload-pack service.
     */
    ServiceType["UploadPack"] = "upload-pack";
    /**
     * Git receive-pack service.
     */
    ServiceType["ReceivePack"] = "receive-pack";
})(ServiceType = exports.ServiceType || (exports.ServiceType = {}));
/**
 * Request service status.
 */
var RequestStatus;
(function (RequestStatus) {
    /**
     * Indicate the service is still pending.
     */
    RequestStatus["Pending"] = "Pending";
    /**
     * Indicate the service was accepted.
     */
    RequestStatus["Accepted"] = "Accepted";
    /**
     * Indocate the service was rejected.
     */
    RequestStatus["Rejected"] = "Rejected";
    /**
     * Indicate the service was initially accepted, but failed to produce valid
     * results for service.
     */
    RequestStatus["Failure"] = "Failure";
})(RequestStatus = exports.RequestStatus || (exports.RequestStatus = {}));
//# sourceMappingURL=enums.js.map