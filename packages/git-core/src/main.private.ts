import { ServiceController } from "./main";

/**
 * @public
 */
export interface IError extends Error {
  code: string;
  statusCode?: number;
}

/**
 * @public
 */
export interface IOuterError extends IError {
  inner: any;
}

/**
 * Check if `target` confronts to the {@link ServiceController} interface.
 *
 * @param target - Target to check
 *
 * @public
 */
export function checkServiceDriver(target: unknown): target is ServiceController {
  // tslint:disable:no-string-literal
  return (typeof target === "object" &&
    target !== null || typeof target === "function") &&
    "checkForAuth" in target && typeof target["checkForAuth"] === "function" &&
    "checkIfEnabled" in target && typeof target["checkIfEnabled"] === "function" &&
    "checkIfExists" in target && typeof target["checkIfExists"] === "function" &&
    "serve" in target && typeof target["serve"] === "function";
  // tslint:enable:no-string-literal
}
