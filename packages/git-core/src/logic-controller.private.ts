import { Signal } from "micro-signals";
import { Context } from "./context";
import { LogicControllerInstance } from "./logic-controller";

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
 * We can only promote status once, except for failures, which can only be
 * set after request was accepted.
 */
export function updateStatus(context: Context, status: Status): void {
  // We can only update promote status once,
  if (checkIfPending(context)) {
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
   * Indicate the request was neither accepted nor rejected, but handled by a
   * listener in {@link LogicController.onUsable}.
   */
  Custom,
}

export class UsableSignal extends Signal<Context> {
  // Dispatch payload to observers one at the time, till request is not pending.
  public async dispatchAsync(context: Context, thisArg: LogicControllerInstance): Promise<void> {
    if (this._listeners.size && checkIfPending(context)) {
      for (const fn of this._listeners) {
        await fn.call(thisArg, context);
        if (!checkIfPending(context)) {
          break;
        }
      }
    }
  }
}

export class CompleteSignal extends Signal<Context> {
  // Dispatch payload to observers in parallel, and await results.
  public async dispatchAsync(context: Context): Promise<void> {
    if (this._listeners.size && !checkIfPending(context)) {
      await Promise.all(Array.from(this._listeners).map(async (fn) => fn.call(void 0, context)));
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
