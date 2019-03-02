import { Readable, Writable } from "stream";
import { URL } from "url";
import * as lib from "./context.private";
import { Service } from "./enum";
import { checkEnum } from "./enum.private";

// tslint:disable:cyclomatic-complexity

type ArgumentsType<T extends (...args: any[]) => any> = T extends (...args: infer R) => any ? R : any;

describe("RegExp Advertisment", () => {
  test("should match all paths starting with a forward slash and ending with '/info/refs'", () => {
    const Paths = [
      "/info/refs",
      "/info/refs/info/refs",
      "/test/info/refs",
      "/path/to/repo/info/refs",
      "/path/to/repo@tag/info/refs",
      "/path/to/another/repo/info/refs",
      "/git-core/info/refs",
    ];
    for (const path of Paths) {
      match(path, true);
    }
  });

  test("should not match anything else", () => {
    const Paths = [
      "info/refs",
      "info/refs/info/refs",
      "test/info/refs",
      "path/to/repo/info/refs",
      "path/to/repo@tag/info/refs",
      "path/to/another/repo/info/refs",
      "git-core/info/refs",

      "test",
      "path/to/repo",
      "path/to/repo@tag",
      "path/to/another/repo",
      "git-core",

      "/git-upload-pack",
      "/git-download-pack",
      "/git-sideload-pack",
    ];
    for (const path of Paths) {
      match(path, false);
    }
  });

  function match(path: string, result: boolean): void | never {
    expect(lib.Advertisement.test(path)).toBe(result);
  }
});

describe("RegExp DirectUse", () => {
  /**
   * Service names must be between 1 to 20 characters long.
   */
  test("should match all paths starting with a forward slash and ending with '/git-(?<service>{1,20})'", () => {
    const Paths = [
      "/git-service",
      "/git-core",
      "/git-upload-pack",
      "/git-download-pack",
      "/git-sideload-pack",
      "/path/to/repo/git-service",
      "/path/to/repo/git-core",
      "/path/to/repo/git-upload-pack",
      "/path/to/repo/git-download-pack",
      "/path/to/repo/git-sideload-pack",
      "/path/to/repo@tag/git-service",
      "/path/to/repo@tag/git-core",
      "/path/to/repo@tag/git-upload-pack",
      "/path/to/repo@tag/git-download-pack",
      "/path/to/repo@tag/git-sideload-pack",
    ];
    for (const path of Paths) {
      match(path, true);
    }
  });

  test("should not match anything else", () => {
    const Paths = [
      "git-service",
      "git-core",
      "git-upload-pack",
      "git-download-pack",
      "git-sideload-pack",
      "path/to/repo/git-service",
      "path/to/repo/git-core",
      "path/to/repo/git-upload-pack",
      "path/to/repo/git-download-pack",
      "path/to/repo/git-sideload-pack",
      "path/to/repo@tag/git-service",
      "path/to/repo@tag/git-core",
      "path/to/repo@tag/git-upload-pack",
      "path/to/repo@tag/git-download-pack",
      "path/to/repo@tag/git-sideload-pack",

      "/upload-pack",
      "/download-pack",
      "/sideload-pack",
      "/gituploadpack",
      "/gitupload-pack",
      "/git-",

      "test",
      "path/to/repo",
      "path/to/repo@tag",
      "path/to/another/repo",
      "git-core",

      "/info/refs",
    ];
    for (const path of Paths) {
      match(path, false);
    }
  });

  function match(path: string, result: boolean): void | never {
    expect(lib.DirectUse.test(path)).toBe(result);
  }
});

describe("RegExp ServiceName", () => {
  /**
   * Service names must be between 1 to 20 characters long.
   */
  test("should match all strings matching 'git-(?<service>{1,20})'", () => {
    const Paths = [
      "git-service",
      "git-core",
      "git-upload-pack",
      "git-download-pack",
      "git-sideload-pack",
    ];
    for (const path of Paths) {
      match(path, true);
    }
  });

  test("should not match anything else", () => {
    const Paths = [
      "/git-service",
      "/git-core",
      "/git-upload-pack",
      "/git-download-pack",
      "/git-sideload-pack",
      "/path/to/repo/git-service",
      "/path/to/repo/git-core",
      "/path/to/repo/git-upload-pack",
      "/path/to/repo/git-download-pack",
      "/path/to/repo/git-sideload-pack",
      "/path/to/repo@tag/git-service",
      "/path/to/repo@tag/git-core",
      "/path/to/repo@tag/git-upload-pack",
      "/path/to/repo@tag/git-download-pack",
      "/path/to/repo@tag/git-sideload-pack",
      "path/to/repo/git-service",
      "path/to/repo/git-core",
      "path/to/repo/git-upload-pack",
      "path/to/repo/git-download-pack",
      "path/to/repo/git-sideload-pack",
      "path/to/repo@tag/git-service",
      "path/to/repo@tag/git-core",
      "path/to/repo@tag/git-upload-pack",
      "path/to/repo@tag/git-download-pack",
      "path/to/repo@tag/git-sideload-pack",

      "/upload-pack",
      "/download-pack",
      "/sideload-pack",
      "/gituploadpack",
      "/gitupload-pack",
      "/git-",
      "git-",

      "test",
      "path/to/repo",
      "path/to/repo@tag",
      "path/to/another/repo",

      "/info/refs",
    ];
    for (const path of Paths) {
      match(path, false);
    }
  });

  function match(path: string, result: boolean): void | never {
    expect(lib.ServiceName.test(path)).toBe(result);
  }
});

