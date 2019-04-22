import { STATUS_CODES } from "http";
import { ReadableSignal } from "micro-signals";
import { Context } from "./context";
import { ErrorCodes } from "./enum";
import {
  callWithInstance,
  checkIfPending,
  checkStatus,
  CompleteSignal,
  Status,
  updateStatus,
  UsableSignal,
} from "./logic-controller.private";
import { ServiceController } from "./main";
import { checkServiceController, makeError } from "./main.private";
import { encode } from "./util/buffer";

const SymbolPrivate = Symbol("private");
const SymbolOnComplete = Symbol("on complete");
const SymbolOnUsable = Symbol("on usable");

/**
 * Shared logic for controlling another {@link ServiceController} with sane
 * defaults, while also implementing the {@link ServiceController} interface.
 *
 * @public
 */
export class LogicController implements ServiceController {
  /**
   * The parent signal of {@link LogicController.onComplete}.
   *
   * @remarks
   *
   * Only accessible by {@link LogicController | **this class**}, and not
   * extending classes.
   */
  private [SymbolOnComplete]: CompleteSignal;

  /**
   * The parent signal of {@link LogicController.onUsable}.
   *
   * @remarks
   *
   * Only accessible by {@link LogicController | **this class**}, and not
   * extending classes.
   */
  private [SymbolOnUsable]: UsableSignal;

  /**
   * Private declaration(s).
   *
   * @privateRemarks
   *
   * Contains the underlying {@link ServiceController | service controller} and
   * {@link MethodOverrides | method-override declarations}.
   */
  private readonly [SymbolPrivate]: { controller: ServiceController; methods?: MethodOverrides };

  /**
   * {@link Context | Payload} is dispatched after the
   * {@link LogicController | controller} has served it.
   *
   * @remarks
   *
   * It is advised against tempering with {@link Context | `context`} here.
   *
   * If an observer returns a promise, will wait till the promise resolves
   * before continuing.
   */
  public readonly onComplete: ReadableSignal<Context>;

  /**
   * Payload is dispatched to each observer in series till the (observer-)stack
   * is empty or the request is no longer pending. If an observer returns a
   * promise, will wait till the promise resolves before continuing.
   */
  public readonly onUsable: ReadableSignal<Context>;

  /**
   * Create a new {@link LogicController} instance.
   *
   * @param serviceController - The {@link ServiceController | controller} to use logic on.
   */
  public constructor(serviceController: ServiceController, overrides?: MethodOverrides) {
    if (!checkServiceController(serviceController)) {
      throw new TypeError("argument `serviceController` must be a valid implementation of the ServiceController interface");
    }
    if (overrides !== undefined && (overrides === null || typeof overrides !== "object")) {
      throw new TypeError("argument `overrides` must undefined or of type 'object'.");
    }
    if (overrides) {
      for (const [key, value] of Object.entries(overrides)) {
        // Disabled methods should be strictly marked with `true`, but input
        // allows for booleans, so convert `false` to `true`.
        if (value === false) {
          overrides[key] = true;
        }
      }
    }
    this[SymbolOnComplete] = new CompleteSignal();
    this.onComplete = this[SymbolOnComplete].readOnly();
    this[SymbolOnUsable] = new UsableSignal();
    this.onUsable = this[SymbolOnUsable].readOnly();
    this[SymbolPrivate] = { controller: serviceController, methods: overrides };
  }

  /**
   * Uses {@link Middleware | middleware}. Adds all `middleware` as listeners
   * to signal {@link LogicController.onUsable | `onUsable`}.
   *
   * @param middleware - Middleware to use.
   */
  public use(...middleware: Middleware[]): this {
    middleware.forEach((m) => this.onUsable.add(m));
    return this;
  }

