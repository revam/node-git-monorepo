import { STATUS_CODES } from "http";
import { ReadableSignal } from "micro-signals";
import { Context } from "./context";
import { ErrorCodes } from "./enum";
import {
  checkStatus,
  CompleteSignal,
  ErrorSignal,
  MiddlewareContext,
  Status,
  updateStatus,
  UsableSignal,
} from "./logic-controller.private";
import { ServiceController } from "./main";
import { checkServiceDriver, IError } from "./main.private";
import { encodeString } from "./packet-util";

const SymbolPrivate = Symbol("private");
const SymbolOnError = Symbol("on error");
const SymbolOnComplete = Symbol("on complete");
const SymbolOnUsable = Symbol("on usable");

/**
 * Shared logic for controlling another
 * {@link ServiceController | service controller} with sane defaults.
 *
 * @remarks
 *
 * Hands
 *
 * It also implements the {@link ServiceController} interface.
 *
 * @public
 */
export class LogicController implements ServiceController {
  /**
   * The parent signal of `onComplete`.
   * @internal
   */
  private [SymbolOnComplete]: CompleteSignal;

  /**
   * The parent signal of `onError`.
   * @internal
   */
  private [SymbolOnError]: ErrorSignal;

  /**
   * The parent signal of `onUsable`.
   * @internal
   */
  private [SymbolOnUsable]: UsableSignal;

  /**
   * Service driver - doing the heavy-lifting for us.
   */
  private readonly [SymbolPrivate]: { controller: ServiceController; methods?: MethodOverrides };

  /**
   * Payload is distpatched to any observer after processing if request is
   * **not** pending. If an observer returns a promise, will wait till the
   * promise resolves before continuing.
   *
   * **Note:** Request or response should __not__ be tempered with here unless
   * you know what you are doing.
   */
  public readonly onComplete: ReadableSignal<Context> = this[SymbolOnComplete].readOnly();

  /**
   * Payload is dispatched when any error is thrown from controller or the
   * underlying driver.
   */
  public readonly onError: ReadableSignal<any> = this[SymbolOnError].readOnly();

  /**
   * Payload is dispatched to each observer in series till the (observer-)stack
   * is empty or the request is no longer pending. If an observer returns a
   * promise, will wait till the promise resolves before continuing.
   */
  public readonly onUsable: ReadableSignal<Context> = this[SymbolOnUsable].readOnly();

  /**
   * Create a new {@link (LogicController:class)} instance.
   *
   * @param serviceController - The {@link ServiceController | controller} to use logic on.
   */
  public constructor(serviceController: ServiceController, overrides?: MethodOverrides) {
    if (!checkServiceDriver(serviceController)) {
      throw new TypeError("argument `serviceController` must be a valid implementation of ServiceController interface");
    }
    this[SymbolOnComplete] = new CompleteSignal();
    this[SymbolOnError] = new ErrorSignal();
    this[SymbolOnUsable] = new UsableSignal();
    this[SymbolPrivate] = { controller: serviceController, methods: overrides };
  }

  /**
   * Uses middleware with controller. Adds all elements in `middleware` as
   * listeners to signal `onUsable`.
   *
   * @param middleware - Middleware to use.
   */
  public use(...middleware: Middleware[]): this {
    middleware.forEach((m) => this.onUsable.add(m));
    return this;
  }

