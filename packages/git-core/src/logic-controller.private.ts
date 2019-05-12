import { Signal } from "micro-signals";
import { Context } from "./context";
import { LogicController, LogicControllerInstance, Middleware } from "./logic-controller";

export class UsableSignal extends Signal<Context> {
  /**
   * All listeners to this signal are {@link Middleware | middleware}.
   */
  protected _listeners: Set<Middleware>;

  /**
   * Check if signal is usable.
   */
  public get isUsable(): boolean {
    return this._listeners.size > 0;
  }

  /**
   * Dispatch payload to observers one at the time, till request is not pending.
   *
   * @param context - {@link Context} to dispatch to listeners.
   * @param instance - {@link LogicControllerInstance | Instance} to bind to
   *                   listeners as `this`.
   */
  public async dispatchAsync(context: Context, controller: LogicController, instance: LogicControllerInstance): Promise<void> {
    for (const fn of this._listeners) {
      await fn.call(instance, context);
      if (!controller.checkIfPending(context)) {
        break;
      }
    }
  }
}

export class CompleteSignal extends Signal<Context> {
  /**
   * Check if signal is usable.
   */
  public get isUsable(): boolean {
    return this._listeners.size > 0;
  }

  /**
   * Dispatch payload to observers in parallel, and await results.
   *
   * @param context- {@link Context} to dispatch to listeners.
   */
  public async dispatchAsync(context: Context): Promise<void> {
    await Promise.all(Array.from(this._listeners).map(async (fn) => fn(context)));
  }
}
