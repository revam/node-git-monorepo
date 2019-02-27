import * as lib from "./main.private";

describe("checkServiceDriver", () => {
  test("unallowed values", () => {
    expect(lib.checkServiceDriver(undefined)).toBe(false);
    expect(lib.checkServiceDriver("")).toBe(false);
    expect(lib.checkServiceDriver(Symbol())).toBe(false);
    expect(lib.checkServiceDriver(1)).toBe(false);
    expect(lib.checkServiceDriver(1n)).toBe(false);
    expect(lib.checkServiceDriver(true)).toBe(false);
    expect(lib.checkServiceDriver(false)).toBe(false);
    expect(lib.checkServiceDriver(null)).toBe(false);
    expect(lib.checkServiceDriver({})).toBe(false);
    expect(lib.checkServiceDriver({ a: "a"})).toBe(false);
    expect(lib.checkServiceDriver(() => undefined)).toBe(false);
    expect(lib.checkServiceDriver(function A() { return; })).toBe(false);
  });
  test("allowed values", () => {
    function A() { return; }
    A.checkForAuth = () => false;
    A.checkIfEnabled = () => false;
    A.checkIfExists = () => false;
    A.serve = () => undefined;
    expect(lib.checkServiceDriver({
      checkForAuth() { return false; },
      checkIfEnabled() { return false; },
      checkIfExists() { return false; },
      serve() { return; },
    })).toBe(true);
    expect(lib.checkServiceDriver(A)).toBe(true);
  });
});
