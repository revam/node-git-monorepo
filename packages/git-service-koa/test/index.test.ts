import { createMiddleware } from '../src/index';

describe("createMiddleware", () => {
  it("should return a function", (done) => {
    const fn = createMiddleware(void 0);
    expect(typeof fn).toBe("function");
    done();
  });
});
