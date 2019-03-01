/**
 * Error codes thrown by this package.
 *
 * @public
 */
export enum ErrorCodes {
  /**
   * Something went wrong when executing git bin.
   */
  ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
  /**
   * Something went wrong in a listener for request data.
   */
  ERR_FAILED_IN_USABLE_SIGNAL = "ERR_FAILED_IN_USABLE_SIGNAL",
  /**
   * Something went wrong in a listener for response data.
   */
  ERR_FAILED_IN_COMPLETE_SIGNAL = "ERR_FAILED_IN_COMPLETE_SIGNAL",
  /**
   * Response status is within the 2xx range, but contains no body. Possible
   * driver error.
   */
  ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
  /**
   * Packet starting position is invalid.
   */
  ERR_INVALID_PACKET = "ERR_INVALID_PACKET_START",
  /**
   * An incomplete packet exceeds the rest of available buffer.
   */
  ERR_INCOMPLETE_PACKET = "ERR_INCOMPLETE_PACKET",
}

/**
 * Service types.
 *
 * @public
 */
export enum Service {
  /**
   * Git upload-pack service.
   */
  UploadPack = "upload-pack",
  /**
   * Git receive-pack service.
   */
  ReceivePack = "receive-pack",
}