describe("function inferValues()", () => {
  /**
   * Tests all valid and some invalid combinations of inputs (and outputs).
   */
  test("test valid and invalid combinations", () => {
    // Some paths to test with
    const Paths = [
      "",
      // Test double info/refs
      "info/refs",
      // And with search parameters
      "info/refs?",
      "info/refs?foo",
      "info/refs?bar=",

      // Some normal paths
      "path/to/repo",
      // With an @-symbol
      "path/to/repo@tag",
      // And with search parameters (again)
      "path/to/repo-with-search?",
      "path/to/repo-with-search?foo",
      "path/to/repo-with-search?bar=",

      // Tricky but valid paths
      "gitcore",
      "git-core",
      "gitsideload-pack",
      "gitreduce-pack",
      "gitdownload-pack",
      "git-sideloadpack",
      "git-reducepack",
      "git-downloadpack",
      "git-sideload-pack",
      "git-reduce-pack",
      "git-download-pack",
      "%SERVICE%",
      "git%SERVICE%",
      "git-%SERVICE%",
    ];
    for (const {content_type, input, inputPath, method, outputPath, service, url} of iterateIn(Paths)) {
      const methodIsGET = method === "GET" || method === "HEAD";
      const methodIsPOST = method === "POST";
      const urlContainsService = lib.ServiceName.test(url && url.searchParams.get("service") || "");
      const pathIsAdvertisement = lib.Advertisement.test(inputPath || "");
      const pathIsDirect = inputPath && lib.DirectUse.test(inputPath) && inputPath.endsWith(`/git-${service}`) || false;
      switch (true as boolean) {
        // Full match (with advertisement)
        case (
          methodIsGET &&
          pathIsAdvertisement &&
          urlContainsService
        ):
          // True if service is defined and in search
          match(input, [Boolean(service), outputPath, service]);
          break;
        // Full match (without advertisement)
        case (
          methodIsPOST &&
          service &&
          pathIsDirect &&
          content_type === `application/x-git-${service}-request`
        ):
          match(input, [false, outputPath, service]);
          break;
        // We can infer path, but not service
        case (pathIsAdvertisement || pathIsDirect):
          match(input, [false, outputPath]);
          break;
        default:
          match(input, [false, undefined, undefined]);
      }
    }
  });

  // Some endings to combine with path
  const Endings: ReadonlySet<string> = new Set([
    // Depends on path
    "",
    // Invalid
    "/",
    // Inferable
    "/info/refs",
    // Inferable
    "/info/refs?foo=bar",
    // Inferable
    "/info/refs?%SERVICE%",
    // Inferable
    "/info/refs?git%SERVICE%",
    // Inferable
    "/info/refs?git-%SERVICE%",
    // Inferable
    "/info/refs?service=%SERVICE%",
    // Inferable
    "/info/refs?service=git%SERVICE%",
    // Valid
    "/info/refs?service=git-%SERVICE%",
    // Inferable
    "/info/refs?service=%SERVICE%&foo=bar",
    // Inferable
    "/info/refs?service=git%SERVICE%&foo=bar",
    // Valid
    "/info/refs?service=git-%SERVICE%&foo=bar",
    // Inferable
    "/info/refs?foo=bar&service=%SERVICE%",
    // Inferable
    "/info/refs?foo=bar&service=git%SERVICE%",
    // Valid
    "/info/refs?foo=bar&service=git-%SERVICE%",
    // Invalid
    "/%SERVICE%",
    // Invalid
    "/git%SERVICE%",
    // Invalid
    "/gitcore",
    // Invalid
    "/gitsideload-pack",
    // Invalid
    "/gitreduce-pack",
    // Invalid
    "/gitdownload-pack",
    // Invalid
    "git-",
    // Inferable
    "git-a",
    // Inferable
    "git-b",
    // Inferable
    "/git-core",
    // Inferable
    "/git-sideloadpack",
    // Inferable
    "/git-reducepack",
    // Inferable
    "/git-downloadpack",
    // Inferable
    "/git-sideload-pack",
    // Inferable
    "/git-reduce-pack",
    // Inferable
    "/git-download-pack",
    // Valid
    "/git-%SERVICE%",
    // Valid
    "/git-%SERVICE%?",
    // Valid
    "/git-%SERVICE%?foo=bar",
    // Valid
    "/git-%SERVICE%?service=%SERVICE%",
  ]);

  const ContentTypes: ReadonlySet<string | undefined | null> = new Set([
    undefined,
    null,
    "",
    "*",
    "*/*",
    "text/html",
    "text/plain",
    "text/plain; charset=utf-8",
    "application/json",
    "application/javascript",
    "application/x-git-core-request",
    "application/x-git-service-request",
    "application/x-git-upload-pack-request",
    "application/x-git-receive-pack-request",
  ]);

  function * iterateIn(array: string[]): IterableIterator<{
    content_type?: string | undefined | null;
    input: ArgumentsType<typeof lib.inferValues>;
    inputPath?: string;
    method: string;
    outputPath: string;
    path: string;
    service?: Service;
    url?: URL;
  }> {
    // Test with and without a leading forward slash (/)
    array = array.reduce<string[]>((p, c) => p.push(c, `/${c}`) && p || p, []);
    // Track paths, to hinder multiple iterations over same path.
    const TakenPaths = new Set<string>();
    for (const method of lib.AllowedMethods) {
      for (const service of Object.values({ a: undefined, ...Service})) {
        if (checkEnum(service, Service) || service === undefined) {
          for (let ending of Endings) {
            // Fill service or skip ending path
            if (ending.match("%SERVICE%")) {
              if (service) {
                ending = ending.replace("%SERVICE%", service);
              }
              else {
                continue;
              }
            }
            // Emurate all base paths
            for (let basePath of array) {
              // Fill service or skip base path
              if (basePath.match("%SERVICE%")) {
                if (service) {
                  basePath = basePath.replace("%SERVICE%", service);
                }
                else {
                  continue;
                }
              }
              const path = basePath + ending;
              // Check path.
              if (TakenPaths.has(path)) {
                continue;
              }
              TakenPaths.add(path);
              // Extract resulting path from basePath to test against result of function.
              const outputPath = basePath.match(/^\/?(?<path>[^\?#]*)(?:\?|#|$)/)!.groups!.path;
              let url: URL | undefined;
              try { url = new URL(path, "https://127.0.0.1"); } catch { /**/ }
              const inputPath = url && url.pathname;
              for (const content_type of ContentTypes) {
                yield {
                  content_type,
                  input: [path, method, content_type],
                  inputPath,
                  method,
                  outputPath,
                  path,
                  service,
                  url,
                };
              }
            }
          }
        }
      }
    }
  }

  function match(args: ArgumentsType<typeof lib.inferValues>, expectedResults: ReturnType<typeof lib.inferValues>): any {
    expect(args.length).toBeGreaterThanOrEqual(2);
    expect(expectedResults.length).toBeGreaterThanOrEqual(1);
    const value = lib.inferValues(...args);
    expect(value.length).toBeGreaterThanOrEqual(1);
    // Always test the 3 values
    const length = Math.max(value.length, expectedResults.length);
    for (let index = 0; index > length; index += 1) {
      expect(value[index]).toBe(expectedResults[index]);
    }
  }
});

describe("function createReadable()", () => {
  test("should throw if first argument does not contain Symbol.asyncIterable", () => {
    expect(() => lib.createReadable(undefined as any)).toThrow();
    expect(() => lib.createReadable(null as any)).toThrow();
    expect(() => lib.createReadable({} as any)).toThrow();
  });
  test("should convert an async iterable to a readable stream", () => {
    expect(() => {
      const readable = lib.createReadable({ async *[Symbol.asyncIterator]() { return; } });
      expect(readable).toBeInstanceOf(Readable);
    }).not.toThrow();
    expect(() => {
      async function *gen(): AsyncIterableIterator<Uint8Array> { return; }
      const readable = lib.createReadable(gen());
      expect(readable).toBeInstanceOf(Readable);
    }).not.toThrow();
  });

  test("should iterate all values provided by iterator", async() => {
    const array = new Uint8Array([48, 48, 48, 48]);
    async function *generator(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([48, 48, 48, 48]); }
    const readable = lib.createReadable(generator());
    let count = 0;
    await new Promise((resolve, reject) => {
        const writable = new Writable({
          write(buffer: Buffer) {
            count += 1;
            expect(new Uint8Array(buffer.buffer)).toEqual(array);
          },
          decodeStrings: false,
        });
        readable.on("error", reject).on("end", resolve).pipe(writable);
    });
    expect(count).toBe(1);
  });
});

describe("function createAsyncIterator()", () => {
  test("should return an async iterable iterator", () => {
    const it = lib.createAsyncIterator(undefined);
    expect(Symbol.asyncIterator in it).toBe(true);
    expect(it).toBe(it[Symbol.asyncIterator]());
  });

  test("should work for `undefined` and `null`", async () =>  Promise.all<any>([
    expect(iterateValues([undefined], () => { throw new Error("Should not throw here."); })).resolves.toBeUndefined(),
    expect(iterateValues([null], () => { throw new Error("Should not throw here."); })).resolves.toBeUndefined(),
  ]));

  test("should work for `Uint8Array` and promise-likes leading to `Uint8Array`", async() => Promise.all<any>([
    expect(iterateValues(
      [new Uint8Array([49, 50, 51])],
      (a) => expect(a).toEqual(new Uint8Array([49, 50, 51])),
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [new Promise((resolve) => resolve(new Uint8Array([52, 53, 54])))],
      (a) => expect(a).toEqual(new Uint8Array([52, 53, 54])),
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [{ async then(resolve, reject) { return Promise.resolve(new Uint8Array([55, 56, 57])).then(resolve, reject); } }],
      (a) => expect(a).toEqual(new Uint8Array([55, 56, 57])),
    )).resolves.toBeUndefined(),
  ]));

  test("should work for `Iterable<Uint8Array>`, `IterableIterator<Uint8Array>``", async() => {
    function *gen(): IterableIterator<Uint8Array> { yield new Uint8Array([61, 62, 63]); }
    return Promise.all<any>([
      expect(iterateValues(
        [{ *[Symbol.iterator]() { yield new Uint8Array([58, 59, 60]); } }],
        (a) => expect(a).toEqual(new Uint8Array([58, 59, 60])),
      )).resolves.toBeUndefined(),
      expect(iterateValues(
        [gen()],
        (a) => expect(a).toEqual(new Uint8Array([61, 62, 63])),
      )).resolves.toBeUndefined(),
    ]);
  });

  test("should work for `AsyncIterable<Uint8Array>`, `AsyncIterableIterator<Uint8Array>``", async() => {
    async function *gen(): AsyncIterableIterator<Uint8Array> { yield new Uint8Array([61, 62, 63]); }
    return Promise.all<any>([
      expect(iterateValues(
        [{ async *[Symbol.asyncIterator]() { yield new Uint8Array([58, 59, 60]); } }],
        (a) => expect(a).toEqual(new Uint8Array([58, 59, 60])),
      )).resolves.toBeUndefined(),
      expect(iterateValues(
        [gen()],
        (a) => expect(a).toEqual(new Uint8Array([61, 62, 63])),
      )).resolves.toBeUndefined(),
    ]);
  });

  test("should not work on primitive values", async () => Promise.all<any>([
    expect(iterateValues(
      ["" as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      ["a string" as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [0 as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [1 as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [false as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
    expect(iterateValues(
      [true as any],
      () => { throw new Error("Should not throw here"); },
    )).resolves.toBeUndefined(),
  ]));

  type AsyncIterableIteratorType<T extends (...args: any[]) => AsyncIterableIterator<any>> =
    T extends (...args: any[]) => AsyncIterableIterator<infer R> ? R : any;

  async function iterateValues(
    args: ArgumentsType<typeof lib.createAsyncIterator>,
    fn: (value: AsyncIterableIteratorType<typeof lib.createAsyncIterator>) => any,
  ): Promise<void | never> {
    for await(const _ of lib.createAsyncIterator(...args)) {
      fn(_);
    }
  }
});

describe("function addHeaderToIterable()", () => {
  test("should throw if first argument is not a value from enum Service", () => {
    expect(() => lib.addHeaderToIterable(undefined as any, undefined as any)).toThrow();
  });

  test("should throw if second argument does not contain Symbol.asyncIterator", () => {
    expect(() => lib.addHeaderToIterable(Service.UploadPack, undefined as any)).toThrow();
  });
});