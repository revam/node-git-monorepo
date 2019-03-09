import { Headers } from "node-fetch";
import * as lib from "./context";
import { Service } from "./enum";
import { concatBuffers } from "./packet-util";

type ClassTypeArgs<T extends new (...args: any[]) => any> = T extends new (...args: infer R) => any ? R : any;

describe("class Context", () => {
  describe("constructor arguments", () => {

    async function*asyncIterable() { return; }

    async function valid(
      args: ClassTypeArgs<typeof lib.Context> = [],
      request: Pick<lib.Request, Exclude<keyof lib.Request, "headers" | "body">>,
      context: Pick<lib.Context, "advertisement" | "service" | "path" | "isInitialised">,
      body: Uint8Array = new Uint8Array(0),
      headers: Record<string, string[]> = {},
    ): Promise<lib.Context | never> {
      const value = new lib.Context(...args);
      expect(value).toBeInstanceOf(lib.Context);
      for (const key in context) {
        expect(value).toHaveProperty(key) // tslint:disable-line
        if (key in value) {
          expect(value[key]).toBe(context[key]);
        }
      }
      const output = value.request;
      for (const key in request) {
        expect(output).toHaveProperty(key); // tslint:disable-line
        if (key in output) {
          expect(output[key]).toBe(request[key]);
        }
      }
      const buffers: Uint8Array[] = [];
      for await (const b of value.request.body) {
        buffers.push(b);
      }
      const buffer = concatBuffers(buffers);
      expect(buffer).toEqual(body);
      const raw = value.request.headers.raw();
      for (const key in headers) {
        expect(raw).toHaveProperty(key); // tslint:disable-line
        if (key in raw) {
          expect(raw[key]).toEqual(headers[key]);
        }
      }
      return value;
    }

    async function invalid(args: ClassTypeArgs<typeof lib.Context>): Promise<void | never> {
      expect(() => {
        const context = new lib.Context(...args);
        expect(context).toBeInstanceOf(lib.Context);
      }).toThrow();
    }

    test("should accept no arguments", async () => valid(
      [],
      {
        method: "GET",
        url: "/",
      },
      {
        advertisement: false,
        isInitialised: true,
        path: undefined,
        service: undefined,
      },
    ));

    test("first argument should be an URL-path", async () => Promise.all<any>([
      invalid([undefined]),
      invalid([null as any]),
      invalid([""]),
      invalid(["https://example.org/"]),
      invalid(["http://example.org/"]),
      invalid(["repository/info/refs?service=git-upload-pack"]),
      valid(
        [
          "/",
        ],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        [
          "/repository/path/info/refs?service=git-upload-pack",
        ],
        {
          method: "GET",
          url: "/repository/path/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "repository/path",
          service: Service.UploadPack,
        },
        new Uint8Array(0),
        {},
      ),
    ]));

    test("second argument must be a valid HTTP verb", async () => Promise.all<any>([
      invalid(["/", undefined]),
      invalid(["/", null as any]),
      invalid(["/", ""]),
      invalid(["/", "some text"]),
      invalid(["/", "TRACE"]),
      invalid(["/", "CONNECT"]),
      valid(
        ["/", "GET"],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "get"],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "gEt"],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "HEAD"],
        {
          method: "HEAD",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "POST"],
        {
          method: "POST",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "PATCH"],
        {
          method: "PATCH",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "PUT"],
        {
          method: "PUT",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "OPTIONS"],
        {
          method: "OPTIONS",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
    ]));

    test("third argument should be an async iterable", async () => Promise.all<any>([
      invalid(["/", "GET", undefined]),
      invalid(["/", "GET", null as any]),
      invalid(["/", "GET", { async *[Symbol.iterator]() { return; } } as any]),
      valid(
        ["/", "GET", { async *[Symbol.asyncIterator]() { return; } }],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable()],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable()],
        {
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "path/to/repo",
          service: Service.UploadPack,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "GET", asyncIterable()],
        {
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "path/to/repo",
          service: Service.ReceivePack,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "POST", asyncIterable()],
        {
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "POST", asyncIterable()],
        {
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          method: "POST",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          method: "POST",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
    ]));

    test("fourth argument should be a header-value record or instance of Headers", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), undefined]),
      invalid(["/", "GET", asyncIterable(), null as any]),
      invalid(["/", "GET", asyncIterable(), 1 as any]),
      invalid(["/", "GET", asyncIterable(), "" as any]),
      valid(
        ["/", "GET", asyncIterable(), {}],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), new Headers()],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}],
        {
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "path/to/repo",
          service: Service.UploadPack,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "GET", asyncIterable(), {}],
        {
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "path/to/repo",
          service: Service.ReceivePack,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "POST", asyncIterable(), {}],
        {
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-receive-pack", "POST", asyncIterable(), {}],
        {
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "GET", asyncIterable(), {}],
        {
          method: "GET",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "GET", asyncIterable(), {}],
        {
          method: "GET",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/git-upload-pack", "POST", asyncIterable(), { "content-type": "application/x-git-upload-pack-request"}],
        {
          method: "POST",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: false,
          path: "path/to/repo",
          service: Service.UploadPack,
        },
      ),
      valid(
        ["/path/to/repo/git-receive-pack", "POST", asyncIterable(), { "content-type": "application/x-git-receive-pack-request"}],
        {
          method: "POST",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: false,
          path: "path/to/repo",
          service: Service.ReceivePack,
        },
      ),
    ]));

    test("fifth argument should be a boolean", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), {}, undefined]),
      invalid(["/", "GET", asyncIterable(), {}, null as any]),
      invalid(["/", "GET", asyncIterable(), {}, "" as any]),
      invalid(["/", "GET", asyncIterable(), {}, "undefined" as any]),
      invalid(["/", "GET", asyncIterable(), {}, 0 as any]),
      invalid(["/", "GET", asyncIterable(), {}, 1 as any]),
      valid(
        ["/", "GET", asyncIterable(), {}, false],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}, true],
        {
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "POST", asyncIterable(), {}, true],
        {
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
    ]));

    test("sixth argument should be undefined or a string", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), {}, false, null as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, null as any]),
      invalid(["/", "GET", asyncIterable(), {}, false, true as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, true as any]),
      invalid(["/", "GET", asyncIterable(), {}, false, false as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, false as any]),
      invalid(["/", "GET", asyncIterable(), {}, false, 0 as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, 0 as any]),
      invalid(["/", "GET", asyncIterable(), {}, false, 1 as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, 1 as any]),
      invalid(["/", "GET", asyncIterable(), {}, false, {} as any]),
      invalid(["/", "GET", asyncIterable(), {}, true, {} as any]),
      valid(
        ["/", "GET", asyncIterable(), {}, false, undefined],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true, undefined],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: undefined,
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, false, "path/to/repo"],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true, "path/to/repo"],
        {
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          path: "path/to/repo",
          service: undefined,
        },
      ),
    ]));

    test("seventh argument must be a value of enum Service.", async () => Promise.all<any>([
        invalid(["/", "GET", asyncIterable(), {}, false, undefined, null as any]),
        invalid(["/", "GET", asyncIterable(), {}, true, undefined, null as any]),
        invalid(["/", "GET", asyncIterable(), {}, false, undefined, "null" as any]),
        invalid(["/", "GET", asyncIterable(), {}, true, undefined, "null" as any]),
        invalid(["/", "GET", asyncIterable(), {}, false, undefined, "" as any]),
        invalid(["/", "GET", asyncIterable(), {}, true, undefined, "" as any]),
        invalid(["/", "GET", asyncIterable(), {}, false, undefined, 0 as any]),
        invalid(["/", "GET", asyncIterable(), {}, true, undefined, 0 as any]),
        invalid(["/", "GET", asyncIterable(), {}, false, undefined, 1 as any]),
        invalid(["/", "GET", asyncIterable(), {}, true, undefined, 1 as any]),
        valid(
          ["/", "GET", asyncIterable(), {}, false, undefined, undefined],
          {
            method: "GET",
            url: "/",
          },
          {
            advertisement: false,
            isInitialised: true,
            path: undefined,
            service: undefined,
          },
        ),
        valid(
          ["/", "GET", asyncIterable(), {}, true, undefined, undefined],
          {
            method: "GET",
            url: "/",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: undefined,
            service: undefined,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", undefined],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: false,
            isInitialised: true,
            path: "path/to/repoB",
            service: undefined,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", undefined],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: "path/to/repoB",
            service: undefined,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", Service.UploadPack],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: false,
            isInitialised: false,
            path: "path/to/repoB",
            service: Service.UploadPack,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", Service.UploadPack],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: "path/to/repoB",
            service: Service.UploadPack,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", Service.ReceivePack],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: false,
            isInitialised: false,
            path: "path/to/repoB",
            service: Service.ReceivePack,
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", Service.ReceivePack],
          {
            method: "GET",
            url: "/path/to/repoA",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: "path/to/repoB",
            service: Service.ReceivePack,
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, false, "path/to/repoB", Service.UploadPack],
          {
            method: "POST",
            url: "/path/to/repoA",
          },
          {
            advertisement: false,
            isInitialised: false,
            path: "path/to/repoB",
            service: Service.UploadPack,
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, true, "path/to/repoB", Service.UploadPack],
          {
            method: "POST",
            url: "/path/to/repoA",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: "path/to/repoB",
            service: Service.UploadPack,
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, false, "path/to/repoB", Service.ReceivePack],
          {
            method: "POST",
            url: "/path/to/repoA",
          },
          {
            advertisement: false,
            isInitialised: false,
            path: "path/to/repoB",
            service: Service.ReceivePack,
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, true, "path/to/repoB", Service.ReceivePack],
          {
            method: "POST",
            url: "/path/to/repoA",
          },
          {
            advertisement: true,
            isInitialised: true,
            path: "path/to/repoB",
            service: Service.ReceivePack,
          },
        ),
    ]));
  });

  describe("own properties and methods", () => undefined);

  describe("request delegation", () => undefined);

  describe("response delegation", () => undefined);
});
