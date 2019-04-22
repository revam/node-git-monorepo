import { ErrorCodes } from "./enum";
import { ExtendedError } from "./main";
import * as lib from "./main.private";

describe("function checkServiceDriver()", () => {
  test("unallowed values", () => {
    expect(lib.checkServiceController(undefined)).toBe(false);
    expect(lib.checkServiceController("")).toBe(false);
    expect(lib.checkServiceController(Symbol())).toBe(false);
    expect(lib.checkServiceController(1)).toBe(false);
    expect(lib.checkServiceController(1n)).toBe(false);
    expect(lib.checkServiceController(true)).toBe(false);
    expect(lib.checkServiceController(false)).toBe(false);
    expect(lib.checkServiceController(null)).toBe(false);
    expect(lib.checkServiceController({})).toBe(false);
    expect(lib.checkServiceController({ a: "a"})).toBe(false);
    expect(lib.checkServiceController(() => undefined)).toBe(false);
    expect(lib.checkServiceController(function A() { return; })).toBe(false);
    expect(lib.checkServiceController({
      checkIfExists() { return false; },
      serve() { return; },
    })).toBe(false);
    expect(lib.checkServiceController({
      checkIfEnabled() { return false; },
      serve() { return; },
    })).toBe(false);
    expect(lib.checkServiceController({
      checkIfEnabled() { return false; },
      checkIfExists() { return false; },
    })).toBe(false);
  });
  test("allowed values", () => {
    function A() { return; }
    A.checkForAuth = () => false;
    A.checkIfEnabled = () => false;
    A.checkIfExists = () => false;
    A.serve = () => undefined;
    expect(lib.checkServiceController({
      checkForAuth() { return false; },
      checkIfEnabled() { return false; },
      checkIfExists() { return false; },
      serve() { return; },
    })).toBe(true);
    expect(lib.checkServiceController({
      checkIfEnabled() { return false; },
      checkIfExists() { return false; },
      serve() { return; },
    })).toBe(true);
    expect(lib.checkServiceController(A)).toBe(true);
  });
});

describe("function makeError()", () => {
  const FakeErrorCodes = "ERR_FAKE_ERROR_FOR_TEST" as ErrorCodes;

  test("make basic errors", () => {
    const error = lib.makeError("Some message", FakeErrorCodes);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Some message");
    expect(error.code).toBe(FakeErrorCodes);
  });

  test("make an error extending base interface", () => {
    interface ExtendingExtendedError extends ExtendedError {
      a: "b";
      b: 1;
      c?: boolean;
    }

    const error = lib.makeError<ExtendingExtendedError>(
      "Some other error",
      FakeErrorCodes,
      {
        a: "b",
        b: 1,
      },
    );
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("Some other error");
    expect(error.code).toBe(FakeErrorCodes);
    expect(error.a).toBe("b");
    expect(error.b).toBe(1);
    expect(error.c).toBeUndefined();
  });
});
