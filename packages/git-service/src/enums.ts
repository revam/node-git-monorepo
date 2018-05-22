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
