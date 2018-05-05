import { ISignal } from "./interfaces";

export { Signal as default };

/**
 * Simple class implementing ISignal
 */
export class Signal<P> implements ISignal<P> {
  private __raw: Set<(payload: P) => any>;
  constructor() {
    this.__raw = new Set();
  }

  public get count() {
    return this.__raw.size;
  }

  public add(fn: (payload: P) => any): void {
    this.__raw.add(fn);
    if (fn[SymbolSignals] && fn[SymbolSignals].has(this)) {
      (fn[SymbolSignals] as Set<Signal<any>>).delete(this);
    }
  }

  public addOnce(fn: (payload: P) => any): void {
    if (!(SymbolSignals in fn)) {
      fn[SymbolSignals] = new Set();
    }
    (fn[SymbolSignals] as Set<Signal<any>>).add(this);
    this.__raw.add(fn);
  }

  public has(fn: (payload: P) => any): boolean {
    return this.__raw.has(fn);
  }

  public delete(fn: (payload: P) => any): boolean {
    return this.__raw.delete(fn);
  }

  public async dispatch(payload: P): Promise<void> {
    const stack = Array.from(this.__raw);
    // Remove singular listeners from stack
    stack.forEach((fn) => {
      if (fn[SymbolSignals] && fn[SymbolSignals].has(this)) {
        fn[SymbolSignals].delete(this);
        this.__raw.delete(fn);
      }
    });
    await Promise.all(stack.map(async(fn) => { await fn.call(void 0, payload); }));
  }
}

const SymbolSignals = Symbol("signals");
