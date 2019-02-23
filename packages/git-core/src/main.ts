import { Context } from "./context";

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
 * Low-level driver for handling common actions with git.
 *
 * @public
 */
export interface ServiceDriver {
  /**
   * Check for authorization to repository and/or service, and/or authentication
   * of requester.
   *
   * @remarks
   *
   * It is up to the implentation to define rules to check for
   * authorization/authentication.
   *
   * A gernal outline may be to check {@link Request.headers} for a
   * "Authorization" header, then check some database for permissions.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if request should gain access to repository and/or service.
   */
  checkForAuth(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  /**
   * Checks if service is enabled for repository.
   *
   * @remarks
   *
   * It is up to the implementation to define rules to check if the content of
   * the {@link Request | request} is enabled for use.
   *
   * But it _should_ not modify the {@link Response | response}
   * object, and only serve as an indicator to if the given
   * {@link Service | service} is enabled, should still be possible to
   * _atempt_ a forcefull use of {@link ServiceDriver.serve}.
   *
   * A gernal outline may be to check if the
   * {@link Context.service | service} is enabled for the
   * {@link Context.path | given path}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if service is enabled for requested repository, otherwise
   *          false.
   */
  checkIfEnabled(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  /**
   * Checks if repository exists.
   *
   * @remarks
   *
   * It should only be an indicatior to check if repository,
   * and should still be possible to _atempt_ a forcefull use of
   * {@link ServiceDriver.serve}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if repository exists.
   */
  checkIfExists(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  /**
   * Set properties for {@link Response | response}, through
   * {@link Context | `context`}.
   *
   * @remarks
   *
   * Properties such as {@link Response.status | status} and
   * {@link Response.body | body} should be set.
   *
   * At the bare minimum the response status-code should be set. If the request
   * was OK than a body should also be set.
   *
   * If the {@link Response.status | status code} is set to an error code (4xx or 5xx),
   * then it will be marked as {@link Status.Failure | failure} by the
   * {@link LogicController | controller}.
   *
   * @privateRemarks
   *
   * Even though the other methods are more lax, the serve method **must**
   * return a promise.
   *
   * @param context - The {@link Context | context} to use.
   */
  serve(context: Context): Promise<void>;
}

/**
 * Check if `target` confronts to the {@link ServiceDriver} interface.
 *
 * @param target - Target to check
 *
 * @public
 */
export function checkServiceDriver(target: unknown): target is ServiceDriver {
  // tslint:disable:no-string-literal
  return (typeof target === "object" &&
    target !== null || typeof target === "function") &&
    "checkForAuth" in target && typeof target["checkForAuth"] === "function" &&
    "checkIfEnabled" in target && typeof target["checkIfEnabled"] === "function" &&
    "checkIfExists" in target && typeof target["checkIfExists"] === "function" &&
    "serve" in target && typeof target["serve"] === "function";
  // tslint:enable:no-string-literal
}

export * from "./enums";
export * from "./context";
export * from "./generic-driver";
export * from "./logic-controller";
