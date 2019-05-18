/**
 * Error codes thrown by this package.
 *
 * @public
 */
export const enum ErrorCodes {
  /**
   * Invalid packet start or end position.
   *
   * @remarks
   *
   * If start position was invalid, then the packet length could not be
   * determined. If the end position was invalid, then the packet length exceeds
   * the rest of the available buffer.
   */
  InvalidPacket = "ERR_INVALID_PACKET",
  /**
   * Read packet did not result in a valid {@link Commands | command} for used
   * {@link Service}.
   *
   * @remarks
   *
   * Don't know how this should happen with a _normal_ git client, but it is
   * possible, and don't hurt to report it when it happens.
   */
  MalformedCommand = "ERR_MALFORMED_SERVICE_COMMAND",
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