  /**
   * Serve {@link Context | `context`} with a sane default behaviour.
   *
   * @remarks
   *
   * Will only proccess **once** on the same instance of {@link Context}.
   *
   * Throws if any observer in either
   * {@link LogicController.onUsable | `onUsable`} or
   * {@link LogicController.onComplete | `onComplete`} throws, or if the
   * underlying {@link ServiceController | controller} throws and no error
   * handler is configured.
   *
   * Also see {@link LogicController.accept},
   * {@link LogicController.reject}, and
   * {@link ServiceController.serve}.
   *
   * @privateRemarks
   *
   * **_Short_ outline of behaviour**:
   *
   * 1. Initialise `context` if not already initialised.
   * 2. Check if context is still pending
   *    - If status have been set, return here.
   * 3. Disaptch `context` to all listeners of {@link LogicController.onUsable}.
   * 4. Check status of context again, because a listener from above signal may
   *    have changed it.
   *    - If status have changed, jump to step 9.
   * 5. Check `context` with {@link LogicController.checkIfExists}
   *    - If method return false, reject with status `404` and jump to step 9.
   * 6. Check `context` with {@link LogicController.checkIfEnabled}
   *    - If method return false, reject with status `403` and jump to step 9.
   * 7. Check `context` with {@link LogicController.checkForAuth}
   *    - If method return false, reject with status `401` and jump to step 9.
   * 8. Accept and let the underlying {@link ServiceController | controller}
   *    serve `context`.
   * 9. Dispatch `context` to all listeners of
   *    {@link LogicController.onComplete}.
   *
   * @param context - {@link Context} to use.
   */
  public async serve(context: Context): Promise<void> {
    if (!context.isInitialised) {
      await context.initialise();
    }
    if (checkIfPending(context)) {
      const instance = SymbolPrivate in context.state ?
        context.state[SymbolPrivate as any] as LogicControllerInstance :
        context.state[SymbolPrivate as any] = new LogicControllerInstance(this, context);
      let step = 0;
      // Recheck status beetwen each step because an async interaction might
      // have changed it.
      while (checkIfPending(context) && step < 5) {
        switch (step++) { // tslint:disable-line:increment-decrement
          // Dispatch context to all observers of `LogicController.onUsable`.
          case 0:
            await this[SymbolOnUsable].dispatchAsync(context, instance);
            break;

          // Check if requested repository exists
          case 1:
            if (!(this.checkIfDisabled("checkIfExists") || await this.checkIfExists(context))) {
              this.reject(context, 404); // 404 Not Found
            }
            break;

          // Check if service is enabled
          case 2:
            if (!(this.checkIfDisabled("checkIfEnabled") || await this.checkIfEnabled(context))) {
              this.reject(context, 403); // 403 Forbidden
            }
            break;

          // Check for authenctication and/or authorization
          case 3:
            if (!(this.checkIfDisabled("checkForAuth") || await this.checkForAuth(context))) {
              this.reject(context, 401); // 401 Unauthorized
            }
            break;

          // Accept and serve request from context
          case 4:
            await this.accept(context); // xxx Unknown
        }
      }
      // Dispatch context to all observers of `LogicController.onComplete`.
      await this[SymbolOnComplete].dispatchAsync(context);
    }
  }

  /**
   * Marks {@link Context | `context`} as accepted and asks the underlying
   * {@link ServiceController | controller} to serve it.
   *
   * @remarks
   *
   * If `context` returns with a status in the `4xx` or `5xx` range, then it is
   * marked as a failure instead.
   *
   * @param context - {@link Context} to use.
   */
  public async accept(context: Context): Promise<void> {
    if (!checkIfPending(context)) {
      return;
    }
    // No service -> invalid input -> 404 Not Found.
    if (!context.service) {
      updateStatus(context, Status.Failure);
      context.body = undefined;
      return this.reject(context);
    }
    if (context.status > 300 && context.status < 400) {
      return this.redirect(context);
    }
    updateStatus(context, Status.Accepted);
    try {
      await this[SymbolPrivate].controller.serve(context);
    } catch (error) {
      const statusCode = error && (error.status || error.statusCode) || 500;
      context.body = undefined;
      updateStatus(context, Status.Failure);
      this.reject(context, statusCode);
      throw error;
    }
    // If no status code is below 300 with no body, reset response
    // status and body and throw error.
    if (context.status < 300 && context.length === undefined) {
      updateStatus(context, Status.Failure);
      this.reject(context, 500, `Respsonse from upstream was ${context.status}, but contained no body.`);
      throw makeError(
        "Response is within the 2xx range, but contains no body.",
        ErrorCodes.InvalidBodyFor2XX,
      );
    }
    // Reject and mark any response with a status above or equal to 400 as a
    // failure.
    if (context.status >= 400) {
      updateStatus(context, Status.Failure);
      this.reject(context);
    }
  }

