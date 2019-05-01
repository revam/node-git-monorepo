import { Signal } from "micro-signals";
import { Context } from "./context";
import { LogicController, LogicControllerInstance, Middleware } from "./logic-controller";

/**
 * Check {@link Context.state | context state} for {@link LogicController.Status}.
 *
 * @param context - Context to check.
 */
export function checkStatus(context: Context): LogicController.Status {
  return SymbolStatus in context.state ? context.state[SymbolStatus as any] : LogicController.Status.None;
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
export function updateStatus(context: Context, status: LogicController.Status): void {
  context.state[SymbolStatus as any] = status;
}

export const SymbolStatus = Symbol("status");

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
