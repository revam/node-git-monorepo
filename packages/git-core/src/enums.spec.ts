import * as enums from "./enums";

test("Should only export objects with strings as keys and strings as values (string enums)", () => {
  for (const [k1, v1] of Object.entries(enums)) {
    if (k1 === "__esModule") {
      continue;
    }
    expect(typeof v1).toBe("object");
    if (typeof v1 === "object") {
      for (const [k2, v2] of Object.entries(v1)) {
        expect(typeof k2).toBe("string");
        expect(typeof v2).toBe("string");
      }
    }
  }
});
