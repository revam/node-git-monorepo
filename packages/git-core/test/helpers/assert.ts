import * as assert from "assert";
import { ErrorCodes } from "../../src/enum";
import { ExtendedError } from "../../src/main";

export { deepStrictEqual, fail, notDeepStrictEqual, notStrictEqual, ok, strictEqual } from "assert";

export function isExtendedError(arg: unknown): arg is ExtendedError {
  // Test if argument is an extended error
  return arg instanceof Error && Boolean((arg as Error & Partial<ExtendedError>).code);
}

export async function resolves<T>(promise: T | PromiseLike<T>): Promise<T | never>;
export async function resolves<T>(promise: T | PromiseLike<T>, expected: T): Promise<T | never>;
export async function resolves<T>(promise: T | PromiseLike<T>, ...rest: [T?]): Promise<T | never> {
  const result = await fufillPromise(promise);
  if (!result.done) {
    if (result.error !== undefined) {
      throw new Error(`Expected promise to resolve, but rejected with value: ${result.error}`);
    }
    throw new Error("Expected promise to resolve, but rejected instead");
  }
  const { value } = result;
  if (rest.length >= 1) {
    const expected = rest[0];
    if (typeof expected === "object") {
      assert.deepStrictEqual(value, expected, "Expected resolved value to deep strict equal expected value.");
    }
    else {
      assert.strictEqual(value, expected, "Expected resolved value to strict equal expected value.");
    }
  }
  return value;
}

export async function rejectsWithCode<T>(promise: T | PromiseLike<T>, code: ErrorCodes): Promise<void | never> {
  const result = await fufillPromise(promise);
  if (result.done) {
    if (result.value === undefined) {
      throw new Error("Expected promise to reject, but instead resolved silently.");
    }
    throw new Error(`Expected promise to reject, but instead resolved with value ${result.value}.`);
  }
  const { error } = result;
  if (!isExtendedError(error)) {
    throw new TypeError("Expected rejection value to implement interface ExtendedError.");
  }
  assert.strictEqual(error.code, code, `Expected code to be "${code}", got "${error.code}".`);
}

async function fufillPromise<T>(
  promise: T | PromiseLike<T>,
): Promise<{ done: true; value: T } | { done: false; error: any }> {
  const symbolResolution = Symbol("resolved");
  let value: T;
  let error: any;
  const result = await Promise.resolve(promise).then((v) => { value = v; return symbolResolution; }, (e) => { error = e; });
  if (result === symbolResolution) {
    return { done: true, value: value! };
  }
  return { done: false, error };
}
