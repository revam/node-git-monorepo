import { ErrorCodes } from "./enum";
import { ExtendedError, ServiceController } from "./main";

/**
 * Check if `target` confronts to the {@link ServiceController} interface.
 *
 * @privateRemarks
 *
 * This function is put in here because it is used interally by the library, and
 * to not create a depencency-cycle. (e.g.: A → B, B → C, C → A)
 *
 * @param target - Target to check.
 * @returns Returns true if `target` is found to implement the
 *          {@link ServiceController} interface, otherwise returns false.
 * @public
 */
export function checkServiceController(target: unknown): target is ServiceController {
  // tslint:disable:no-string-literal
  return (typeof target === "object" &&
    target !== null || typeof target === "function") &&
    "checkIfEnabled" in target && typeof target["checkIfEnabled"] === "function" &&
    "checkIfExists" in target && typeof target["checkIfExists"] === "function" &&
    "serve" in target && typeof target["serve"] === "function";
  // tslint:enable:no-string-literal
}

/**
 * Produces an extended error.
 *
 * @param message - Error message.
 * @param code - {@link ErrorCodes | Error code} to attach to the produced
 *               error.
 * @param extra - Extra fields to attach to the produced error.
 * @internal
 */
export function makeError<TError extends ExtendedError = ExtendedError>(
  message: string,
  code: ErrorCodes,
  extra?: Pick<TError, Exclude<keyof TError, keyof ExtendedError>>): TError {
  const error = new Error(message) as TError;
  error.code = code;
  if (extra) {
    Object.assign(error, extra);
  }
  return error;
}
