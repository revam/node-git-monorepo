import * as lib from "./enum-util";

enum A1 {
  a = 0,
  b = 1,
}

enum A2 {
  a = Infinity,
}

enum B {
  a = "b",
}

describe("function checkEnum()", () => {
  test("test on enumerable numbers", () => {
    // valid
    expect(lib.checkEnum(A1.a, A1)).toBe(true);
    expect(lib.checkEnum(0, A1)).toBe(true);
    expect(lib.checkEnum("a", A1)).toBe(true);
    expect(lib.checkEnum(A1.b, A1)).toBe(true);
    expect(lib.checkEnum(1, A1)).toBe(true);
    expect(lib.checkEnum("b", A1)).toBe(true);
    expect(lib.checkEnum(A2.a, A2)).toBe(true);
    expect(lib.checkEnum(Infinity, A2)).toBe(true);
    expect(lib.checkEnum("a", A2)).toBe(true);
    // invalid
    expect(lib.checkEnum(2, A1)).toBe(false);
    expect(lib.checkEnum(2, A2)).toBe(false);
    expect(lib.checkEnum(A1.a, A2)).toBe(false);
    expect(lib.checkEnum(A2.a, A1)).toBe(false);
    expect(lib.checkEnum(A1.b, A2)).toBe(false);
    expect(lib.checkEnum("", A1)).toBe(false);
    expect(lib.checkEnum("", A2)).toBe(false);
    expect(lib.checkEnum(undefined, A1)).toBe(false);
    expect(lib.checkEnum(undefined, A2)).toBe(false);
    expect(lib.checkEnum(null, A1)).toBe(false);
    expect(lib.checkEnum(null, A2)).toBe(false);
    expect(lib.checkEnum(NaN, A1)).toBe(false);
    expect(lib.checkEnum(NaN, A2)).toBe(false);
  });

  test("test on enumerable strings", () => {
    expect(lib.checkEnum(B.a, B)).toBe(true);
    expect(lib.checkEnum("b", B)).toBe(true);
    expect(lib.checkEnum("a", B)).toBe(false);
    expect(lib.checkEnum(A1.a, B)).toBe(false);
    expect(lib.checkEnum(A1.b, B)).toBe(false);
    expect(lib.checkEnum(A2.a, B)).toBe(false);
    expect(lib.checkEnum("", B)).toBe(false);
    expect(lib.checkEnum(undefined, B)).toBe(false);
    expect(lib.checkEnum(null, B)).toBe(false);
    expect(lib.checkEnum(NaN, B)).toBe(false);
  });
});