  /**
   * Mark {@link Context | `context`} as rejected, and optionally set
   * {@link Context.status | status code} and plain-text
   * {@link Context.body | body}.
   *
   * @remarks
   *
   * Only works with http status error codes.
   *
   * @param context - {@link Context} to mark and use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `4xx` or `5xx` range. Defaults to `500`.
   * @param reason - Reason for rejection.
   */
  public reject(context: Context, statusCode?: number, reason?: string): void {
    if (checkIfPending(context)) {
      updateStatus(context, Status.Rejected);
    }
    else if (!checkStatus(context, Status.Failure)) {
      return;
    }
    if (!statusCode) {
      statusCode = context.status;
    }
    context.status = (statusCode < 600 && statusCode >= 400) ? statusCode : 500;
    if (!context.body || typeof reason === "string") {
      if (typeof reason !== "string") {
        reason = STATUS_CODES[context.status]!;
      }
      const body = context.body = encode(reason);
      context.type = "text/plain; charset=utf-8";
      context.length = body.length;
    }
  }

  /**
   * Redirects client with a `304` to a locally cached resource.
   *
   * @param context - {@link Context} to mark and use.
   * @param statusCode - Set to `304` to indicate a local cached resource.
   */
  public redirect(context: Context, statusCode: 304): void;
  /**
   * Redirects client with the `"Location"` header and an optional
   * {@link Response.status | status code}.
   *
   * @remarks
   *
   * Will lead to a `500` status code if the `"Location"` header is not set
   * before calling this method.
   *
   * @param context - {@link Context} to mark and use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(context: Context, statusCode?: number): void;
  /**
   * Redirects client with argument `location` and an optional
   * {@link Response.status | status code}.
   *
   * @param context - {@link Context} to mark and use.
   * @param location - The location to redirect to.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(context: Context, location: string, statusCode?: number): void;
  /**
   * Overflow signature.
   *
   * @param context - {@link Context} to mark and use.
   * @param locationOrStatus - Optional. Either the value to set for the
   *                           "Location" header or the status code to use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(context: Context, locationOrStatus?: string | number, statusCode?: number): void;
  public redirect(context: Context, location?: string | number, statusCode?: number): void {
    if (!checkIfPending(context)) {
      return;
    }
    if (typeof location === "number") {
      statusCode = location;
      location = undefined;
    }
    else if (!statusCode) {
      statusCode = context.status;
    }
    if (statusCode !== 304) {
      if (location) {
        context.setHeader("Location", location);
      }
      // Reject if either `location` or header "Location" was not found and
      // status is not 304
      else if (!context.response.headers.has("Location")) {
        context.status = 500; // Internal Server Error
        return this.reject(context);
      }
    }
    updateStatus(context, Status.Redirect);
    if (!(statusCode > 300 && statusCode < 400)) {
      statusCode = 308; // Permanent Redirect
    }
    context.status = statusCode;
    context.body = undefined;
    context.type = undefined;
    context.length = undefined;
  }

  /**
   * Mark {@link Context | `context`} as handled outside
   * {@link LogicController | controller}.
   *
   * @remarks
   *
   * All processing of {@link Context | `context`} will be haltet after this is
   * called.
   *
   * @param context - {@link Context} to mark.
   */
  public custom(context: Context): void {
    if (!checkIfPending(context)) {
      return;
    }
    updateStatus(context, Status.Custom);
  }

  /**
   * Checks if repository exists.
   *
   * @remarks
   *
   * See {@link ServiceController.checkIfExists}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if repository exists, otherwise false.
   */
  public async checkIfExists(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfExists", context, false);
  }

