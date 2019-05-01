import * as lib from "./fetch-controller.private";

describe("RegExp RelativePathRegex", () => {
  test("values that match", () => {
    const Values = [
      "//",
      "./",
      "../",
      ".../",
      "path/to/./child",
      "path/to/../sibling",
      "/path/to/./child",
      "/path/to/../sibling",

      "http://",
      "http://example.org//",
      "http://example.org/./",
      "http://example.org/../",
      "http://example.org/.../",
      "http://example.org/.../",
      "http://example.org/path/to//child",
      "http://example.org/path/to/./child",
      "http://example.org/path/to/../sibling",

      "https://",
      "https://example.org//",
      "https://example.org/./",
      "https://example.org/../",
      "https://example.org/.../",
      "https://example.org/.../",
      "https://example.org/path/to//child",
      "https://example.org/path/to/./child",
      "https://example.org/path/to/../sibling",
    ];
    for (const value of Values) {
      expect(lib.RelativePathRegex.test(value)).toBe(true);
    }
  });

  test("values that don't match", () => {
    const Values = [
      "",
      "/",
      "path/to/child",
      "/path/to/child",

      "http://example.org",
      "http://example.org/",
      "http://example.org/",
      "http://example.org/path",
      "http://example.org/path/to/child",

      "https://example.org",
      "https://example.org/",
      "https://example.org/",
      "https://example.org/path",
      "https://example.org/path/to/child",
    ];
    for (const value of Values) {
      expect(lib.RelativePathRegex.test(value)).toBe(false);
    }
  });
});

describe("RegExp CheckHTTPRegex", () => {
  test("invalid values", () => {
    const Values = [
      "",
      "/",
      "//",
      "./",
      "../",
      ".../",
      "path/to/child",
      "path/to/./child",
      "path/to/../sibling",
      "/path/to/child",
      "/path/to/./child",
      "/path/to/../sibling",

      "http://",
      "https://",
    ];
    for (const value of Values) {
      expect(lib.CheckHTTPRegex.test(value)).toBe(false);
    }
  });

  test("valid values", () => {
    const Values = [
      "http://e",
      "https://e",
      "http://example.org",
      "http://example.org/",
      "http://example.org/",
      "http://example.org/path",
      "http://example.org/path/to/child",
      "http://example.org//",
      "http://example.org/./",
      "http://example.org/../",
      "http://example.org/.../",
      "http://example.org/path/to//child",
      "http://example.org/path/to/./child",
      "http://example.org/path/to/../sibling",

      "https://example.org",
      "https://example.org/",
      "https://example.org/",
      "https://example.org/path",
      "https://example.org/path/to/child",
      "https://example.org//",
      "https://example.org/./",
      "https://example.org/../",
      "https://example.org/.../",
      "https://example.org/path/to//child",
      "https://example.org/path/to/./child",
      "https://example.org/path/to/../sibling",
    ];
    for (const value of Values) {
      expect(lib.CheckHTTPRegex.test(value)).toBe(true);
    }
  });
});

describe("RegExp CheckHTTPSRegex", () => {
  test("invalid values", () => {
    const Values = [
      "",
      "/",
      "//",
      "./",
      "../",
      ".../",
      "path/to/child",
      "path/to/./child",
      "path/to/../sibling",
      "/path/to/child",
      "/path/to/./child",
      "/path/to/../sibling",

      "http://",
      "http://e",
      "https://",
      "http://example.org",
      "http://example.org/",
      "http://example.org/",
      "http://example.org/path",
      "http://example.org/path/to/child",
      "http://example.org//",
      "http://example.org/./",
      "http://example.org/../",
      "http://example.org/.../",
      "http://example.org/path/to//child",
      "http://example.org/path/to/./child",
      "http://example.org/path/to/../sibling",
    ];
    for (const value of Values) {
      expect(lib.CheckHTTPSRegex.test(value)).toBe(false);
    }
  });

  test("valid values", () => {
    const Values = [
      "https://e",
      "https://example.org",
      "https://example.org/",
      "https://example.org/",
      "https://example.org/path",
      "https://example.org/path/to/child",
      "https://example.org//",
      "https://example.org/./",
      "https://example.org/../",
      "https://example.org/.../",
      "https://example.org/path/to//child",
      "https://example.org/path/to/./child",
      "https://example.org/path/to/../sibling",
    ];
    for (const value of Values) {
      expect(lib.CheckHTTPSRegex.test(value)).toBe(true);
    }
  });
});

describe("function pathIsValid()", () => {
  test("valid values", () => {
    const Values = [
      "",
      "path/to/repo",
      "path/to/repo/",
      "/",
      "/path/to/repo/",

      "http://a",
      "http://a/",
      "http://example.org",
      "http://example.org/",
      "http://example.org/path/to/repo",
      "http://example.org/path.to/repo",
      "http://example.org/path/to/repo/",
      "http://example.org/path.to/repo/",

      "https://a",
      "https://a/",
      "https://example.org",
      "https://example.org/",
      "https://example.org/path/to/repo",
      "https://example.org/path.to/repo",
      "https://example.org/path/to/repo/",
      "https://example.org/path.to/repo/",
    ];
    for (const value of Values) {
      expect(lib.pathIsValid(value)).toBe(true);
    }
  });

  test("invalid values", () => {
    const Values = [
      "//",
      "./",
      "../",
      ".../",

      "http://",
      "http://a//",
      "http://a/./",
      "http://a/../",
      "http://a/.../",
      "http://example.org/path/to/repo//",
      "http://example.org/path/to/repo/./",
      "http://example.org/path/to/repo/../",
      "http://example.org/path/to/repo/.../",
      "http://example.org/path.to/repo//",
      "http://example.org/path.to/repo/./",
      "http://example.org/path.to/repo/../",
      "http://example.org/path.to/repo/.../",

      "https://",
      "https://a//",
      "https://a/./",
      "https://a/../",
      "https://a/.../",
    ];
    for (const value of Values) {
      expect(lib.pathIsValid(value)).toBe(false);
    }
  });
});
