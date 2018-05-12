/**
 * Checks interfaces.ts for "real" exports. It should not find any.
 */
import * as interfaces from "../src/interfaces";

it("check exported objects for any _real_ exports (i.e. exports is not an interface or type primitive)", (done) => {
  const keys = Reflect.ownKeys(interfaces).filter((i) => i !== "__esModule");
  expect(keys.length).toBe(0);
  done();
});
