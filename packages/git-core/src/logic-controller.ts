import { STATUS_CODES } from "http";
import { ReadableSignal } from "micro-signals";
import { Context } from "./context";
import {
  callWithInstance,
  checkIfPending,
  checkStatus,
  CompleteSignal,
  updateStatus,
  UsableSignal,
} from "./logic-controller.private";
import { ServiceController } from "./main";
import { checkServiceController } from "./main.private";
import { encode } from "./util/buffer";

const SymbolPrivate = Symbol("private");
const SymbolOnComplete = Symbol("on complete");
const SymbolOnUsable = Symbol("on usable");

/**
 * A {@link ServiceController} for controlling other {@link ServiceController}s
 * with a sane default logic.
 *
 * @remarks
 *
 * Have some pluggable aspects and makes configuring application-spesific
 * business-logic on top of an existing controller (e.g. {@link (FetchController:class)})
 * easier.
 *
 * @public
 */
export class LogicController implements ServiceController {
  /**
   * The parent signal of {@link (LogicController:class).onComplete}.
   *
   * @remarks
   *
   * Only accessible by {@link (LogicController:class) | **this class**}, and not
   * extending classes.
   */
  private readonly [SymbolOnComplete]: CompleteSignal;

  /**
   * The parent signal of {@link (LogicController:class).onUsable}.
   *
   * @remarks
   *
   * Only accessible by {@link (LogicController:class) | **this class**}, and not
   * extending classes.
   */
  private readonly [SymbolOnUsable]: UsableSignal;

  /**
   * Private declaration(s).
   *
   * @privateRemarks
   *
   * Contains the upstream {@link ServiceController | service controller} and
   * {@link MethodOverrides | method-override declarations}.
   */
  private readonly [SymbolPrivate]: { controller: ServiceController; methods?: MethodOverrides };

  /**
   * {@inheritdoc LogicControllerOptions.privacyMode}
   */
  private readonly privacyMode: boolean;