  /**
   * Serve with sane behaviour.
   *
   * @remarks
   *
   * Throws if any observer in either any listerners in
   * {@link (LogicController:class).onUsable | `onUsable`} or
   * {@link (LogicController:class).onComplete | `onComplete`} throws, or if the
   * underlying {@link ServiceController | controller} throws.
   *
   * Also see {@link (LogicController:class).accept},
   * {@link (LogicController:class).reject}, and
   * {@link (ServiceController:interface).serve}.
   */
  public async serve(context: Context): Promise<void> {
    if (!context.isInitialised) {
      await context.initialise();
    }
    if (checkStatus(context)) {
      await this[SymbolOnUsable].dispatchAsync(context, this);
      // Recheck because an observer might have changed it.
      if (checkStatus(context)) {
        if (! await this.checkIfExists(context)) {
          await this.reject(context, 404); // 404 Not Found
        }
        else if (! await this.checkIfEnabled(context)) {
          await this.reject(context, 403); // 403 Forbidden
        }
        else if (! await this.checkForAuth(context)) {
          await this.reject(context, 401); // 401 Unauthorized
        }
        else {
          await this.accept(context);
        }
      }
      await this[SymbolOnComplete].dispatchAsync(context);
    }
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   * If driver returns a 4xx or 5xx, then the request is rejected and marked as
   * a failure.
   *
   * @param context - An existing request.
   */
  public async accept(context: Context): Promise<void> {
    if (!checkStatus(context)) {
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
      this.dispatchError(error);
      context.status = error && (error.status || error.statusCode) || 500;
      context.body = undefined;
    }
    // If no status code is set or is below 300 with no body, reset response
    // status and body and throw error.
    if (context.status < 300 && !context.body) {
      const error = new Error("Response is within the 2xx range, but contains no body.") as IError;
      error.code = ErrorCodes.ERR_INVALID_BODY_FOR_2XX;
      this.dispatchError(error);
      context.status = 500;
      context.body = undefined;
    }
    // Reject and mark any response with a status above or equal to 400 as a
    // failure.
    if (context.status >= 400) {
      updateStatus(context, Status.Failure);
      return this.reject(context);
    }
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   *
   * Will redirect if statusCode is in the 3xx range.
   *
   * @param context - An existing request.
   * @param statusCode - 3xx, 4xx or 5xx http status code.
   *                     Default is `500`.
   *
   *                     Code will only be set if no prior code is set.
   * @param reason - Reason for rejection.
   */
  public async reject(context: Context, statusCode?: number, reason?: string): Promise<void> {
    if (checkStatus(context)) {
      // Redirect instead if the statusCode is in the 3xx range.
      if (context.status >= 300 && context.status < 400) {
        return this.redirect(context);
      }
      updateStatus(context, Status.Rejected);
    }
    else if (!checkStatus(context, Status.Failure)) {
      return;
    }
    if (context.status < 400) {
      if (!(statusCode && statusCode < 600 && statusCode >= 400)) {
        statusCode = 500;
      }
      context.status = statusCode;
    }
    this.createPlainBodyForResponse(context, reason);
  }

  /**
   * Redirects client with "Location" header. Header must be set beforehand.
   */
  public redirect(request: Context): Promise<void>;
  /**
   * Redirects client to cached entry.
   */
  public redirect(request: Context, ststuCode: 304): Promise<void>;
  /**
   * Redirects client with "Location" header.
   */
  public redirect(request: Context, statusCode: number): Promise<void>;
  /**
   * Redirects client to `location`. Can optionally set status code of redirect.
   * @param location - The location to redirect to.
   */
  public redirect(request: Context, location: string, statusCode?: number): Promise<void>;
  public redirect(reqiest: Context, locationOrStatus?: string | number, statusCode?: number): Promise<void>;
  public async redirect(context: Context, location?: string | number, statusCode?: number): Promise<void> {
    if (!checkStatus(context)) {
      return;
    }
    if (typeof location === "number") {
      statusCode = location;
      location = undefined;
    }
    if (location) {
      context.setHeader("Location", location[0] !== "/" ? `/${location}` : location);
    }
    // Reject if no "Location" header is not found and status is not 304
    if (!context.response.headers.has("Location") && context.status !== 304) {
      context.status = 500;
      return this.reject(context);
    }
    updateStatus(context, Status.Redirect);
    if (!(context.status > 300 && context.status < 400)) {
      if (!(statusCode && statusCode > 300 && statusCode < 400)) {
        statusCode = 308;
      }
      context.status = statusCode;
    }
    context.type = undefined;
    context.length = undefined;
    context.body = undefined;
  }

  /**
   * {@inheritdoc ServiceController.checkIfExists}
   */
  public async checkIfExists(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfExists", context);
  }

  /**
   * {@inheritdoc ServiceController.checkIfEnabled}
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    return this.argumentMethod("checkIfEnabled", context);
  }

  /**
   * {@inheritdoc ServiceController.checkForAuth}
   */
  public async checkForAuth(context: Context): Promise<boolean> {
    return this.argumentMethod("checkForAuth", context, true);
  }

  /**
   * Argument {@link ServiceController | controller} method with overrides and
   * check return value from controller.
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
  protected async argumentMethod(
    method: keyof ServiceController,
    context: Context,
    defaultValue: boolean = false,
  ): Promise<boolean> {
    if (method !== "serve") {
      try {
        const {controller, methods} = this[SymbolPrivate];
        const fnOrValue = methods && methods[method];
        if (typeof fnOrValue === "boolean") {
          return fnOrValue;
        }
        if (typeof fnOrValue === "function") {
          const result = await fnOrValue(context);
          if (typeof result === "boolean") {
            return result;
          }
        }
        const fn = controller[method];
        if (typeof fn === "function") {
          return controller[method]!(context);
        }
      } catch (error) {
        this.dispatchError(error);
      }
      return defaultValue;
    }
    return false;
  }

  /**
   * Creates a plain-text body for response, but only if no body exists.
   *
   * @remarks
   *
   * The body is populated with `data` and any additional messages from
   * `response.messages`.
   *
   * @param context - Context.
   * @param data - Data to write in plain text. Defaults to status message for
   *               {@link (Context:namespace).statusCode | status code}.
   */
  private createPlainBodyForResponse(
    context: Context,
    data: string = STATUS_CODES[context.status]!,
  ): void {
    if (!context.body) {
      const body = context.body = encodeString(data);
      context.type = "text/plain; charset=utf-8";
      context.length = body.length;
    }
  }

  /**
   * Dispatch error onto signal `onError`.
   */
  private dispatchError(error: any): void {
    if (this[SymbolOnError].isUsable) {
      setImmediate(() => this[SymbolOnError].dispatch(error));
    }
    else {
      throw error;
    }
  }
}

/**
 * Middeware for controller.
 *
 * @public
 */
export type Middleware = (this: MiddlewareContext, context: Context) => any;

/**
 * Overries for methods of {@link ServiceController}.
 *
 * @remarks
 *
 * It is possible to disable a method by setting its value here to true.
 *
 * All methods should act the same as the method they are overriding, but are
 * also allowed to return `undefined` (or void), in order to hand control back
 * to the overriden method.
 *
 * When a overriden method returns `undefined`, or a promise-like object
 * resolving to `undefined`, the method in question will fallback to the
 * original implementation.
 */
type MethodOverrides = Partial<Record<
  Exclude<keyof ServiceController, "serve">,
  true | ((context: Context) => (void | boolean) | Promise<void | boolean> | PromiseLike<void | boolean>)>
>;
