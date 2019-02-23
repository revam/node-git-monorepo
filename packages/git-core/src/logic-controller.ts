import { STATUS_CODES } from "http";
import { ReadableSignal, Signal } from "micro-signals";
import { Context } from "./context";
import { ErrorCodes, Status } from "./enums";
import { IError, IOuterError, ServiceDriver } from "./main";
import { encodeString } from "./packet-utils";

const SymbolContext = Symbol("context");
const SymbolOnError = Symbol("on error");

const SymbolOnComplete = Symbol("on complete");
class OnCompleteSignal extends Signal<Context> {
  // Dispatch payload to observers in parallel, and await results.
  public async dispatchAsync(context: Context): Promise<void> {
    try {
      if (this._listeners.size && !context.isPending) {
        await Promise.all(Array.from(this._listeners).map(async (fn) => fn.call(void 0, context)));
      }
    } catch (error) {
      throw wrapError(error, ErrorCodes.ERR_FAILED_IN_COMPLETE_SIGNAL);
    }
  }
}

const SymbolOnUsable = Symbol("on usable");
class OnUsableSignal extends Signal<Context> {
  // Dispatch payload to observers one at the time, till request is not pending.
  public async dispatchAsync(context: Context, logicController: LogicController): Promise<void> {
    try {
      if (this._listeners.size && context.isPending) {
        const thisArg = new MiddlewareContext(logicController, context);
        for (const fn of this._listeners) {
          await fn.call(thisArg, context);
          if (!context.isPending) {
            break;
          }
        }
      }
    } catch (error) {
      throw wrapError(error, ErrorCodes.ERR_FAILED_IN_USABLE_SIGNAL);
    }
  }
}

/**
 * Common logic for controlling a {@link ServiceDriver | service driver}.
 *
 * @remarks
 *
 * It also implements the {@link ServiceDriver} interface.
 *
 * @public
 */
export class LogicController implements ServiceDriver {
  /**
   * The parent signal of `onComplete`.
   * @internal
   */
  private [SymbolOnComplete]: OnCompleteSignal = new OnCompleteSignal();

  /**
   * The parent signal of `onError`.
   * @internal
   */
  private [SymbolOnError]: Signal<any> = new Signal();

  /**
   * The parent signal of `onUsable`.
   * @internal
   */
  private [SymbolOnUsable]: OnUsableSignal = new OnUsableSignal();

  /**
   * Service driver - doing the heavy-lifting for us.
   */
  public readonly driver: ServiceDriver;

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
   * @param serviceDriver - The {@link ServiceDriver | driver} to use logic on.
   */
  public constructor(serviceDriver: ServiceDriver) {
    this.driver = serviceDriver;
  }

