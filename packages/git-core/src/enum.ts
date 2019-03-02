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
   * Response status is within the 2xx range, but contains no body. Possible
   * driver error.
   */
  ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
  /**
   * Packet starting position is invalid.
   */
  ERR_INVALID_PACKET = "ERR_INVALID_PACKET",
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
