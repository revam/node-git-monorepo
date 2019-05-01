/**
 * Error codes thrown by this package.
 *
 * @public
 */
export const enum ErrorCodes {
  /**
   * Packet start or end position was invalid.
   *
   * @remarks
   *
   * If start position was invalid, then the packet length could not be
   * determined. If the end position was invalid, then the packet length exceeds
   * the rest of the available buffer.
   */
  InvalidPacket = "ERR_INVALID_PACKET",
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
