import { Signal } from "micro-signals";
import { Context } from "./context";
import { ErrorCodes } from "./enum";
import { LogicController } from "./logic-controller";
import { IOuterError } from "./main.private";

/**
 * Check {@link Context.state | context state} for status.
 *
 * @remarks
 *
 * Don't pass a second argument to check if status is set, pass a second
 * argument to check if set status is equal.
 *
 * @param context - Context to check.
 * @param status - Status to check for. Ignore to check for no state.
 */
export function checkStatus(context: Context, status?: Status): boolean {
  const inState = SymbolStatus in context.state;
  return status ? !inState : inState && context.state[SymbolStatus as any] === status;
}

/**
 * Update status in {@link Context.state}.
 *
 * @remarks
 *
 * We can only promote status once, except for failures, which can only be
 * set after request was accepted.
 */
export function updateStatus(context: Context, status: Status): void {
  // We can only update promote status once,
  if (checkStatus(context)) {
    context.state[SymbolStatus as any] = status;
  }
  // except for failures, which can still be set if status is `Status.Accepted`.
  else if (checkStatus(context, Status.Accepted) && status === Status.Failure) {
    context.state[SymbolStatus as any] = Status.Failure;
  }
}

export const SymbolStatus: symbol = Symbol("status");

/**
 * Request service status.
 *
 * @public
 */
export enum Status {
  /**
   * Indicate the request was accepted.
   */
  Accepted = "Accepted",
  /**
   * Indicate the request was rejected.
   */
  Rejected = "Rejected",
  /**
   * Indicate the request was initially accepted, but ended in failure.
   */
  Failure = "Failure",
  /**
   * Indicate the repository has moved and the request is being redirected.
   */
  Redirect = "Redirect",
}

export class ErrorSignal extends Signal<any> {
  public get isUsable(): boolean {
    return this._listeners.size > 0;
  }
}

export class UsableSignal extends Signal<Context> {
  // Dispatch payload to observers one at the time, till request is not pending.
  public async dispatchAsync(context: Context, logicController: LogicController): Promise<void> {
    try {
      if (this._listeners.size && checkStatus(context)) {
        const thisArg = new MiddlewareContext(logicController, context);
        for (const fn of this._listeners) {
          await fn.call(thisArg, context);
          if (!checkStatus(context)) {
            break;
          }
        }
      }
    } catch (error) {
      throw wrapError(error, ErrorCodes.ERR_FAILED_IN_USABLE_SIGNAL);
    }
  }
}

export class CompleteSignal extends Signal<Context> {
  // Dispatch payload to observers in parallel, and await results.
  public async dispatchAsync(context: Context): Promise<void> {
    try {
      if (this._listeners.size && !checkStatus(context)) {
        await Promise.all(Array.from(this._listeners).map(async (fn) => fn.call(void 0, context)));
      }
    } catch (error) {
      throw wrapError(error, ErrorCodes.ERR_FAILED_IN_COMPLETE_SIGNAL);
    }
  }
}

const SymbolContext = Symbol("context");

export class MiddlewareContext {
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
