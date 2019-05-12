import { Headers } from "node-fetch";
import * as lib from "./context";
import { Service } from "./enum";
import { concat } from "./util/buffer";

type ClassTypeArgs<T extends new (...args: any[]) => any> = T extends new (...args: infer R) => any ? R : any;

describe("class Context", () => {

  //#region constructor

  describe("constructor()", () => {
    /**
     * Create an empty async iterable iterator.
     */
    async function* asyncIterable(): AsyncIterableIterator<Uint8Array> { return; }

    /**
     * Expect arguments to not make the constructor throw, and the expecting
     * results to match the provided values.
     *
     * @param args - Arguments supplied to constructor.
     * @param request - Expected properties to from the resulting
     *                  {@link Context.request | request}.
     * @param context - Expected properties from the resulting
     *                  {@link Context | context}.
     * @param body - Expected {@link Context.body | body}.
     * @param headers - Expected headers from {@link Context.request.headers}.
     */
    async function valid(
      args: ClassTypeArgs<typeof lib.Context> = [],
      request: Pick<lib.Request, Exclude<keyof lib.Request, "headers" | "body">>,
      context: Pick<lib.Context, "advertisement" | "service" | "pathname" | "isInitialised">,
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
      const buffer = concat(buffers);
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

    /**
     * Expect arguments to make the constructor to throw.
     *
     * @param args - Arguments supplied to constructor.
     */
    async function invalid(args: ClassTypeArgs<typeof lib.Context>): Promise<void | never> {
      expect(() => {
        const context = new lib.Context(...args);
        expect(context).toBeInstanceOf(lib.Context);
      }).toThrow();
    }

    test("with zero arguments", async () => valid(
      [],
      {
        ip: "127.0.0.1",
        method: "GET",
        url: "/",
      },
      {
        advertisement: false,
        isInitialised: true,
        pathname: "",
        service: undefined,
      },
    ));

    test("with one argument: first argument shold be remote ip address", async () => Promise.all<any>([
      invalid([undefined]),
      invalid([null as any]),
      invalid([true as any]),
      invalid([false as any]),
      invalid([""]),
      valid(
        [
          "127.0.0.1",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "d10f:da6:cbee::17",
        ],
        {
          ip: "d10f:da6:cbee::17",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "10.0.0.1",
        ],
        {
          ip: "10.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
    ]));

    test("with two arguments: second argument should be an URL-path", async () => Promise.all<any>([
      invalid(["127.0.0.1", undefined]),
      invalid(["127.0.0.1", null as any]),
      invalid(["127.0.0.1", true as any]),
      invalid(["127.0.0.1", false as any]),
      invalid(["127.0.0.1", ""]),
      invalid(["127.0.0.1", "https://example.org/"]),
      invalid(["127.0.0.1", "http://example.org/"]),
      invalid(["127.0.0.1", "repository/info/refs?service=git-upload-pack"]),
      valid(
        [
          "127.0.0.1",
          "/",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/repository/path/info/refs?service=git-upload-pack",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/repository/path/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "repository/path",
          service: Service.UploadPack,
        },
        new Uint8Array(0),
        {},
      ),
    ]));

    test("with three arguments: third argument must be a valid HTTP verb", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", undefined]),
      invalid(["127.0.0.1", "/", null as any]),
      invalid(["127.0.0.1", "/", ""]),
      invalid(["127.0.0.1", "/", "some text"]),
      invalid(["127.0.0.1", "/", "TRACE"]),
      invalid(["127.0.0.1", "/", "CONNECT"]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "get",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "gEt",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "HEAD",
        ],
        {
          ip: "127.0.0.1",
          method: "HEAD",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "POST",
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "PATCH",
        ],
        {
          ip: "127.0.0.1",
          method: "PATCH",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "PUT",
        ],
        {
          ip: "127.0.0.1",
          method: "PUT",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "OPTIONS",
        ],
        {
          ip: "127.0.0.1",
          method: "OPTIONS",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
    ]));

    test("with four arguments: fourth argument should be an async iterable", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", "GET", undefined]),
      invalid(["127.0.0.1", "/", "GET", null as any]),
      invalid(["127.0.0.1", "/", "GET", { async *[Symbol.iterator]() { return; } } as any]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          { async *[Symbol.asyncIterator]() { return; } },
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repo",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-receive-pack",
          "GET",
          asyncIterable(),
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repo",
          service: Service.ReceivePack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-receive-pack",
          "POST",
          asyncIterable(),
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } },
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-upload-pack",
          "POST",
          { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } },
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-receive-pack",
          "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
        new Uint8Array([48, 48, 48, 48]),
      ),
    ]));

    test("with five arguments: fifth argument should be a header-value record or instance of Headers", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), undefined]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), 1 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), "" as any]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          new Headers(),
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repo",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-receive-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repo",
          service: Service.ReceivePack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-receive-pack",
          "POST",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-upload-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-receive-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-upload-pack",
          "POST", asyncIterable(),
          { "content-type": "application/x-git-upload-pack-request" },
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/git-upload-pack",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repo",
          service: Service.UploadPack,
        },
        undefined,
        {
          "content-type": ["application/x-git-upload-pack-request"],
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/git-receive-pack",
          "POST",
          asyncIterable(),
          { "content-type": "application/x-git-receive-pack-request" },
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/git-receive-pack",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repo",
          service: Service.ReceivePack,
        },
        undefined,
        {
          "content-type": ["application/x-git-receive-pack-request"],
        },
      ),
    ]));

    test("with six arguments: sixth argument should be a boolean", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, undefined]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, "" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, "undefined" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, 0 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, 1 as any]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
          {},
          true,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
          {},
          true,
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repo/info/refs?service=git-upload-pack",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
    ]));

    test("with seven arguments: seventh argument should be a string or undefined", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, true as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, true as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, false as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, false as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, 0 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, 0 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, 1 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, 1 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, {} as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, {} as any]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repo",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repo",
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repo",
          service: undefined,
        },
      ),
    ]));

    test("with eight arguments: eighth argument must be a value of enum Service.", async () => Promise.all<any>([
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined, null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, undefined, null as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined, "null" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, undefined, "null" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined, "" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, undefined, "" as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined, 0 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, undefined, 0 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined, 1 as any]),
      invalid(["127.0.0.1", "/", "GET", asyncIterable(), {}, true, undefined, 1 as any]),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          undefined,
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          undefined,
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: false,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          undefined,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: undefined,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repoB",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repoB",
          service: Service.ReceivePack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
          ip: "127.0.0.1",
          method: "GET",
          url: "/path/to/repoA",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: Service.ReceivePack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repoA",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repoB",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repoA",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: Service.UploadPack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repoA",
        },
        {
          advertisement: false,
          isInitialised: false,
          pathname: "path/to/repoB",
          service: Service.ReceivePack,
        },
      ),
      valid(
        [
          "127.0.0.1",
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
          ip: "127.0.0.1",
          method: "POST",
          url: "/path/to/repoA",
        },
        {
          advertisement: true,
          isInitialised: true,
          pathname: "path/to/repoB",
          service: Service.ReceivePack,
        },
      ),
    ]));
  });

  //#endregion constructor
  //#region properties
  //#region instance properties

  describe("public read-only property advertisement:", () => {
    test("should ALWAYS be a boolean", () => {
      const args: Array<ClassTypeArgs<typeof lib.Context>> = [
        ["127.0.0.1", "/", "GET", { async *[Symbol.asyncIterator]() { return; }, }, {}, false],
        ["127.0.0.1", "/", "GET", { async *[Symbol.asyncIterator]() { return; }, }, {}, true],
      ];
      for (const arg of args) {
        const context = new lib.Context(...arg);
        expect(context).toBeInstanceOf(lib.Context);
        expect(typeof context.advertisement).toBe("boolean");
      }
    });
  });

  describe("public property body:", () => {
    test("should set Context.response.body", () => {
      const uniSym: any = Symbol("unique symbol");
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      context.body = uniSym;
      expect(context.response.body).toBe(uniSym);
    });

    test("should get Context.response.body", () => {
      const uniSym: any = Symbol("unique symbol");
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      context.response.body = uniSym;
      expect(context.body).toBe(uniSym);
    });
  });

  describe("public property headers:", () => {
    test("should be same node-fetch#Headers instance as Context.response.headers", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.headers).toBe(context.response.headers);
    });
  });

  //#region instance properties
  //#region static properties

  //#endregion static properties
  //#endregion properties
  //#region methods
  //#region instance methods

  describe("public method addMessage():", () => undefined);

  describe("public method addError():", () => undefined);

  describe("public method asyncIterableIterator():", () => {
    function createContext(body: lib.Body): lib.Context {
      const ctx = new lib.Context();
      expect(ctx).toBeInstanceOf(lib.Context);
      ctx.body = body;
      return ctx;
    }

    const Bodies: lib.Body[] = [
      undefined,
      null,
      new Uint8Array(0),
      new Uint8Array([48, 48, 48, 48]),
      Promise.resolve(new Uint8Array(0)),
      Promise.resolve(new Uint8Array([48, 48, 48, 48])),
      { async then(resolve, reject) { return Promise.resolve(new Uint8Array(0)).then(resolve, reject); } },
      { async then(resolve, reject) { return Promise.resolve(new Uint8Array([48, 48, 48, 48])).then(resolve, reject); } },
      { [Symbol.iterator](): Iterator<Uint8Array> { return (function*() { yield new Uint8Array(0); })(); } },
      { [Symbol.iterator](): Iterator<Uint8Array> { return (function*() { yield new Uint8Array([48, 48, 48, 48]); })(); } },
      { *[Symbol.iterator](): IterableIterator<Uint8Array> { yield new Uint8Array(0); } },
      { *[Symbol.iterator](): IterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); } },
      (function *(): IterableIterator<Uint8Array> { yield new Uint8Array(0); })(),
      (function *(): IterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); })(),
      { [Symbol.asyncIterator](): AsyncIterator<Uint8Array> { return (async function*() { yield new Uint8Array(0); })(); } },
      { [Symbol.asyncIterator](): AsyncIterator<Uint8Array> { return (async function*() { yield new Uint8Array([48, 48, 48, 48]); })(); } },
      { async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> { yield new Uint8Array(0); } },
      { async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); } },
    ];

    const ReusableBodies: lib.Body[] = [
      (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array(0); })(),
      (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); })(),
    ];

    test("should return an async iterable iterator created from Context.body", () => {
      for (const initBody of Bodies) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).not.toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
      }
      for (const initBody of ReusableBodies) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
      }
    });

    test("should set Context.body to return value", () => {
      for (const initBody of Bodies) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).not.toBe(body);
        expect(context.body).toBe(body);
      }
      for (const initBody of ReusableBodies) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).toBe(body);
        expect(context.body).toBe(body);
      }
    });
  });

  describe("public method capabilities():", () => {
    test("should return a promise", async() => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      const promise = context.capabilities();
      await expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeInstanceOf(Map);
    });
  });

  describe("public method commands():", () => {
    test("should return a promise", async () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      const promise = context.commands();
      await expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeInstanceOf(Array);
    });
  });

  describe("public method initialise():", () => {
    test("should return a promise", async () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      const promise = context.initialise();
      await expect(promise).toBeInstanceOf(Promise);
      await expect(promise).resolves.toBeUndefined();
    });
  });

  describe("public method setHeader():", () => undefined);

  //#endregion instance methods
  //#region static methods

  //#endregion static methods
  //#endregion methods
  //#region stream compatibility

  describe("readable", () => {
    describe("request():", () => undefined);

    describe("response():", () => undefined);
  });

  //#endregion stream compatibility
});
