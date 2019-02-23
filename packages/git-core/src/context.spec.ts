import { Headers } from "node-fetch";
import * as lib from "./context";
import { Service } from "./enums";
import { concatBuffers } from "./packet-utils";

type ClassTypeArgs<T extends new (...args: any[]) => any> = T extends new (...args: infer R) => any ? R : any;

async function*asyncIterable() { return; }

async function valid(
  args: ClassTypeArgs<typeof lib.Context> = [],
  request: Pick<lib.Request, Exclude<keyof lib.Request, "headers" | "body" | "toReadable">>,
  body: Uint8Array = new Uint8Array(0),
  headers: Record<string, string[]> = {},
): Promise<lib.Context | never> {
  const context = new lib.Context(...args);
  expect(context).toBeInstanceOf(lib.Context);
  const output = context.request;
  for (const key in request) {
    expect(output).toHaveProperty(key); // tslint:disable-line
    if (key in output) {
      expect(output[key]).toBe(request[key]);
    }
  }
  const buffers: Uint8Array[] = [];
  for await (const b of context.request.body) {
    buffers.push(b);
  }
  const buffer = concatBuffers(buffers);
  expect(buffer).toEqual(body);
  const raw = context.request.headers.raw();
  for (const key in headers) {
    expect(raw).toHaveProperty(key); // tslint:disable-line
    if (key in raw) {
      expect(raw[key]).toEqual(headers[key]);
    }
  }
  return context;
}

async function invalid(args: ClassTypeArgs<typeof lib.Context>): Promise<void | never> {
  expect(() => {
    const context = new lib.Context(...args);
    expect(context).toBeInstanceOf(lib.Context);
  }).toThrow();
}

describe("Context", () => {
  describe("constructing", () => {
    test("should accept no arguments", async () => valid(
      [],
      {
        advertisement: false,
        method: "GET",
        path: undefined,
        service: undefined,
        url: "/",
      },
    ));

    test("first argument should be an URL-path", async () => Promise.all([
      invalid([undefined]),
      invalid([""]),
      invalid(["https://example.org/"]),
      invalid(["http://example.org/"]),
      invalid(["repository/info/refs?service=git-upload-pack"]),
      valid(
        [
          "/",
        ],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        [
          "/repository/path/info/refs?service=git-upload-pack",
        ],
        {
          advertisement: true,
          method: "GET",
          path: "repository/path",
          service: Service.UploadPack,
          url: "/repository/path/info/refs?service=git-upload-pack",
        },
        new Uint8Array(0),
        {},
      ),
    ]));

    test("second argument must be a valid HTTP verb", async () => Promise.all<any>([
      invalid(["/", undefined]),
      invalid(["/", ""]),
      invalid(["/", "some text"]),
      invalid(["/", "OPTIONS"]),
      valid(
        ["/", "GET"],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "get"],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "gEt"],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "HEAD"],
        {
          advertisement: false,
          method: "HEAD",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "POST"],
        {
          advertisement: false,
          method: "POST",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "PATCH"],
        {
          advertisement: false,
          method: "PATCH",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "PUT"],
        {
          advertisement: false,
          method: "PUT",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
    ]));

    test("third argument should be an async iterable", async () => Promise.all([
      invalid(["/", "GET", undefined]),
      invalid(["/", "GET", { async *[Symbol.iterator]() { return; } } as any]),
      valid(
        ["/", "GET", { async *[Symbol.asyncIterator]() { return; } }],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable()],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable()],
        {
          advertisement: true,
          method: "GET",
          path: "path/to/repo",
          service: Service.UploadPack,
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "GET", asyncIterable()],
        {
          advertisement: true,
          method: "GET",
          path: "path/to/repo",
          service: Service.ReceivePack,
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
      ),
      valid(
        ["/", "GET", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          advertisement: false,
          method: "POST",
          path: "path/to/repo",
          service: undefined,
          url: "/path/to/repo/git-upload-pack",
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          advertisement: false,
          method: "POST",
          path: "path/to/repo",
          service: undefined,
          url: "/path/to/repo/git-receive-pack",
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
    ]));

    test("fourth argument should be a header-value record or instance of Headers", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), undefined]),
      invalid(["/", "GET", asyncIterable(), 1 as any]),
      invalid(["/", "GET", asyncIterable(), "" as any]),
      valid(
        ["/", "GET", asyncIterable(), {}],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), new Headers()],
        {
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}],
        {
          advertisement: true,
          method: "GET",
          path: "path/to/repo",
          service: Service.UploadPack,
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "GET", asyncIterable(), {}],
        {
          advertisement: true,
          method: "GET",
          path: "path/to/repo",
          service: Service.ReceivePack,
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "GET", asyncIterable(), {}],
        {
          advertisement: false,
          method: "GET",
          path: "path/to/repo",
          service: undefined,
          url: "/path/to/repo/git-upload-pack",
        },
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "GET", asyncIterable(), {}],
        {
          advertisement: false,
          method: "GET",
          path: "path/to/repo",
          service: undefined,
          url: "/path/to/repo/git-receive-pack",
        },
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "POST", asyncIterable(), { "content-type": "application/x-git-upload-pack-request"}],
        {
          advertisement: false,
          method: "POST",
          path: "path/to/repo",
          service: Service.UploadPack,
          url: "/path/to/repo/git-upload-pack",
        },
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "POST", asyncIterable(), { "content-type": "application/x-git-receive-pack-request"}],
        {
          advertisement: false,
          method: "POST",
          path: "path/to/repo",
          service: Service.ReceivePack,
          url: "/path/to/repo/git-receive-pack",
        },
      ),
    ]));
  });
});
