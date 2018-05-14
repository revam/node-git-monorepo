import { SignalPriority } from "./enums";
import { IReadableSignal, ISignalHandle, IWritableSignal } from './interfaces';

/**
 * Custom signal observer pattern.
 *
 * Each listener have their own priority, and multiple listeners of with same
 * priority are grouped together. When a payload is dispated, it travels
 * upwards the priority ladder, so lower priorities gets payload first.
 */
export class Signal<P> implements IReadableSignal<P>, IWritableSignal<P> {
  private __raw: Map<number, Set<ISignalHandle<P>>>;

  /**
   * Creates a new instance.
   */
  constructor() {
    this.__raw = new Map();
  }

  /**
   * Number of registered active listeners.
   */
  public get count() {
    return Array.from(this.__raw).reduce((t, [_, v]) => t + v.size, 0);
  }

  /**
   * Adds a listener.
   * Lower proirities are fired first.
   * @param fn Listener function.
   * @param priority Listener priority. Default is `SignalPriority.Normal`.
   */
  public add(fn: ISignalHandle<P>, priority?: SignalPriority | number): void;
  public add(fn: ISignalHandle<P>, priority: number = SignalPriority.Normal): void {
    this.purgeHandle(fn);
    this.__add(fn, priority);
  }

  /**
   * Adds a one-time listener.
   * Lower proirities are fired first.
   * @param fn Listener function.
   * @param priority Listener priority. Default is `SignalPriority.Normal`.
   */
  public addOnce(fn: ISignalHandle<P>, priority?: SignalPriority | number): void;
  public addOnce(fn: ISignalHandle<P>, priority: number = SignalPriority.Normal): void {
    this.purgeHandle(fn);
    // Mark as one-time listener.
    if (!(SymbolOnce in fn)) {
      fn[SymbolOnce] = new Set().add(this);
    }
    fn[SymbolOnce].add(this);
    this.__add(fn, priority);
  }

  private __add(fn: ISignalHandle<P>, priority: number) {
    if (!this.__raw.has(priority)) {
      const set = new Set().add(fn);
      this.__raw.set(priority, set);
    } else {
      this.__raw.get(priority).add(fn);
    }
  }

  /**
   * Checks if signal contains listener.
   * @param fn Listener function.
   * @return Number of listeners found.
   */
  public has(fn: ISignalHandle<P>): number;
  /**
   * Checks if signal contains priority group.
   * @param group Priority group.
   * @return Number of listeners found in group.
   */
  public has(group: SignalPriority | number): number;
  public has(id: ISignalHandle<P> | number): number {
    if (typeof id === "number") {
      return this.hasGroup(id);
    }
    return this.hasHandle(id);
  }

  private hasGroup(group: number): number {
    return typeof group === "number" && this.__raw.has(group) ? this.__raw.get(group).size : 0;
  }

  private hasHandle(fn: ISignalHandle<P>): number {
    return typeof fn === "function" && SymbolPriority in fn ? Number(fn[SymbolPriority].has(this)) : 0;
  }

  /**
   * Removes listener.
   * @param fn Listener function.
   * @return Number of removed listeners.
   */
  public remove(fn: ISignalHandle<P>): number;
  /**
   * Removes listeners in priority group.
   * @param group Priority group.
   * @return Number of removed listeners.
   */
  public remove(group: SignalPriority | number): number;
  public remove(id: ISignalHandle<P> | number): number {
    if (typeof id === "number") {
      return this.removeGroup(id);
    }
    return this.removeHandle(id);
  }

  private removeGroup(group: number): number {
    if (this.__raw.has(group)) {
      const set = this.__raw.get(group);
      this.__raw.delete(group);
      for (const fn of set) {
        this.purgeHandle(fn);
      }
      return set.size;
    }
    return 0;
  }

  private removeHandle(fn: ISignalHandle<P>) {
    if (this.hasHandle(fn)) {
      const group = fn[SymbolPriority].get(this);
      this.__raw.get(group).delete(fn);
      this.purgeHandle(fn);
      return 1;
    }
    return 0;
  }

  private purgeHandle(fn: ISignalHandle<P>) {
    if (SymbolOnce in fn) {
      fn[SymbolOnce].delete(this);
    }
    if (SymbolPriority in fn) {
      fn[SymbolPriority].delete(this);
    }
  }

  /**
   * Deletes all listeners across all groups.
   * @return Number of removed listeners.
   */
  public clear(): number {
    return Array.from(this.__raw.keys()).reduce((t, p) => t + this.remove(p), 0);
  }

  /**
   * Dispatches payload to each priority group in serial, and to each listener
   * within each group in parallel.
   * Throws the first error any listener produces.
   * @param payload Payload to dispatch
   * @return Resolves when all listeners has received payload.
   */
  public async dispatch(payload: P): Promise<void> {
    const stack = Array.from(this.__raw.keys()).sort();
    for (const weight of stack) {
      await this.dispatchGroup(payload, weight);
    }
  }

  private async dispatchGroup(payload: P, priority: number) {
    const set = this.__raw.get(priority);
    const stack = Array.from(set);
    stack.forEach((fn) => SymbolOnce in fn && fn[SymbolOnce].has(this) && this.removeHandle(fn));
    await Promise.all(stack.map(async(fn) => { await fn.call(void 0, payload); }));
  }
}

/**
 * Symbol Priority - sort handles by priority.
 */
export const SymbolPriority = Symbol("priority");

/**
 * Symbol Once - remove handle after single use.
 */
export const SymbolOnce = Symbol("once");
