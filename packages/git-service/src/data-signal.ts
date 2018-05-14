import { createHash } from "crypto";
import { SignalPriority } from "./enums";
import { ISignalHandle } from "./interfaces";
import { Signal } from "./signal";

/**
 * Plugable async data holder.
 */
export class DataSignal<P extends object> extends Signal<P | undefined> {
  /**
   * Resolves when data is ready. If any errors occurred it will throw
   * the first error.
   */
  public readonly awaitData: Promise<P>;
  /**
   * Static boolean to check if data is ready.
   */
  public readonly isFinished: boolean;
  /**
   * Dispatched when any error ocurr.
   */
  public readonly onError: Signal<any>;

  private __isFinished = false;
  private __isDispatched = false;
  private __signature: string = undefined;
  private __resolve?: (payload: P) => void;

  constructor(data?: P | Promise<P>) {
    super();
    Object.defineProperties(this, {
      isFinished: {
        get(this: DataSignal<P>) {
          return this.__isFinished;
        },
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
    });
    Object.defineProperty(this, "awaitData", {
      value: new Promise((resolve) => {
        this.__resolve = resolve;
      }),
      writable: false,
    });
    if (data) {
      this.dispatch(data);
    }
  }

  public add(fn: ISignalHandle<P>, priority?: SignalPriority | number) {
    return this.addOnce(fn, priority);
  }

  /**
   * Creates a signature for data.
   */
  public async createSignature(): Promise<string> {
    if (this.__signature) {
      return this.__signature;
    }
    try {
      return this.__signature = createHash("sha256").update(JSON.stringify(await this.awaitData)).digest("hex");
    } catch (error) {
      this.dispatchError(error);
    }
  }

  /**
   * Dispatches `payload` safely liseners. Passes thrown errors to `onError`.
   */
  public async dispatch(payload: P | PromiseLike<P>) {
    if (!this.__isDispatched) {
      this.__isDispatched = true;
      let data: P;
      try {
        data = await payload;
        await super.dispatch(data);
      } catch (error) {
        this.dispatchError(error);
      } finally {
        this.__isFinished = true;
        this.__resolve(data);
        delete this.__resolve;
      }
    }
  }

  private dispatchError(error: any) {
    setImmediate(() => this.onError.dispatch(error));
  }
}
