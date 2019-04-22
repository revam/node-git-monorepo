import { Signal } from "micro-signals";
import { Context } from "./context";
import { LogicControllerInstance, Middleware } from "./logic-controller";

/**
 * Check {@link Context.state | context state} for status.
 *
 * @param context - Context to check.
 * @param status - Status to check for.
 */
export function checkStatus(context: Context, status: Status): boolean {
  return SymbolStatus in context.state && context.state[SymbolStatus as any] === status;
}

/**
 * Check if status symbol id defined in {@link Context.state | context state}.
 *
 * @param context - Context to check.
 */
export function checkIfPending(context: Context): boolean {
  return !(SymbolStatus in context.state);
}

/**
 * Update status in {@link Context.state}.
 *
 * @remarks
 *
 * We can only promote status once, except for failures, which can be
 * set at any time.
 */
export function updateStatus(context: Context, status: Status): void {
  if (checkIfPending(context) || status === Status.Failure) {
    context.state[SymbolStatus as any] = status;
  }
}

export const SymbolStatus: symbol = Symbol("status");

/**
 * Request service status.
 *
 * @public
 */
export const enum Status {
  /**
   * Indicate the request was accepted.
   */
  Accepted,
  /**
   * Indicate the request was rejected.
   */
  Rejected,
  /**
   * Indicate the request was initially accepted, but ended in failure.
   */
  Failure,
  /**
   * Indicate the repository has moved and the request is being redirected.
   */
  Redirect,
  /**
   * Indicate the request was neither accepted nor rejected, but otherwise
   * handled by third-party using the library.
   */
  Custom,
}

export class UsableSignal extends Signal<Context> {
  /**
   * All listeners to this signal are {@link Middleware | middleware}.
   */
  protected _listeners: Set<Middleware>;

  /**
   * Dispatch payload to observers one at the time, till request is not pending.
   *
   * @param context - {@link Context} to dispatch to listeners.
   * @param instance - {@link LogicControllerInstance | Instance} to bind to
   *                   listeners as `this`.
   */
  public async dispatchAsync(context: Context, instance: LogicControllerInstance): Promise<void> {
    if (this._listeners.size && checkIfPending(context)) {
      for (const fn of this._listeners) {
        await fn.call(instance, context);
        if (!checkIfPending(context)) {
          break;
        }
      }
    }
  }
}

export class CompleteSignal extends Signal<Context> {
  /**
   * Dispatch payload to observers in parallel, and await results.
   *
   * @param context- {@link Context} to dispatch to listeners.
   */
  public async dispatchAsync(context: Context): Promise<void> {
    if (this._listeners.size && !checkIfPending(context)) {
      await Promise.all(Array.from(this._listeners).map(async (fn) => fn.call(undefined, context)));
    }
  }
}

export async function callWithInstance(
  fn: (this: LogicControllerInstance, context: Context) => (boolean | void) | Promise<boolean | void> | PromiseLike<boolean | void>,
  context: Context,
  thisArg: LogicControllerInstance,
): Promise<boolean | void> {
  return fn.call(thisArg, context);
}