  /**
   * Checks if service is enabled for repository.
   *
   * @remarks
   *
   * See {@link ServiceController.checkIfEnabled}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if service is enabled for requested repository, otherwise
   *          false.
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfEnabled", context, false);
  }

  /**
   * Check for authorization to repository and/or service, and/or authentication
   * of requester.
   *
   * @remarks
   *
   * See {@link ServiceController.checkForAuth}.
   *
   * @param context - The {@link Context | context} to evaluate.
   * @returns True if request should gain access to repository and/or service.
   */
  public async checkForAuth(context: Context): Promise<boolean> {
    return this.argumentMethod("checkForAuth", context, true);
  }

  /**
   * Check if method is disabled in {@link LogicController | controller}.
   *
   * @param method - Name of method to check.
   * @returns `true` if method is disabled by controller, otherwise `false`.
   */
  private checkIfDisabled(method: keyof ServiceController): boolean {
    const { methods } = this[SymbolPrivate];
    return methods ? methods[method] === true : false;
  }

  /**
   * Argument a {@link ServiceController | controller} method. Check for and
   * (maybe) use override, and/or use original method.
   *
   * @remarks
   *
   * Will only return value from override or controller if it is a boolean.
   * If it is not a boolean, then `defaultValue` is returned.
   *
   * If `method` is "serve", then it immediately returns `defaultValue`.
   *
   * @param method - Method from {@link ServiceController | other controller} to
   *                 argument. Not allowed to pass "serve".
   * @param context - {@link Context} to pass to function.
   * @param defaultValue - Default value.
   */
  private async argumentMethod(
    method: keyof ServiceController,
    context: Context,
    defaultValue: boolean,
  ): Promise<boolean> {
    if (method !== "serve") {
      const { controller, methods } = this[SymbolPrivate];
      const fnOrValue = methods && methods[method];
      if (fnOrValue === true) {
        return defaultValue;
      }
      if (fnOrValue) {
        const instance = SymbolPrivate in context.state ?
          context.state[SymbolPrivate as any] as LogicControllerInstance :
          context.state[SymbolPrivate as any] = new LogicControllerInstance(this, context);
        const result = await callWithInstance(fnOrValue, context, instance);
        if (typeof result === "boolean") {
          return result;
        }
      }
      const fn = controller[method];
      if (fn) {
        const result = await fn.call(controller, context);
        if (typeof result === "boolean") {
          return result;
        }
      }
    }
    return defaultValue;
  }
}

/**
 * A bound instance between a {@link LogicController} and {@link Context}.
 *
 * @public
 */
export class LogicControllerInstance {
  /**
   * Private declaration(s).
   *
   * @privateRemarks
   *
   * The bound {@link LogicController} for instance.
   */
  private [SymbolPrivate]: LogicController;

  /**
   * Bound {@link Context} for instance.
   */
  public readonly context: Context;

  /**
   * Create an new instance.
   *
   * @privateRemarks
   *
   * Should only be called by {@link LogicController}.
   *
   * @param controller - {@link LogicController} to bind.
   * @param context - {@link Context} to bind.
   * @internal
   */
  public constructor(controller: LogicController, context: Context) {
    this[SymbolPrivate] = controller;
    this.context = context;
  }

  /**
   * Marks {@link LogicControllerInstance.context | `context`} as accepted and
   * asks the underlying {@link ServiceController | controller} to serve it.
   *
   * @remarks
   *
   * If `context` returns with a status in the `4xx` or `5xx` range, then it is
   * marked as a failure instead.
   */
  public async accept(): Promise<void> {
    return this[SymbolPrivate].accept(this.context);
  }

  /**
   * Mark {@link LogicControllerInstance.context | `context`} as handled outside
   * {@link LogicController | controller}.
   *
   * @remarks
   *
   * All processing of {@link Context | context} will be haltet after this is
   * called.
   */
  public custom(): void {
    return this[SymbolPrivate].custom(this.context);
  }

