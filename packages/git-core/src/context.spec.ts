import { Headers } from "node-fetch";
import * as lib from "./context";
import * as pLib from "./context.private";
import { Service } from "./enum";
import { concat } from "./util/buffer";

type ClassTypeArgs<T extends new (...args: any[]) => any> = T extends new (...args: infer R) => any ? R : any;

describe("class Context", () => {

  /**
   * Create an empty async iterable iterator.
   */
  async function* asyncIterable(): AsyncIterableIterator<Uint8Array> { return; }

  //#region constructor

  describe("public constructor():", () => {
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

  describe("public property advertisement:", () => {
    test("should be a boolean", () => {
      const args: Array<[ClassTypeArgs<typeof lib.Context>, boolean?]> = [
        [["127.0.0.1", "/", "GET", asyncIterable(), {}, undefined]],

        [[], false],
        [["127.0.0.1", "/", "GET", asyncIterable(), {}], false],
        [["127.0.0.1", "/", "GET", asyncIterable(), {}, false], false],

        [["127.0.0.1", "/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}], true],
        [["127.0.0.1", "/", "GET", asyncIterable(), {}, true], true],
      ];
      for (const [arg, result] of args) {
        // Expect to throw
        if (result === undefined) {
          expect(() => new lib.Context(...arg)).toThrow();
        }
        // Expect result
        else {
          const context = new lib.Context(...arg);
          expect(context).toBeInstanceOf(lib.Context);
          expect(typeof context.advertisement).toBe("boolean");
          expect(context.advertisement).toBe(result);
        }
      }
    });

    test("should be non-writable", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.advertisement).toBe(false);
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => context.advertisement = true).toThrow();
      expect(context.advertisement).toBe(false);
    });
  });

  describe("public property body:", () => {
    // Test statement using symbols
    test("should be the same as Context.response.body", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.body).toBe(context.response.body);
      const uniSym1: any = Symbol("unique symbol");
      context.body = uniSym1;
      expect(context.body).toBe(context.response.body);
      const uniSym2: any = Symbol("unique symbol");
      context.response.body = uniSym2;
      expect(context.response.body).toBe(context.body);
    });
  });

  describe("public property headers:", () => {
    test("should be an instance of node-fetch#Headers", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.headers).toBeInstanceOf(Headers);
    });

    // Test statement using symbols
    test("should be the same as Context.response.headers", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.headers).toBe(context.response.headers);
      const uniSym1: any = Symbol("unique symbol");
      context.headers = uniSym1;
      expect(context.headers).toBe(context.response.headers);
      const uniSym2: any = Symbol("unique symbol");
      context.response.headers = uniSym2;
      expect(context.response.headers).toBe(context.headers);
    });
  });

  describe("public property ip:", () => {
    test("should be the same as Context.request.ip", () => {
      const ctx1 = new lib.Context("127.0.0.1");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.ip).toBe("127.0.0.1");
      expect(ctx1.request.ip).toBe("127.0.0.1");
      expect(ctx1.ip).toBe(ctx1.request.ip);

      const ctx2 = new lib.Context("10.0.0.1");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.ip).toBe("10.0.0.1");
      expect(ctx2.request.ip).toBe("10.0.0.1");
      expect(ctx2.ip).toBe(ctx2.request.ip);
    });

    test("should be non-writable", () => {
      const ctx1 = new lib.Context("127.0.0.1");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.ip).toBe("127.0.0.1");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx1.ip = "::1").toThrow();
      expect(ctx1.ip).toBe("127.0.0.1");

      const ctx2 = new lib.Context("10.0.0.1");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.ip).toBe("10.0.0.1");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx2.ip = "::1").toThrow();
      expect(ctx2.ip).toBe("10.0.0.1");
    });
  });

  describe("public property isInitialised:", () => {
    test("should only be false when advertisement is false, service is set, and body is still being parsed/read/analysed", () => {
      // Missing both
      const ctx1 = new lib.Context("127.0.0.1", "/", "POST", asyncIterable(), {}, true, undefined, undefined);
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.isInitialised).toBe(true);

      // Missing (non-)advertisement
      const ctx2 = new lib.Context("127.0.0.1", "/", "POST", asyncIterable(), {}, true, undefined, Service.UploadPack);
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.isInitialised).toBe(true);

      // Missing service
      const ctx3 = new lib.Context("127.0.0.1", "/", "POST", asyncIterable(), {}, false, undefined, undefined);
      expect(ctx3).toBeInstanceOf(lib.Context);
      expect(ctx3.isInitialised).toBe(true);

      // Meet the requirements
      const ctx4 = new lib.Context("127.0.0.1", "/", "POST", asyncIterable(), {}, false, undefined, Service.UploadPack);
      expect(ctx4).toBeInstanceOf(lib.Context);
      expect(ctx4.isInitialised).toBe(false);
    });

    test("should be non-writable", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.isInitialised).toBe(true);
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => context.isInitialised = false).toThrow();
      expect(context.isInitialised).toBe(true);
    });
  });

  describe("public property method:", () => {
    test("should be the same as Context.request.method", () => {
      const ctx1 = new lib.Context("127.0.0.1", "/", "GET");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.method).toBe("GET");
      expect(ctx1.request.method).toBe("GET");
      expect(ctx1.method).toBe(ctx1.request.method);

      const ctx2 = new lib.Context("127.0.0.1", "/", "POST");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.method).toBe("POST");
      expect(ctx2.request.method).toBe("POST");
      expect(ctx2.method).toBe(ctx2.request.method);
    });

    test("should be non-writable", () => {
      const ctx1 = new lib.Context("127.0.0.1", "/", "GET");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.method).toBe("GET");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx1.method = "PATCH").toThrow();
      expect(ctx1.method).toBe("GET");

      const ctx2 = new lib.Context("127.0.0.1", "/", "POST");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.method).toBe("POST");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx2.method = "PATCH").toThrow();
      expect(ctx2.method).toBe("POST");
    });
  });

  describe("public property pathname:", () => {
    test("should default to a string, regardless of constructor input for value", () => {
      // Infer pathname from url and method

      const url1 = "/info/refs?service=git-upload-pack";
      const [, pathname1] = pLib.inferValues(url1, "GET");
      const ctx1 = new lib.Context("127.0.0.1", url1, "GET", asyncIterable());
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(typeof pathname1).toBe("undefined");
      expect(typeof ctx1.pathname).toBe("string");
      expect(pathname1).toBeUndefined();
      expect(ctx1.pathname).toBe("");

      const url2 = "/path/to/repo/info/refs?service=git-upload-pack";
      const [, pathname2] = pLib.inferValues(url2, "GET");
      const ctx2 = new lib.Context("127.0.0.1", url2, "GET", asyncIterable());
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(typeof pathname2).toBe("string");
      expect(typeof ctx2.pathname).toBe("string");
      expect(pathname2).toBe("path/to/repo");
      expect(ctx2.pathname).toBe("path/to/repo");

      // Set pathname in constructor

      const ctx3 = new lib.Context("127.0.0.1", "/", "GET", asyncIterable(), {}, false, undefined);
      expect(ctx3).toBeInstanceOf(lib.Context);
      expect(typeof ctx3.pathname).toBe("string");
      expect(ctx3.pathname).toBe("");

      const ctx4 = new lib.Context("127.0.0.1", "/", "GET", asyncIterable(), {}, false, "");
      expect(ctx4).toBeInstanceOf(lib.Context);
      expect(typeof ctx4.pathname).toBe("string");
      expect(ctx4.pathname).toBe("");

      const ctx5 = new lib.Context("127.0.0.1", "/", "GET", asyncIterable(), {}, false, "path/to/repo");
      expect(ctx5).toBeInstanceOf(lib.Context);
      expect(typeof ctx5.pathname).toBe("string");
      expect(ctx5.pathname).toBe("path/to/repo");
    });

    describe("public property url:", () => {
      test("should be the same as Context.request.url", () => {
        const ctx1 = new lib.Context("127.0.0.1", "/");
        expect(ctx1).toBeInstanceOf(lib.Context);
        expect(ctx1.url).toBe("/");
        expect(ctx1.request.url).toBe("/");
        expect(ctx1.url).toBe(ctx1.request.url);

        const ctx2 = new lib.Context("127.0.0.1", "/path/to/some/repo?withAQuery=true");
        expect(ctx2).toBeInstanceOf(lib.Context);
        expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
        expect(ctx2.request.url).toBe("/path/to/some/repo?withAQuery=true");
        expect(ctx2.url).toBe(ctx2.request.url);
      });

      test("should be non-writable", () => {
        const ctx1 = new lib.Context("127.0.0.1", "/");
        expect(ctx1).toBeInstanceOf(lib.Context);
        expect(ctx1.url).toBe("/");
        // tslint:disable-next-line
        // @ts-ignore
        expect(() => ctx1.url = "/some/other/path?hidden=false").toThrow();
        expect(ctx1.url).toBe("/");

        const ctx2 = new lib.Context("127.0.0.1", "/path/to/some/repo?withAQuery=true");
        expect(ctx2).toBeInstanceOf(lib.Context);
        expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
        // tslint:disable-next-line
        // @ts-ignore
        expect(() => ctx2.url = "/some/other/path?hidden=false").toThrow();
        expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
      });
    });
  });

  describe("public read-only property readable:", () => {
    test("should be non-writable", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => context.readable = undefined).toThrow();
    });

    describe("request():", () => undefined);

    describe("response():", () => undefined);
  });

  describe("public property status:", () => {
    test("should default to 404 for new instances", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.status).toBe(404);
    });

    // Test statement using symbols
    test("should be the same as Context.response.status", () => {
      const context = new lib.Context();
      expect(context).toBeInstanceOf(lib.Context);
      expect(context.status).toBe(context.response.status);
      const uniSym1: any = Symbol("unique symbol");
      context.status = uniSym1;
      expect(context.status).toBe(context.response.status);
      const uniSym2: any = Symbol("unique symbol");
      context.response.status = uniSym2;
      expect(context.response.status).toBe(context.status);
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

    function Bodies(): Array<[lib.Body, Uint8Array?]> {
      return [
        [
          undefined,
          undefined,
        ],
        [
          null,
          undefined,
        ],
        [
          new Uint8Array(0),
          new Uint8Array(0),
        ],
        [
          new Uint8Array([48, 48, 48, 48]),
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          Promise.resolve(new Uint8Array(0)),
          new Uint8Array(0),
        ],
        [
          Promise.resolve(new Uint8Array([48, 48, 48, 48])),
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          { async then(resolve, reject) { return Promise.resolve(new Uint8Array(0)).then(resolve, reject); } },
          new Uint8Array(0),
        ],
        [
          { async then(resolve, reject) { return Promise.resolve(new Uint8Array([48, 48, 48, 48])).then(resolve, reject); } },
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          { [Symbol.iterator](): Iterator<Uint8Array> { return (function*() { yield new Uint8Array(0); })(); } },
          new Uint8Array(0),
        ],
        [
          { [Symbol.iterator](): Iterator<Uint8Array> { return (function*() { yield new Uint8Array([48, 48, 48, 48]); })(); } },
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          { *[Symbol.iterator](): IterableIterator<Uint8Array> { yield new Uint8Array(0); } },
          new Uint8Array(0),
        ],
        [
          { *[Symbol.iterator](): IterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); } },
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          (function *(): IterableIterator<Uint8Array> { yield new Uint8Array(0); })(),
          new Uint8Array(0),
        ],
        [
          (function *(): IterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); })(),
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          { [Symbol.asyncIterator](): AsyncIterator<Uint8Array> { return (async function*() { yield new Uint8Array(0); })(); } },
          new Uint8Array(0),
        ],
        [
          { [Symbol.asyncIterator]() { return (async function*() { yield new Uint8Array([48, 48, 48, 48]); })(); } },
          new Uint8Array([48, 48, 48, 48]),
        ],
        [
          { async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> { yield new Uint8Array(0); } },
          new Uint8Array(0),
        ],
        [
          { async *[Symbol.asyncIterator](): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); } },
          new Uint8Array([48, 48, 48, 48]),
        ],
      ];
}

    const ReusableBodies: lib.Body[] = [
      (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array(0); })(),
      (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); })(),
    ];

    test("should return an async iterable iterator created from Context.body", async () => {
      for (const [initBody, expected] of Bodies()) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).not.toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
        const {value: actual} = await body.next();
        expect(actual).toEqual(expected);
      }
      for (const initBody of ReusableBodies) {
        const context = createContext(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
      }
    });

    test("should set Context.body to return value of method", () => {
      for (const [initBody] of Bodies()) {
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
});
