/**
 * Request service type.
 */
export enum RequestType {
  /**
   * Request the use of upload-pack service.
   */
  UploadPack = "UploadPack",
  /**
   * Request the use of receive-pack service.
   */
  ReceivePack = "ReceivePack",
}

/**
 * Request service status.
 */
export enum RequestStatus {
  /**
   * Indicate the service is still pending.
   */
  Pending = 0,
  /**
   * Indicate the service was accepted.
   */
  Accepted = 1,
  /**
   * Indocate the service was rejected.
   */
  Rejected = 2,
  /**
   * Indicate the service was initially accepted, but failed to fetch result for service.
   *
   * Combination of flags Accepted and Rejected. (1 | 2 -> 3)
   */
  Failure = 3,
}