  /**
   * Mark {@link LogicControllerInstance.context | `context`} as rejected, and
   * optionally set {@link Context.status | status code} and plain-text
   * {@link Context.body | body}.
   *
   * @remarks
   *
   * Only works with http status error codes.
   *
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `4xx` or `5xx` range. Defaults to `500`.
   * @param reason - Reason for rejection.
   */
  public reject(statusCode?: number, reason?: string): void {
    return this[SymbolPrivate].reject(this.context, statusCode, reason);
  }

  /**
   * Redirects client with a `304` to a locally cached resource.
   *
   * @param statusCode - Set to `304` to indicate a local cached resource.
   */
  public redirect(statusCode: 304): void;
  /**
   * Redirects client with the `"Location"` header and an optional
   * {@link Response.status | status code}.
   *
   * @remarks
   *
   * Will lead to a `500` status code if the `"Location"` header is not set
   * before calling this method.
   *
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(statusCode?: number): void;
  /**
   * Redirects client with argument `location` and an optional
   * {@link Response.status | status code}.
   *
   * @param location - The location to redirect to.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(location: string, statusCode?: number): void;
  /**
   * Overflow signature.
   *
   * @param locationOrStatus - Optional. Either the value to set for the
   *                           "Location" header or the status code to use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `3xx` range. Defaults to `308`.
   */
  public redirect(locationOrStatus?: string | number, statusCode?: number): void;
  public redirect(location?: string | number, statusCode?: number): void {
    return this[SymbolPrivate].redirect(this.context, location, statusCode);
  }

  /**
   * Check for authorization to repository and/or service, and/or authentication
   * of requester.
   *
   * @remarks
   *
   * See {@link LogicController.checkForAuth}.
   *
   * @returns True if request should gain access to repository and/or service.
   */
  public async checkForAuth(): Promise<boolean> {
    return this[SymbolPrivate].checkForAuth(this.context);
  }

  /**
   * Checks if service is enabled for repository.
   *
   * @remarks
   *
   * See {@link LogicController.checkIfEnabled}.
   *
   * @returns True if service is enabled for requested repository, otherwise
   *          false.
   */
  public async checkIfEnabled(): Promise<boolean> {
    return this[SymbolPrivate].checkIfEnabled(this.context);
  }

  /**
   * Checks if repository exists.
   *
   * @remarks
   *
   * See {@link LogicController.checkIfExists}.
   *
   * @returns True if repository exists, otherwise false.
   */
  public async checkIfExists(): Promise<boolean> {
    return this[SymbolPrivate].checkIfExists(this.context);
  }
}

/**
 * Middeware for {@link LogicController}.
 *
 * @remarks
 *
 * All middleware are registered as listeners for signal
 * {@link LogicController.onUsable}.
 *
 * @param this - Refers to a {@link LogicControllerInstance | bound instance} of
 *               the {@link LogicController | controller} calling the
 *               {@link MethodOverride | method}.
 * @param context - {@link Context} to use.
 * @public
 */
export type Middleware = (this: LogicControllerInstance, context: Context) => any;

/**
 * {@link MethodOverride | Method overrides} used by {@link LogicController}.
 *
 * @remarks
 *
 * It is possible to disable a method by setting its value here to either
 * `false` or `true` instead of a {@link MethodOverride | function}.
 *
 * All methods should return directly, or through a promise-like resolving to,
 * either a boolean (`true` or `false`) or void (`undefined`). If the method
 * returns void, control is handed back to the method being overriden.
 *
 * @public
 */
export type MethodOverrides = Partial<Record<Exclude<keyof ServiceController, "serve">, boolean | MethodOverride>>;

/**
 * A method overriding functinoality for a method in
 * {@link ServiceController}.
 *
 * @remarks
 *
 * @param this - Refers to a {@link LogicControllerInstance | bound instance} of
 *               the {@link LogicController | controller} calling the
 *               {@link MethodOverride | method}.
 * @param context - {@link Context} to check.
 * @returns Either a boolean or undefined.
 *
 * @public
 */
export type MethodOverride = (this: LogicControllerInstance, context: Context) =>
  (void | boolean) | Promise<void | boolean> | PromiseLike<void | boolean>;
