/**
 * Error codes thrown by this package.
 */
export enum ErrorCodes {
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
  /**
   * Response status is within the 2xx range, but contains no body. Possible
   * driver error.
   */
  ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
}

/**
 * Service types.
 */
export enum ServiceType {
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
export enum RequestStatus {
  /**
   * Indicate the request is still pending.
   */
  Pending = "Pending",
  /**
   * Indicate the request was accepted.
   */
  Accepted = "Accepted",
  /**
   * Indicate the request was rejected.
   */
  Rejected = "Rejected",
  /**
   * Indicate the request was initially accepted, but ended in failure.
   */
  Failure = "Failure",
  /**
   * Indicate the repository has moved and the request is being redirected.
   */
  Redirect = "Redirect",
}
