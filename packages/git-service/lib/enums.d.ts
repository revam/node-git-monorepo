/**
 * Error codes thrown by this package.
 */
export declare enum ErrorCodes {
    /**
     * Something went wrong when executing git bin.
     */
    ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
    /**
     * Something went wrong in a proxied driver method.
     */
    ERR_FAILED_PROXY_METHOD = "ERR_FAILED_PROXY_METHOD",
    /**
     * Something went wrong in a listener for request data.
     */
    ERR_FAILED_REQUEST_SIGNAL = "ERR_FAILED_REQUEST_SIGNAL",
    /**
     * Something went wrong in a listener for response data.
     */
    ERR_FAILED_RESPONSE_SIGNAL = "ERR_FAILED_RESPONSE_SIGNAL",
}
/**
 * Service types.
 */
export declare enum ServiceType {
    /**
     * Git upload-pack service.
     */
    UploadPack = "upload-pack",
    /**
     * Git receive-pack service.
     */
    ReceivePack = "receive-pack",
}
/**
 * Request service status.
 */
export declare enum RequestStatus {
    /**
     * Indicate the service is still pending.
     */
    Pending = "Pending",
    /**
     * Indicate the service was accepted.
     */
    Accepted = "Accepted",
    /**
     * Indocate the service was rejected.
     */
    Rejected = "Rejected",
    /**
     * Indicate the service was initially accepted, but failed to produce valid
     * results for service.
     */
    Failure = "Failure",
}
