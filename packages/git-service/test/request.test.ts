import { ServiceType } from "../src/enums";
import { mapInputToRequest } from '../src/request';

describe("mapInputToRequest", () => {
  it("should map requests from <repository>/info/refs", (done) => {
    validateData([
      // Test for path **without** leading slash.
      [["foo/info/refs", "GET", void 0], [true, "foo"]],
      // Test full url without query
      [["http://example.com/foo/info/refs", "GET", void 0], [true, "foo"]],
      // Test path without query
      [["/foo/info/refs", "GET", void 0], [true, "foo"]],
      // Test path with an invalid param service in search
      [["/foo/info/refs?service=baz", "GET", void 0], [true, "foo"]],
      // Test paths with a valid service param in query
      [["/foo/info/refs?service=git-upload-pack", "GET", void 0], [true, "foo", ServiceType.UploadPack]],
      [["/foo/info/refs?service=git-receive-pack", "GET", void 0], [true, "foo", ServiceType.ReceivePack]],
      // Test paths with valid service param, but used with wrong http method.
      [["/foo/info/refs?service=git-upload-pack", "POST", void 0], [true, "foo"]],
      [["/foo/info/refs?service=git-receive-pack", "POST", void 0], [true, "foo"]],
    ]);
    done();
  });
  it("should map requests from <repository>/git-<service>", (done) => {
    validateData([
      // Test for path **without** leading slash.
      [["foo/git-some-pack", "POST", void 0], [false, "foo"]],
      // Test path without param service in search
      [["/foo/git-some-pack", "POST", void 0], [false, "foo"]],
      // Test path with valid service, but invalid content type
      [["/foo/git-upload-pack", "POST", "text/plain"], [false, "foo"]],
      [["/foo/git-receive-pack", "POST", "text/plain"], [false, "foo"]],
      // Test path with valid service and valid content type
      [
        ["/foo/git-upload-pack", "POST", "application/x-git-upload-pack-request"],
        [false, "foo", ServiceType.UploadPack],
      ],
      [
        ["/foo/git-receive-pack", "POST", "application/x-git-receive-pack-request"],
        [false, "foo", ServiceType.ReceivePack],
      ],
      // Test path with valid service and valid content type, but used with
      // invalid http method
      [
        ["/foo/git-upload-pack", "GET", "application/x-git-upload-pack-request"],
        [false, "foo"],
      ],
      [
        ["/foo/git-receive-pack", "GET", "application/x-git-receive-pack-request"],
        [false, "foo"],
      ],
    ]);
    done();
  });
  it("should ignore all other paths", (done) => {
    validateData([
      // Test invalid path
      [["/foo/bar/baz", "GET", void 0], []],
      [["/foo/bar/baz", "POST", void 0], []],
      // Test random url
      [["https://example.org/foo/bar/baz", "GET", void 0], []],
      [["https://example.org/foo/bar/baz", "POST", void 0], []],
    ]);
    done();
  });
});

function validateData(data: Array<[[string, string, string], [boolean?, string?, ServiceType?]]>) {
  for (const [input, output] of data) {
    const [f, m, c] = input;
    const value = mapInputToRequest(f, m, c);
    if (!value.every((v, i) => v === output[i])) {
      console.debug(JSON.stringify({input, output, results: value}));
    }
    expect(value).toEqual(output);
  }
}
