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
      invalid(["/", null as any]),
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

    test("third argument should be an async iterable", async () => Promise.all<any>([
      invalid(["/", "GET", undefined]),
      invalid(["/", "GET", null as any]),
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
      invalid(["/", "GET", asyncIterable(), null as any]),
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
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true],
        {
          advertisement: true,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}, true],
        {
          advertisement: true,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
      ),
      valid(
        ["/path/to/repo/info/refs?service=git-upload-pack", "POST", asyncIterable(), {}, true],
        {
          advertisement: true,
          method: "POST",
          path: undefined,
          service: undefined,
          url: "/path/to/repo/info/refs?service=git-upload-pack",
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
          advertisement: false,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true, undefined],
        {
          advertisement: true,
          method: "GET",
          path: undefined,
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, false, "path/to/repo"],
        {
          advertisement: false,
          method: "GET",
          path: "path/to/repo",
          service: undefined,
          url: "/",
        },
      ),
      valid(
        ["/", "GET", asyncIterable(), {}, true, "path/to/repo"],
        {
          advertisement: true,
          method: "GET",
          path: "path/to/repo",
          service: undefined,
          url: "/",
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
            advertisement: false,
            method: "GET",
            path: undefined,
            service: undefined,
            url: "/",
          },
        ),
        valid(
          ["/", "GET", asyncIterable(), {}, true, undefined, undefined],
          {
            advertisement: true,
            method: "GET",
            path: undefined,
            service: undefined,
            url: "/",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", undefined],
          {
            advertisement: false,
            method: "GET",
            path: "path/to/repoB",
            service: undefined,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", undefined],
          {
            advertisement: true,
            method: "GET",
            path: "path/to/repoB",
            service: undefined,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", Service.UploadPack],
          {
            advertisement: false,
            method: "GET",
            path: "path/to/repoB",
            service: Service.UploadPack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", Service.UploadPack],
          {
            advertisement: true,
            method: "GET",
            path: "path/to/repoB",
            service: Service.UploadPack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, false, "path/to/repoB", Service.ReceivePack],
          {
            advertisement: false,
            method: "GET",
            path: "path/to/repoB",
            service: Service.ReceivePack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "GET", asyncIterable(), {}, true, "path/to/repoB", Service.ReceivePack],
          {
            advertisement: true,
            method: "GET",
            path: "path/to/repoB",
            service: Service.ReceivePack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, false, "path/to/repoB", Service.UploadPack],
          {
            advertisement: false,
            method: "POST",
            path: "path/to/repoB",
            service: Service.UploadPack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, true, "path/to/repoB", Service.UploadPack],
          {
            advertisement: true,
            method: "POST",
            path: "path/to/repoB",
            service: Service.UploadPack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, false, "path/to/repoB", Service.ReceivePack],
          {
            advertisement: false,
            method: "POST",
            path: "path/to/repoB",
            service: Service.ReceivePack,
            url: "/path/to/repoA",
          },
        ),
        valid(
          ["/path/to/repoA", "POST", asyncIterable(), {}, true, "path/to/repoB", Service.ReceivePack],
          {
            advertisement: true,
            method: "POST",
            path: "path/to/repoB",
            service: Service.ReceivePack,
            url: "/path/to/repoA",
          },
        ),
    ]));
  });

  describe("own properties and methods", () => undefined);

  describe("request delegation", () => undefined);

  describe("response delegation", () => undefined);
});
