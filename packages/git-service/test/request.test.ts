import { PassThrough } from "stream";
import { ServiceType } from "../src/enums";
import { LogicController } from "../src/logic-controller";

describe("LogicController#create", () => {
  it("should map requests from <repository>/info/refs", (done) => validateData(
    new LogicController(void 0),
    [
      // Test for path **without** leading slash.
      [["foo/info/refs", "GET", void 0], [true, "foo", undefined]],
      [["foo/bar/baz/info/refs", "GET", void 0], [true, "foo/bar/baz", undefined]],
      // Test full url without query
      [["http://example.com/foo/info/refs", "GET", void 0], [true, "foo", undefined]],
      [["http://example.com/foo/bar/baz/info/refs", "GET", void 0], [true, "foo/bar/baz", undefined]],
      // Test path without query
      [["/foo/info/refs", "GET", void 0], [true, "foo", undefined]],
      [["/foo/bar/baz/info/refs", "GET", void 0], [true, "foo/bar/baz", undefined]],
      // Test path with an invalid param service in search
      [["/foo/info/refs?service=baz", "GET", void 0], [true, "foo", undefined]],
      [["/foo/bar/baz/info/refs?service=baz", "GET", void 0], [true, "foo/bar/baz", undefined]],
      // Test paths with a valid service param in query
      [["/foo/info/refs?service=git-upload-pack", "GET", void 0], [true, "foo", ServiceType.UploadPack]],
      [
        ["/foo/bar/baz/info/refs?service=git-upload-pack", "GET", void 0],
        [true, "foo/bar/baz", ServiceType.UploadPack],
      ],
      [["/foo/info/refs?service=git-receive-pack", "GET", void 0], [true, "foo", ServiceType.ReceivePack]],
      [
        ["/foo/bar/baz/info/refs?service=git-receive-pack", "GET", void 0],
        [true, "foo/bar/baz", ServiceType.ReceivePack],
      ],
      // Test paths with valid service param, but used with wrong http method.
      [["/foo/info/refs?service=git-upload-pack", "POST", void 0], [true, "foo", undefined]],
      [["/foo/bar/baz/info/refs?service=git-upload-pack", "POST", void 0], [true, "foo/bar/baz", undefined]],
      [["/foo/info/refs?service=git-receive-pack", "POST", void 0], [true, "foo", undefined]],
      [["/foo/bar/baz/info/refs?service=git-receive-pack", "POST", void 0], [true, "foo/bar/baz", undefined]],
    ],
    done,
  ));
  it("should map requests from <repository>/git-<service>", (done) => validateData(
    new LogicController(void 0),
    [
      // Test for path **without** leading slash.
      [["foo/git-some-pack", "POST", void 0], [false, "foo", undefined]],
      // Test path without param service in search
      [["/foo/git-some-pack", "POST", void 0], [false, "foo", undefined]],
      // Test path with valid service, but invalid content type
      [["/foo/git-upload-pack", "POST", "text/plain"], [false, "foo", undefined]],
      [["/foo/git-receive-pack", "POST", "text/plain"], [false, "foo", undefined]],
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
        [false, "foo", undefined],
      ],
      [
        ["/foo/git-receive-pack", "GET", "application/x-git-receive-pack-request"],
        [false, "foo", undefined],
      ],
    ],
    done,
  ));
  it("should ignore all other paths", (done) => validateData(
    new LogicController(void 0),
    [
      // Test invalid path
      [["/foo/bar/baz", "GET", void 0], [false, undefined, undefined]],
      [["/foo/bar/baz", "POST", void 0], [false, undefined, undefined]],
      // Test random url
      [["https://example.org/foo/bar/baz", "GET", void 0], [false, undefined, undefined]],
      [["https://example.org/foo/bar/baz", "POST", void 0], [false, undefined, undefined]],
    ],
    done,
  ));
});

async function validateData(
  controller: LogicController,
  data: Array<[[string, string, string], [boolean, string?, ServiceType?]]>,
  done: () => any,
  ) {
  for (const [input, output] of data) {
    const [url, method, content_type] = input;
    const passThrough = new PassThrough();
    passThrough.end();
    const request = await controller.create(
      passThrough,
      { "content-type": content_type },
      method,
      url,
    );
    const value = [request.isAdvertisement, request.path, request.service];
    if (!value.every((v, i) => v === output[i])) {
      // tslint:disable-next-line:no-console We want some debug info
      console.debug(JSON.stringify({input, output, results: value, request}));
    }
    expect(value).toEqual(output);
    expect(request.method).toEqual(method);
    expect(request.url).toEqual(url);
  }
  done();
}
