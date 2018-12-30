import { createKoaMiddleware } from "../src/index";

describe("createKoaMiddleware", () => {
  it("should return a function", (done) => {
    const fn = createKoaMiddleware(__dirname);
    expect(typeof fn).toBe("function");
    done();
  });
});
