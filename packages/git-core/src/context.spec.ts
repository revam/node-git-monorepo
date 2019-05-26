import { Headers } from "node-fetch";
import * as lib from "./context";
import * as pLib from "./context.private";
import { Service, ErrorCodes } from "./enum";
import * as buffer from "./util/buffer";
import * as assert from "../test/helpers/assert";
import * as packet from "./util/packet";

type ClassTypeArgs<T extends new (...args: any[]) => any> = T extends new (...args: infer R) => any ? R : any;
type FunctionArgs<T> = T extends (...args: infer R) => any ? R : any;
type MethodArgs<T, TKey extends keyof T> = FunctionArgs<T[TKey]>;

describe("class Context", () => {

  function createContext(
    service: Service,
    body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array> = async function *() { /**/ }(),
    advertisement: boolean = true,
  ): lib.Context | never {
    const ctx = new lib.Context(
      advertisement ? `/info/refs?service=git-${service}` : `/git-${service}`,
      advertisement ? "GET" : "POST",
      body,
      advertisement ? {} : { "Content-Type": `application/x-git-${service}-request` },
    );
    expect(ctx).toBeInstanceOf(lib.Context);
    return ctx;
  }

  /**
   * Create an empty async iterable iterator.
   */
  async function* asyncIterable(): AsyncIterableIterator<Uint8Array> { return; }

  //#region constructor

  describe("constructor():", () => {
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
      const combined = buffer.concat(buffers);
      expect(combined).toEqual(body);
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

    test("with one arguments: first argument should be an URL-path", async () => Promise.all<any>([
      invalid([undefined]),
      invalid([null as any]),
      invalid([true as any]),
      invalid([false as any]),
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
          pathname: "",
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
          pathname: "repository/path",
          service: Service.UploadPack,
        },
        new Uint8Array(0),
        {},
      ),
    ]));

    test("with two arguments: second argument must be a valid HTTP verb", async () => Promise.all<any>([
      invalid(["/", undefined]),
      invalid(["/", null as any]),
      invalid(["/", ""]),
      invalid(["/", "some text"]),
      invalid(["/", "TRACE"]),
      invalid(["/", "CONNECT"]),
      valid(
        [
          "/",
          "GET",
        ],
        {
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
          "/",
          "get",
        ],
        {
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
          "/",
          "gEt",
        ],
        {
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
          "/",
          "HEAD",
        ],
        {
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
          "/",
          "POST",
        ],
        {
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
          "/",
          "PATCH",
        ],
        {
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
          "/",
          "PUT",
        ],
        {
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
          "/",
          "OPTIONS",
        ],
        {
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

    test("with three arguments: third argument should be an async iterable", async () => Promise.all<any>([
      invalid(["/", "GET", undefined]),
      invalid(["/", "GET", null as any]),
      invalid(["/", "GET", { async *[Symbol.iterator]() { return; } } as any]),
      valid(
        [
          "/",
          "GET",
          { async *[Symbol.asyncIterator]() { return; } },
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
        ],
        {
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
          "/path/to/repo/info/refs?service=git-receive-pack",
          "GET",
          asyncIterable(),
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
        ],
        {
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
          "/path/to/repo/info/refs?service=git-receive-pack",
          "POST",
          asyncIterable(),
        ],
        {
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
          "/",
          "GET",
          { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } },
        ],
        {
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
          "/path/to/repo/git-upload-pack",
          "POST",
          { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } },
        ],
        {
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
          "/path/to/repo/git-receive-pack",
          "POST", { async *[Symbol.asyncIterator]() { yield new Uint8Array([48, 48, 48, 48]); } }],
        {
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

    test("with four arguments: fourth argument should be a header-value record or instance of Headers", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), undefined]),
      invalid(["/", "GET", asyncIterable(), null as any]),
      invalid(["/", "GET", asyncIterable(), 1 as any]),
      invalid(["/", "GET", asyncIterable(), "" as any]),
      valid(
        [
          "/",
          "GET",
          asyncIterable(),
          {},
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          new Headers(),
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/info/refs?service=git-receive-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/info/refs?service=git-receive-pack",
          "POST",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/git-upload-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/git-receive-pack",
          "GET",
          asyncIterable(),
          {},
        ],
        {
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
          "/path/to/repo/git-upload-pack",
          "POST", asyncIterable(),
          { "content-type": "application/x-git-upload-pack-request" },
        ],
        {
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
          "/path/to/repo/git-receive-pack",
          "POST",
          asyncIterable(),
          { "content-type": "application/x-git-receive-pack-request" },
        ],
        {
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

    test("with five arguments: fifth argument should be a boolean", async () => Promise.all<any>([
      invalid(["/", "GET", asyncIterable(), {}, undefined]),
      invalid(["/", "GET", asyncIterable(), {}, null as any]),
      invalid(["/", "GET", asyncIterable(), {}, "" as any]),
      invalid(["/", "GET", asyncIterable(), {}, "undefined" as any]),
      invalid(["/", "GET", asyncIterable(), {}, 0 as any]),
      invalid(["/", "GET", asyncIterable(), {}, 1 as any]),
      valid(
        [
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "GET",
          asyncIterable(),
          {},
          true,
        ],
        {
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
          "/path/to/repo/info/refs?service=git-upload-pack",
          "POST",
          asyncIterable(),
          {},
          true,
        ],
        {
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

    test("with six arguments: sixth argument should be a string or undefined", async () => Promise.all<any>([
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
        [
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          undefined,
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          undefined,
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repo",
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repo",
        ],
        {
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

    test("with seven arguments: seventh argument must be a value of enum Service.", async () => Promise.all<any>([
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
        [
          "/",
          "GET",
          asyncIterable(),
          {},
          false,
          undefined,
          undefined,
        ],
        {
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
          "/",
          "GET",
          asyncIterable(),
          {},
          true,
          undefined,
          undefined,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          undefined,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          undefined,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
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
          "/path/to/repoA",
          "GET",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
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
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
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
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.UploadPack,
        ],
        {
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
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          false,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
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
          "/path/to/repoA",
          "POST",
          asyncIterable(),
          {},
          true,
          "path/to/repoB",
          Service.ReceivePack,
        ],
        {
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

  describe("property advertisement:", () => {
    test("should be a boolean", () => {
      const args: Array<[ClassTypeArgs<typeof lib.Context>, boolean?]> = [
        [["/", "GET", asyncIterable(), {}, undefined]],

        [[], false],
        [["/", "GET", asyncIterable(), {}], false],
        [["/", "GET", asyncIterable(), {}, false], false],

        [["/info/refs?service=git-upload-pack", "GET", asyncIterable(), {}], true],
        [["/", "GET", asyncIterable(), {}, true], true],
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

  describe("property body:", () => {
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

  describe("property headers:", () => {
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

  describe("property isInitialised:", () => {
    test("should only be false when advertisement is false, service is set, and body is still being parsed/read/analysed", () => {
      // Missing both
      const ctx1 = new lib.Context("/", "POST", asyncIterable(), {}, true, undefined, undefined);
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.isInitialised).toBe(true);

      // Missing (non-)advertisement
      const ctx2 = new lib.Context("/", "POST", asyncIterable(), {}, true, undefined, Service.UploadPack);
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.isInitialised).toBe(true);

      // Missing service
      const ctx3 = new lib.Context("/", "POST", asyncIterable(), {}, false, undefined, undefined);
      expect(ctx3).toBeInstanceOf(lib.Context);
      expect(ctx3.isInitialised).toBe(true);

      // Meet the requirements
      const ctx4 = new lib.Context("/", "POST", asyncIterable(), {}, false, undefined, Service.UploadPack);
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

  describe("property length:", () => {
    test('should reflect value of response header "Content-Length"', () => {
      const context = new lib.Context();
      const { response: { headers } } = context;
      expect(context).toBeInstanceOf(lib.Context);

      // Set header directly.
      headers.set("Content-Length", "10");
      expect(context.length).toBe(10);
      expect(headers.get("Content-Length")).toBe("10");

      // Unset header directly.
      headers.delete("Content-Length");
      expect(context.length).toBe(undefined);
      expect(headers.get("Content-Length")).toBe(null);
    });

    test('should set/unset response header "Content-Length"', () => {
      const context = new lib.Context();
      const { response: { headers } } = context;
      expect(context).toBeInstanceOf(lib.Context);

      // Set header through property.
      context.length = 20;
      expect(context.length).toBe(20);
      expect(headers.get("Content-Length")).toBe("20");

      // Unset header through property.
      context.length = undefined;
      expect(context.length).toBe(undefined);
      expect(headers.get("Content-Length")).toBe(null);
    });
  });

  describe("property method:", () => {
    test("should be the same as Context.request.method", () => {
      const ctx1 = new lib.Context("/", "GET");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.method).toBe("GET");
      expect(ctx1.request.method).toBe("GET");
      expect(ctx1.method).toBe(ctx1.request.method);

      const ctx2 = new lib.Context("/", "POST");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.method).toBe("POST");
      expect(ctx2.request.method).toBe("POST");
      expect(ctx2.method).toBe(ctx2.request.method);
    });

    test("should be non-writable", () => {
      const ctx1 = new lib.Context("/", "GET");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.method).toBe("GET");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx1.method = "PATCH").toThrow();
      expect(ctx1.method).toBe("GET");

      const ctx2 = new lib.Context("/", "POST");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.method).toBe("POST");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx2.method = "PATCH").toThrow();
      expect(ctx2.method).toBe("POST");
    });
  });

  describe("property pathname:", () => {
    test("should default to a string, regardless of constructor input for value", () => {
      // Infer pathname from url and method

      const url1 = "/info/refs?service=git-upload-pack";
      const [, pathname1] = pLib.inferValues(url1, "GET");
      const ctx1 = new lib.Context(url1, "GET", asyncIterable());
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(typeof pathname1).toBe("undefined");
      expect(typeof ctx1.pathname).toBe("string");
      expect(pathname1).toBeUndefined();
      expect(ctx1.pathname).toBe("");

      const url2 = "/path/to/repo/info/refs?service=git-upload-pack";
      const [, pathname2] = pLib.inferValues(url2, "GET");
      const ctx2 = new lib.Context(url2, "GET", asyncIterable());
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(typeof pathname2).toBe("string");
      expect(typeof ctx2.pathname).toBe("string");
      expect(pathname2).toBe("path/to/repo");
      expect(ctx2.pathname).toBe("path/to/repo");

      // Set pathname in constructor

      const ctx3 = new lib.Context("/", "GET", asyncIterable(), {}, false, undefined);
      expect(ctx3).toBeInstanceOf(lib.Context);
      expect(typeof ctx3.pathname).toBe("string");
      expect(ctx3.pathname).toBe("");

      const ctx4 = new lib.Context("/", "GET", asyncIterable(), {}, false, "");
      expect(ctx4).toBeInstanceOf(lib.Context);
      expect(typeof ctx4.pathname).toBe("string");
      expect(ctx4.pathname).toBe("");

      const ctx5 = new lib.Context("/", "GET", asyncIterable(), {}, false, "path/to/repo");
      expect(ctx5).toBeInstanceOf(lib.Context);
      expect(typeof ctx5.pathname).toBe("string");
      expect(ctx5.pathname).toBe("path/to/repo");
    });
  });

  describe("property readable:", () => {
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

  describe("property status:", () => {
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

  describe("property type:", () => {
    test('should reflect value of response header "Content-Type"', () => {
      const context = new lib.Context();
      const { response: { headers } } = context;
      expect(context).toBeInstanceOf(lib.Context);

      // Set header directly.
      headers.set("Content-Type", "");
      expect(context.type).toBe("");
      expect(headers.get("Content-Type")).toBe("");

      // Unset header directly.
      headers.delete("Content-Type");
      expect(context.type).toBe(undefined);
      expect(headers.get("Content-Type")).toBe(null);
    });

    test('should set/unset response header "Content-Type"', () => {
      const context = new lib.Context();
      const { response: { headers } } = context;
      expect(context).toBeInstanceOf(lib.Context);

      // Set header through property.
      context.type = "application/javascript";
      expect(context.type).toBe("application/javascript");
      expect(headers.get("Content-Type")).toBe("application/javascript");

      // Unset header through property.
      context.type = undefined;
      expect(context.type).toBe(undefined);
      expect(headers.get("Content-Type")).toBe(null);
    });
  });

  describe("property url:", () => {
    test("should be the same as Context.request.url", () => {
      const ctx1 = new lib.Context("/");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.url).toBe("/");
      expect(ctx1.request.url).toBe("/");
      expect(ctx1.url).toBe(ctx1.request.url);

      const ctx2 = new lib.Context("/path/to/some/repo?withAQuery=true");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
      expect(ctx2.request.url).toBe("/path/to/some/repo?withAQuery=true");
      expect(ctx2.url).toBe(ctx2.request.url);
    });

    test("should be non-writable", () => {
      const ctx1 = new lib.Context("/");
      expect(ctx1).toBeInstanceOf(lib.Context);
      expect(ctx1.url).toBe("/");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx1.url = "/some/other/path?hidden=false").toThrow();
      expect(ctx1.url).toBe("/");

      const ctx2 = new lib.Context("/path/to/some/repo?withAQuery=true");
      expect(ctx2).toBeInstanceOf(lib.Context);
      expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
      // tslint:disable-next-line
      // @ts-ignore
      expect(() => ctx2.url = "/some/other/path?hidden=false").toThrow();
      expect(ctx2.url).toBe("/path/to/some/repo?withAQuery=true");
    });
  });

  //#endregion instance properties
  //#region static properties

  //#endregion static properties
  //#endregion properties
  //#region methods
  //#region instance methods

  describe("method addMessage():", () => undefined);

  describe("method addError():", () => undefined);

  describe("method asyncIterableIterator():", () => {
    function createContextWithBody(body: lib.Body): lib.Context {
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

    function ReusableBodies(): lib.Body[] {
      return [
        (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array(0); })(),
        (async function *(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); })(),
      ];
    }

    test("should return an async iterable iterator created from Context.body", async () => {
      for (const [initBody, expected] of Bodies()) {
        const context = createContextWithBody(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).not.toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
        const {value: actual} = await body.next();
        expect(actual).toEqual(expected);
      }
      for (const initBody of ReusableBodies()) {
        const context = createContextWithBody(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).toBe(body);
        expect(context.toAsyncIterator()).toBe(body);
      }
    });

    test("should set Context.body to return value of method", () => {
      for (const [initBody] of Bodies()) {
        const context = createContextWithBody(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).not.toBe(body);
        expect(context.body).toBe(body);
      }
      for (const initBody of ReusableBodies()) {
        const context = createContextWithBody(initBody);
        const body = context.toAsyncIterator();
        expect(initBody).toBe(body);
        expect(context.body).toBe(body);
      }
    });
  });

  describe("method awaitInitialise():", () => {
    test("should be async", async () => {
      const context = createContext(Service.UploadPack);
      const promise = context.awaitInitialised();
      await expect(promise).toBeInstanceOf(Promise);
    });

    test("should resolve if body-parser does not encounter any errors.", async () => Promise.all([
      (async () => {
        async function *body(): AsyncIterableIterator<Uint8Array> {
          yield buffer.concat([
            packet.encodeRawPacket("want 0000000000000000000000000000000000000001 foo version=2.19"),
            packet.encodeRawPacket("have 0000000000000000000000000000000000000000"),
            buffer.encode("0000"),
            buffer.encode("POST<binary data>"),
          ]);
        }
        const context = createContext(Service.UploadPack, body(), false);
        expect(context.isInitialised).toBe(false);
        await Promise.all([
          assert.resolves(context.awaitInitialised(), undefined),
          assert.resolves(
            context.commands(),
            [
              {
                commits: ["0000000000000000000000000000000000000001"],
                kind: "want",
              },
              {
                commits: ["0000000000000000000000000000000000000000"],
                kind: "have",
              },
            ],
          ),
          assert.resolves(
            context.capabilities(),
            new Map([
              [
                "foo",
                undefined,
              ],
              [
                "version",
                "2.19",
              ],
            ]),
          ),
        ]);
      })(),
      (async () => {
        async function *body(): AsyncIterableIterator<Uint8Array> {
          yield buffer.concat([
            // First command AND capabilities client want/have.
            // Create head
            packet.encodeRawPacket(
              "0000000000000000000000000000000000000000 0000000000000000000000000000000000000004 refs/heads/master foo bar version=2.19",
            ),
            // Other commands in this request
            // Update head
            packet.encodeRawPacket(
              "0000000000000000000000000000000000000002 0000000000000000000000000000000000000003 refs/heads/feature/super-feature",
            ),
            // Delete head
            packet.encodeRawPacket(
              "0000000000000000000000000000000000000001 0000000000000000000000000000000000000000 refs/heads/feature/to-be-removed",
            ),
            // End of packets
            buffer.encode("0000"),
            // Start of binary data (should not read this far)
            buffer.encode("POST<some binary gibberish>"),
          ]);
        }
        const context = createContext(Service.ReceivePack, body(), false);
        expect(context.isInitialised).toBe(false);
        await Promise.all([
          assert.resolves(context.awaitInitialised(), undefined),
          assert.resolves(
            context.commands(),
            [
              {
                commits: ["0000000000000000000000000000000000000000", "0000000000000000000000000000000000000004"],
                kind: "create",
                reference: "refs/heads/master",
              },
              {
                commits: ["0000000000000000000000000000000000000002", "0000000000000000000000000000000000000003"],
                kind: "update",
                reference: "refs/heads/feature/super-feature",
              },
              {
                commits: ["0000000000000000000000000000000000000001", "0000000000000000000000000000000000000000"],
                kind: "delete",
                reference: "refs/heads/feature/to-be-removed",
              },
            ],
          ),
          assert.resolves(
            context.capabilities(),
            new Map([
              [
                "foo",
                undefined,
              ],
              [
                "bar",
                undefined,
              ],
              [
                "version",
                "2.19",
              ],
            ]),
          ),
        ]);
      })(),
    ]));

    test("should throw if body-parser encounter a malformed command", async () => {
      const Packets = [
        "want something",
        "have something",
        "a string",
        "Z000000000000000000000000000000000000000 Z000000000000000000000000000000000000000 refs/heads/master",
        "To throw or not to throw, that is the question.",
      ];
      await Promise.all(Object.values(Service).map(async (service: Service) => {
        for (const Packet of Packets)  {
          async function *body(): AsyncIterableIterator<Uint8Array> {
            yield packet.encodeRawPacket(Packet);
          }
          const context = createContext(service, body(), false);
          expect(context.isInitialised).toBe(false);
          await assert.rejectsWithCode(context.awaitInitialised(), ErrorCodes.MalformedCommand);
        }
      }));
    });

    test("should throw if body-parser encounter an invalid packet with out-of-bounds ending position", async () => {
      async function *body(): AsyncIterableIterator<Uint8Array> {
        const encoded = packet.encodeRawPacket("want something");
        // Invalidate ending position.
        encoded[0] = 49;
        yield encoded;
      }
      const context = createContext(Service.UploadPack, body(), false);
      expect(context.isInitialised).toBe(false);
      await assert.rejectsWithCode(context.awaitInitialised(), ErrorCodes.InvalidPacket);
    });

    test("should throw if body-parser encounter an invalid packet with invalid starting position", async () => {
      async function *body(): AsyncIterableIterator<Uint8Array> {
        yield buffer.encode("not a packet");
      }
      const context = createContext(Service.UploadPack, body(), false);
      expect(context.isInitialised).toBe(false);
      const promise = context.awaitInitialised();
      await assert.rejectsWithCode(promise, ErrorCodes.InvalidPacket);
    });
  });

  describe("method capabilities():", () => {
    test("should be async", async() => {
      const context = new lib.Context();
      assert.ok(context instanceof lib.Context);
      const promise = context.capabilities();
      assert.ok(promise instanceof Promise);
      await assert.resolves(promise, new Map());
    });
  });

  describe("method commands():", () => {
    test("should be async", async () => {
      const context = new lib.Context();
      assert.ok(context instanceof lib.Context);
      const promise = context.commands();
      assert.ok(promise instanceof Promise);
      await assert.resolves(promise, []);
    });
  });

  describe("method setHeader():", () => {
    test("should set response headers", () => {
      const headers: Array<{ keys: string[]; values: Array<MethodArgs<lib.Context, "setHeader">[1]>}> = [
        {
          keys: ["Context-Type", "context-type", "CONTEXT-TYPE", "CoNtExT-tYpE"],
          values: [undefined, "", "application/javascript"],
        },
        {
          keys: ["Context-Length", "context-length", "CONTEXT-LENGTH", "CoNtExT-lEnGtH"],
          values: [undefined, 0, 100],
        },
        {
          keys: ["Context-Encoding", "context-encoding", "CONTEXT-ENCODING", "CoNtExT-eNcOdInG"],
          values: [undefined, "gzip", "compress", ["deflate", "gzip"]],
        },
      ];
      for (const {keys, values} of headers) {
        // Do it with a clean context
        const context = new lib.Context();
        // Be sure the headers are empty before we begin.
        assert.strictEqual(Array.from(convertIterator(context.response.headers.entries())).length, 0);
        for (const key of keys) {
          assert.ok(!context.response.headers.has(key));
        }
        for (const value of values) {
          context.setHeader(keys[0], value);
          for (const key of keys) {
            const result = context.headers.get(key);
            assert.strictEqual(
              result === null ? undefined : result,
              value === undefined ? undefined : value instanceof Array ? value.join(", ") : `${value}`,
            );
          }
        }
        for (const key of keys) {
          assert.ok(context.response.headers.has(key));
        }
      }
    });
  });

  //#endregion instance methods
  //#region static methods

  //#endregion static methods
  //#endregion methods
});

function *convertIterator<T>(iterator: Iterator<T>): IterableIterator<T> {
  let result: IteratorResult<T> = iterator.next();
  while (!result.done) {
    yield result.value;
    result = iterator.next();
  }
  if (result.value) {
    return result.value;
  }
}