  /**
   * {@link Context | Payload} is dispatched after the
   * {@link (LogicController:class) | controller} has served it.
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
   * Create a new instance of {@link (LogicController:class)}.
   *
   * @param upstream - The upstream {@link ServiceController | controller}.
   * @param options - {@link LogicControllerOptions | Optional options}.
   */
  public constructor(upstream: ServiceController, options: LogicControllerOptions = {}) {
    if (!checkServiceController(upstream)) {
      throw new TypeError("argument `upstream` must confront to the ServiceController interface");
    }
    const { overrides, privacyMode = false } = options;
    if (overrides !== undefined && (overrides === null || typeof overrides !== "object")) {
      throw new TypeError("argument `options.overrides` must be `undefined` or of type 'object'.");
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
    this[SymbolPrivate] = { controller: upstream, methods: overrides };
    this.privacyMode = privacyMode;
  }

  /**
   * Uses {@link Middleware | middleware}. Adds all `middleware` as listeners
   * to signal {@link (LogicController:class).onUsable | `onUsable`}.
   *
   * @param middleware - Middleware to use.
   */
  public use(...middleware: Middleware[]): this {
    middleware.forEach((m) => this[SymbolOnUsable].add(m));
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
   * {@link (LogicController:class).onUsable | `onUsable`} or
   * {@link (LogicController:class).onComplete | `onComplete`} throws, or if the
   * underlying {@link ServiceController | controller} throws and no error
   * handler is configured.
   *
   * Also see {@link (LogicController:class).accept},
   * {@link (LogicController:class).reject}, and
   * {@link ServiceController.serve}.
   *
   * @param context - {@link Context} to use.
   */
  public async serve(context: Context): Promise<void> {
    if (!context.isInitialised) {
      await context.initialise();
    }
    if (checkIfPending(context)) {
      let step = 0;
      do {
        switch (step++) { // tslint:disable-line:increment-decrement
          // Dispatch context to all observers of `LogicController.onUsable`.
          case 0:
            // Store/retrive instance from context.state under private symbol.
            const instance = SymbolPrivate in context.state ?
              context.state[SymbolPrivate as any] as LogicControllerInstance :
              context.state[SymbolPrivate as any] = new LogicControllerInstance(this, context);
            await this[SymbolOnUsable].dispatchAsync(context, instance);
            break;

          // Return early if no service or path is available.
          case 1:
            if (context.service === undefined || context.path === undefined) {
              this.__failure(context, this.checkForPrivacy(400)); // 400 Bad Request
            }
            break;

          // Check if requested repository exists
          case 2:
            if (!(this.checkIfDisabled("checkIfExists") || await this.checkIfExists(context))) {
              this.reject(context, 404); // 404 Not Found
            }
            break;

          // Check if service is enabled
          case 3:
            if (!(this.checkIfDisabled("checkIfEnabled") || await this.checkIfEnabled(context))) {
              this.reject(context, this.checkForPrivacy(403)); // 403 Forbidden
            }
            break;

          // Check for authenctication and/or authorization
          case 4:
            if (!(this.checkIfDisabled("checkForAuth") || await this.checkForAuth(context))) {
              this.reject(context, this.checkForPrivacy(401)); // 401 Unauthorized
            }
            break;

          // Accept and serve request from context
          case 5:
            await this.accept(context); // xxx Unknown
        }
      // Check status between each step because an async interaction MAY have changed it.
      } while (checkIfPending(context));
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
   * If `context` have a status in the `4xx` or `5xx` range after returning from
   * upstream {@link ServiceController | controller}, then it is marked as a
   * failure and the response body from upstream is discarded.
   *
   * @param context - {@link Context} to use.
   */
  public async accept(context: Context): Promise<void> {
    if (!checkIfPending(context)) {
      return;
    }
    updateStatus(context, LogicController.Status.Accepted);
    try {
      await this[SymbolPrivate].controller.serve(context);
    } catch (error) {
      const statusCode = error && (error.status || error.statusCode) || 500;
      const reason: string | undefined = error && (error.expose === true && error.message) ? error.message : undefined;
      this.__failure(context, statusCode, reason);
      throw error;
    }
    // Report as failure if status is set above 400.
    if (context.status >= 400) {
      this.__failure(context);
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
    if (!checkIfPending(context)) {
      return;
    }
    updateStatus(context, LogicController.Status.Rejected);
    this.__reject(context, statusCode, reason);
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
    updateStatus(context, LogicController.Status.Redirect);
    if (typeof location === "number") {
      statusCode = location;
      location = undefined;
    }
    else if (!statusCode) {
      statusCode = context.status;
    }
    // Only check/set location if status is **NOT** 304.
    if (statusCode !== 304) {
      // Set header if `location` is provided.
      if (location) {
        context.setHeader("Location", location);
      }
      // Fail if header was not found
      else if (!context.response.headers.has("Location")) {
        return this.__failure(context, 500); // Internal Server Error
      }
    }
    if (!(statusCode > 300 && statusCode < 400)) {
      statusCode = 308; // Permanent Redirect
    }
    context.status = statusCode;
    this.__encodeBody(context, STATUS_CODES[statusCode]!);
  }

  /**
   * Mark {@link Context | `context`} as handled outside
   * {@link (LogicController:class) | controller}.
   *
   * @remarks
   *
   * All processing of {@link Context | `context`} will be haltet after this is
   * called.
   *
   * @param context - {@link Context} to mark.
   */
  public setCustom(context: Context): void {
    if (!checkIfPending(context)) {
      return;
    }
    updateStatus(context, LogicController.Status.Custom);
  }

  // tslint:disable:promise-function-async

  /**
   * {@inheritdoc ServiceController.checkForAuth}
   */
  public checkForAuth(context: Context): Promise<boolean> {
    return this.argumentMethod("checkForAuth", context, true);
  }

  /**
   * {@inheritdoc ServiceController.checkIfEnabled}
   */
  public checkIfEnabled(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfEnabled", context, false);
  }

  /**
   * {@inheritdoc ServiceController.checkIfExists}
   */
  public checkIfExists(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfExists", context, false);
  }

  // tslint:enable:promise-function-async

  /**
   * Mark {@link Context | `context`} as a failure, and optionally set
   * {@link Context.status | status code} and plain-text
   * {@link Context.body | body}.
   *
   * @param context - {@link Context} to mark and use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `4xx` or `5xx` range. Defaults to `500`.
   * @param reason - Reason for failure.
   */
  private __failure(context: Context, statusCode?: number, reason?: string): void {
    updateStatus(context, LogicController.Status.Failure);
    context.body = undefined;
    this.__reject(context, statusCode, reason);
  }

  /**
   *
   * @param context - {@link Context} to use.
   * @param statusCode - Optional. The status sent with response. Must be in the
   *                     `4xx` or `5xx` range. Defaults to `500`.
   * @param reason - Reason for rejection.
   */
  private __reject(context: Context, statusCode?: number, reason?: string): void {
    if (!statusCode) {
      statusCode = context.status;
    }
    context.status = (statusCode < 600 && statusCode >= 400) ? statusCode : 500;
    if (!context.body || typeof reason === "string") {
      if (typeof reason !== "string") {
        reason = STATUS_CODES[context.status]!;
      }
      this.__encodeBody(context, reason);
    }
  }

  /**
   * Encode context body from `text`.
   *
   * @param context - {@link Context} to use.
   * @param text - Text to encode in {@link Context.body | body}.
   */
  private __encodeBody(context: Context, text: string): void {
    const body = context.body = encode(text);
    context.type = "text/plain; charset=utf-8";
    context.length = body.length;
  }

  /**
   * Check if method is disabled.
   *
   * @param method - Name of method to check.
   * @returns `true` if method is disabled by controller, otherwise `false`.
   */
  private checkIfDisabled(method: keyof MethodOverrides): boolean {
    const { methods } = this[SymbolPrivate];
    return methods ? methods[method] === true : false;
  }

  /**
   * Check if {@link (LogicController:class).privacyMode} is set, and return
   * status code accordingly.
   *
   * @param status - Status code to set.
   * @returns Returns `404` if {@link LogicControllerOptions.privacyMode} is
   *          true, returns otherwise `status`.
   */
  private checkForPrivacy(status: number): number {
    return this.privacyMode ? 404 : status;
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
    method: keyof MethodOverrides,
    context: Context,
    defaultValue: boolean,
  ): Promise<boolean> {
    const { controller, methods } = this[SymbolPrivate];
    const fnOrValue = methods && methods[method];
    if (fnOrValue === true) {
      return defaultValue;
    }
    if (fnOrValue) {
      // Store/retrive instance from context.state under private symbol.
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
    return defaultValue;
  }

  /**
   * Check {@link (LogicController:namespace).Status | status} for `context`.
   *
   * @param context - {@link (Context:class) | Context} to use.
   */
  public static checkStatus(context: Context): LogicController.Status {
    return checkStatus(context);
  }
}

export namespace LogicController {
  /**
   * Status of
   *
   * @public
   */
  export const enum Status {
    /**
     * The request has not been used with a {@link (LogicController:class)} yet.
     */
    None = "None",
    /**
     * The request was accepted.
     */
    Accepted = "Accepted",
    /**
     * The request was rejected.
     */
    Rejected = "Rejected",
    /**
     * The request resulted in a failure.
     */
    Failure = "Failure",
    /**
     * The request is being redirected.
     */
    Redirect = "Redirect",
    /**
     * The request was handled by a third-party.
     */
    Custom = "Custom",
  }
}

/**
 * Options for {@link (LogicController:class)}.
 *
 * @public
 */
export interface LogicControllerOptions {
  /**
   * Override _some_ method definitions from {@link ServiceController}. See
   * {@link MethodOverrides} for more info.
   *
   * @defaultValue
   *
   * Not set.
   */
  overrides?: MethodOverrides;
  /**
   * Sets all rejections in {@link (LogicController:class).serve} to use status
   * code `404`, as to protect the _privacy_ of hidden repositories by not
   * telling the clients what exist and what not.
   *
   * @remarks
   *
   * It is recommended to turn this of, bacause it interfares with the git
   * client when requesting use of the {@link Service.ReceivePack} with
   * auth. by **NOT** sending the expected `401` status code.
   *
   * @defaultValue
   *
   * Defaults to `false`.
   */
  privacyMode?: boolean;
}

/**
 * A bound instance between a {@link (LogicController:class)} and
 * {@link (Context:class)}.
 *
 * @public
 */
export class LogicControllerInstance {
  /**
   * Private declaration(s).
   *
   * @privateRemarks
   *
   * The bound {@link (LogicController:class)} for instance.
   */
  private readonly [SymbolPrivate]: LogicController;

  /**
   * Bound {@link Context} for instance.
   */
  public readonly context: Context;

  /**
   * Create an new instance.
   *
   * @privateRemarks
   *
   * Should only be called by {@link (LogicController:class)}.
   *
   * @param controller - {@link (LogicController:class)} to bind.
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
   * {@link (LogicController:class) | controller}.
   *
   * @remarks
   *
   * All processing of {@link Context | context} will be haltet after this is
   * called.
   */
  public setCustom(): void {
    return this[SymbolPrivate].setCustom(this.context);
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
   * See {@link (LogicController:class).checkForAuth}.
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
   * See {@link (LogicController:class).checkIfEnabled}.
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
   * See {@link (LogicController:class).checkIfExists}.
   *
   * @returns True if repository exists, otherwise false.
   */
  public async checkIfExists(): Promise<boolean> {
    return this[SymbolPrivate].checkIfExists(this.context);
  }
}

/**
 * Middeware for {@link (LogicController:class)}.
 *
 * @remarks
 *
 * All middleware are registered as listeners for signal
 * {@link (LogicController:class).onUsable}.
 *
 * @param this - Refers to a {@link LogicControllerInstance | bound instance} of
 *               the {@link (LogicController:class) | controller} calling the
 *               {@link MethodOverride | method}.
 * @param context - {@link Context} to use.
 * @public
 */
export type Middleware = (this: LogicControllerInstance, context: Context) => any;

/**
 * {@link MethodOverride | Method overrides} used by {@link (LogicController:class)}.
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
 *               the {@link (LogicController:class) | controller} calling the
 *               {@link MethodOverride | method}.
 * @param context - {@link Context} to check.
 * @returns Either a boolean or undefined.
 *
 * @public
 */
export type MethodOverride = (this: LogicControllerInstance, context: Context) =>
  (void | boolean) | Promise<void | boolean> | PromiseLike<void | boolean>;