  /**
   * Uses middleware with controller. Adds all elements in `middleware` as
   * listeners to signal `onUsable`.
   *
   * @param middleware - Middleware to use.
   */
  public use(...middleware: Middleware[]): this {
    middleware.forEach((m) =>
      this.onUsable.add((request) =>
        m.call(request[SymbolContext], request)));
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
   * underlying {@link ServiceDriver | driver} throws.
   *
   * Also see {@link (LogicController:class).accept},
   * {@link (LogicController:class).reject}, and
   * {@link (ServiceDriver:interface).serve}.
   */
  public async serve(context: Context): Promise<void> {
    if (!context.isReady) {
      await context.initialise();
    }
    if (context.isPending) {
      await this[SymbolOnUsable].dispatchAsync(context, this);
      // Recheck because an observer might have changed it.
      if (context.isPending) {
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
    if (!context.isPending) {
      return;
    }
    // No service -> invalid input -> 404 Not Found.
    if (!context.service) {
      context.updateStatus(Status.Failure);
      context.statusCode = 404;
      context.body = undefined;
      this.createPlainBodyForResponse(context);
      return;
    }
    if (context.statusCode > 300 && context.statusCode < 400) {
      return this.redirect(context);
    }
    context.updateStatus(Status.Accepted);
    try {
      await this.driver.serve(context);
    } catch (error) {
      this.dispatchError(error);
      context.statusCode = error && (error.status || error.statusCode) || 500;
      context.body = undefined;
    }
    // If no status code is set or is below 300 with no body, reset response
    // status and body and throw error.
    if (context.statusCode < 300 && !context.body) {
      const error = new Error("Response is within the 2xx range, but contains no body.") as IError;
      error.code = ErrorCodes.ERR_INVALID_BODY_FOR_2XX;
      this.dispatchError(error);
      context.statusCode = 500;
      context.body = undefined;
    }
    // Mark any response with a status above or equal to 400 as a failure.
    if (context.statusCode >= 400) {
      context.updateStatus(Status.Failure);
      this.createPlainBodyForResponse(context);
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
   *                   Code will only be set if no prior code is set.
   * @param reason - Reason for rejection.
   */
  public async reject(context: Context, statusCode?: number, reason?: string): Promise<void> {
    if (!context.isPending) {
      return;
    }
    // Redirect instead if the statusCode is in the 3xx range.
    if (context.statusCode && context.statusCode > 300 && context.statusCode < 400) {
      return this.redirect(context);
    }
    context.updateStatus(Status.Rejected);
    if (context.statusCode < 400) {
      if (!(statusCode && statusCode < 600 && statusCode >= 300)) {
        statusCode = 500;
      }
      context.statusCode = statusCode;
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
   * @param location The location to redirect to.
   */
  public redirect(request: Context, location: string, statusCode?: number): Promise<void>;
  public redirect(reqiest: Context, locationOrStatus?: string | number, statusCode?: number): Promise<void>;
  public async redirect(context: Context, location?: string | number, statusCode?: number): Promise<void> {
    if (!context.isPending) {
      return;
    }
    if (typeof location === "number") {
      statusCode = location;
      location = undefined;
    }
    if (location) {
      context.set("Location", location[0] !== "/" ? `/${location}` : location);
    }
    // Reject if no "Location" header is not found and status is not 304
    if (!context.response.headers.has("Location") && context.statusCode !== 304) {
      context.statusCode = 500;
      return this.reject(context);
    }
    context.updateStatus(Status.Redirect);
    if (!(context.statusCode > 300 && context.statusCode < 400)) {
      if (!(statusCode && statusCode > 300 && statusCode < 400)) {
        statusCode = 308;
      }
      context.statusCode = statusCode;
    }
    context.response.headers.delete("Content-Type");
    context.response.headers.delete("Content-Length");
    context.body = undefined;
  }

  /**
   * {@inheritdoc ServiceDriver.checkIfExists}
   */
  public async checkIfExists(context: Context): Promise<boolean> {
    try {
      return this.driver.checkIfExists(context);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * {@inheritdoc ServiceDriver.checkIfEnabled}
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    try {
      return this.driver.checkIfEnabled(context);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * {@inheritdoc ServiceDriver.checkForAuth}
   */
  public async checkForAuth(context: Context): Promise<boolean> {
    try {
      return this.driver.checkForAuth(context);
    } catch (error) {
      this.dispatchError(error);
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
    data: string = STATUS_CODES[context.statusCode]!,
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
    setImmediate(() => this[SymbolOnError].dispatch(error));
  }
}

/**
 * Middeware for controller.
 *
 * @public
 */
export type Middleware = (this: MiddlewareContext, context: Context) => any;

class MiddlewareContext {
  /* @internal */
  private [SymbolContext]: LogicController;

  /**
   * Request data.
   */
  public readonly context: Context;

  public constructor(controller: LogicController, request: Context) {
    this[SymbolContext] = controller;
    this.context = request;
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   * If driver returns a 4xx or 5xx, then the request is rejected and marked as
   * a failure.
   */
  public async accept(): Promise<void> {
    return this[SymbolContext].accept(this.context);
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   *
   * Will redirect if statusCode is in the 3xx range.
   *
   * @param statusCode 3xx, 4xx or 5xx http status code.
   *                   Default is `500`.
   *
   *                   Code will only be set if no prior code is set.
   * @param body Reason for rejection.
   */
  public async reject(statusCode?: number, body?: string): Promise<void> {
    return this[SymbolContext].reject(this.context, statusCode, body);
  }

  /**
   * Redirects client with "Location" header. Header must be set beforehand.
   */
  public redirect(): Promise<void>;
  /**
   * Redirects client to cached entry.
   */
  public redirect(ststuCode: 304): Promise<void>;
  /**
   * Redirects client with "Location" header.
   */
  public redirect(statusCode: number): Promise<void>;
  /**
   * Redirects client to `location`. Can optionally set status code of redirect.
   * @param location The location to redirect to.
   */
  public redirect(location: string, statusCode?: number): Promise<void>;
  public async redirect(location?: string | number, statusCode?: number): Promise<void> {
    return this[SymbolContext].redirect(this.context, location, statusCode);
  }

  /**
   * Check for access to repository and/or service.
   */
  public async checkForAccess(): Promise<boolean> {
    return this[SymbolContext].checkForAuth(this.context);
  }

  /**
   * Checks if service is enabled.
   * Can still *atempt* forcefull use of service.
   */
  public async checkIfEnabled(): Promise<boolean> {
    return this[SymbolContext].checkIfEnabled(this.context);
  }

  /**
   * Checks if repository exists.
   */
  public async checkIfExists(): Promise<boolean> {
    return this[SymbolContext].checkIfExists(this.context);
  }
}

function wrapError(error: any, code: ErrorCodes): IOuterError {
  const outerError: Partial<IOuterError> = new Error("Error thown from signal");
  outerError.code = code;
  if (error && (error.status || error.statusCode)) {
    outerError.statusCode = error.status || error.statusCode;
  }
  outerError.inner = error;
  return outerError as IOuterError;
}
