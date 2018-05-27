import { Headers } from '../src/headers';

describe("Headers", () => {
  it("should accept zero arguments", (done) => {
    const headers = new Headers();
    expect(headers).toBeInstanceOf(Headers);
    done();
  });

  it("should accept another instance as first argument", (done) => {
    const headers1 = new Headers();
    headers1.set("a", "b");
    const headers2 = new Headers(headers1);
    expect(headers2.count).toBe(1);
    expect(headers2.get("a")).toBe("b");
    done();
  });

  it("should accept a plain object with header-value(s) pairs", (done) => {
    const headers1 = {
      "Header-A": "a",
      "Header-B": 2,
      "Header-C": ["b", "c"],
    };
    const headers2 = new Headers(headers1);
    expect(headers2.count).toBe(3);
    expect(headers2.get("header-a")).toBe("a");
    expect(headers2.get("header-b")).toBe("2");
    expect(headers2.get("header-c")).toBe("b");
    expect(headers2.getAll("header-a")).toEqual(["a"]);
    expect(headers2.getAll("header-b")).toEqual(["2"]);
    expect(headers2.getAll("header-c")).toEqual(["b", "c"]);
    done();
  });

  it("should have case-insensitive header names", (done) => {
    const headers = new Headers();
    const value = "value";
    headers.set("header-a", value);
    expect(headers.get("header-a")).toBe(value);
    expect(headers.get("Header-A")).toBe(value);
    done();
  });

  it("should return the first value for a header when multiple values exist", (done) => {
    const headers = new Headers({a: ["b", "c"]});
    expect(headers.count).toBe(1);
    expect(headers.get("a")).toBe("b");
    expect(headers.getAll("a")).toHaveLength(2);
    done();
  });
});
