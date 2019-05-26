import { Context } from "./context";

/**
 * An error with some extra properties attached.
 *
 * @public
 */
export interface ExtendedError extends Error {
  /**
   * The error code.
   *
   * @remarks
   *
   * If the error was thrown from within the library, then this code corresponds
   * to an {@link ErrorCodes | error code}, otherwise it can be any string.
   */
  code: string;
}

/**
 * High-level controller for serving git repositories.
 *
 * @public
 */
export interface ServiceController {
  /**
   * Check for authorization to repository and/or service, and/or authentication
   * of requester.
   *
   * @remarks
   *
   * This method is optional to implement, and it is up to the implentation to
   * define rules on how to check for authorization/authentication.
   *
   * A gernal outline may be to check {@link Request.headers} for a
   * "Authorization" header, then check some database for permissions.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if request should gain access to repository and/or service.
   */
  checkForAuth?(context: Context): Promise<boolean>;
  /**
   * Checks if service is enabled for repository.
   *
   * @remarks
   *
   * It is up to the implementation to define rules to check if the target of
   * {@link Context | `context`} is enabled for use.
   *
   * But it _should_ not modify the {@link Response | response}
   * object, and only serve as an indicator to if the given
   * {@link Service | service} is enabled, should still be possible to
   * _atempt_ a forcefull use of {@link ServiceController.serve}.
   *
   * A gernal outline may be to check if the
   * {@link Context.service | service} is enabled for the
   * {@link Context.pathname | given path}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if service is enabled for requested repository, otherwise
   *          false.
   */
  checkIfEnabled(context: Context): Promise<boolean>;
  /**
   * Checks if repository exists.
   *
   * @remarks
   *
   * It should only be an indicatior to check if repository,
   * and should still be possible to _atempt_ a forcefull use of
   * {@link ServiceController.serve}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if repository exists.
   */
  checkIfExists(context: Context): Promise<boolean>;
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
   * @param context - The {@link Context | context} to use.
   */
  serve(context: Context): Promise<void>;
}

export * from "./enum";
export { checkServiceController } from "./main.private";
export * from "./context";
export * from "./basic-controller";
export * from "./fetch-controller";
export * from "./logic-controller";
