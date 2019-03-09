import { Headers } from "node-fetch";
import { Readable } from "stream";
import { URL } from "url";
import { Body, Capabilities, CommandReceivePack, Commands, CommandUploadPack } from "./context";
import { Service } from "./enum";
import { checkEnum } from "./enum.private";
import { decodeString, encodeString } from "./packet-util";

export const SymbolPromise = Symbol("promise");

export const AllowedMethods: ReadonlySet<string> = new Set(["GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]);

export function checkMethod(method: string): method is "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT" {
  return AllowedMethods.has(method);
}

export const Advertisement = /^\/(?:(?<path>.+)\/)?info\/refs$/;
export const DirectUse = /^\/(?:(?<path>.+)\/)?git-(?<service>\b[a-z\-]{1,20}\b)$/;
export const ServiceName = /^git-(?<service>\b[a-z\-]{1,20}\b)$/;

/**
 * Infer {@link Request.advertisement | advertisement},
 * {@link Request.path | path} and {@link Request.service | service} from
 * `urlPath`, `method`, and `content_type`.
 *
 * @privateRemarks
 *
 * Returns a tuplet with one to three values for copmatibility with
 * deconstructing rest argument from constructor in {@link Context}.
 *
 * @param urlPath - The trailing part after the url origin, including the leading
 *                  forward slash (/).
 * @param method - HTTP verb. (e.g. "GET" or "POST")
 * @param content_type - Content of "Content-Type" header, if present.
 * @returns a tuplet with up to three values.
 */
export function inferValues(
  urlPath: string,
  method: string,
  content_type?: string | undefined | null,
): [boolean, string?, Service?] {
  let url: URL;
  // Bail on malformed url path (but don't throw)
  try {
    url = new URL(urlPath, "https://127.0.0.1/");
  } catch {
    return [false];
  }
  // Get advertisement from a service
  let results = Advertisement.exec(url.pathname);
  if (results) {
    const {path} = results.groups!;
    if (method === "GET" || method === "HEAD") {
      let service: unknown;
      results = ServiceName.exec(url.searchParams.get("service") || "");
      if (results) {
        service = results.groups!.service;
      }
      if (checkEnum(service, Service)) {
        return [true, path, service];
      }
    }
    return [false, path];
  }
  // Use a service directly
  results = DirectUse.exec(url.pathname);
  if (results) {
    const {path, service} = results.groups!;
    if (method === "POST" && checkEnum(service, Service) && content_type === `application/x-git-${service}-request`) {
      return [false, path, service];
    }
    return [false, path];
  }
  return [false];
}

export function createHeaders(incomingHeaders?: Record<string, string> | Headers | undefined | null): Headers {
  if (incomingHeaders instanceof Headers) {
    return incomingHeaders;
  }
  return new Headers(incomingHeaders || undefined);
}

/**
 * Creates a new {@link stream#Readable | readable} from `iterable`.
 *
 * @param iterable - Async iterable to transform.
 */
export function createReadable(iterable: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>): Readable {
  if (!(typeof iterable === "object" && Symbol.asyncIterator in iterable)) {
    throw new TypeError("argument `iterable` does not contain Symbol.asyncIterable");
  }
  const it = iterable[Symbol.asyncIterator]();
  return new Readable({
    async read() {
      const {value, done} = await it.next();
      if (value) {
        this.push(value);
      }
      if (done) {
        this.push(null);
      }
    },
  });
}

const SymbolChecked = Symbol("checked");

/**
 * Mark object with an unique symbol.
 *
 * @param obj - Object to mark.
 */
export function markObject(obj: object): void {
  obj[SymbolChecked] = undefined;
}

/**
 * Check object for mark from {@link markObject}.
 *
 * @param obj - Object to check.
 */
export function checkObject(obj: object): boolean {
  return SymbolChecked in obj;
}

/**
 * Create an empty async iterable iterator.
 */
export async function *createEmptyAsyncIterator(): AsyncIterableIterator<Uint8Array> { return; }

/**
 * Create an async iterable iterator for {@link Body | `body`}.
 *
 * @privateRemarks
 *
 * We only allow body to be of type "object" or "function" if defined.
 *
 * @param body - {@link Body} to convert.
 */
export function createAsyncIterator(body: Body): AsyncIterableIterator<Uint8Array> {
  const type = typeof body;
  const typeObjOrFct = (type === "object" || type === "function");
  if (body && typeObjOrFct) {
    if (body instanceof Uint8Array || "then" in body) {
      return (async function*(): AsyncIterableIterator<Uint8Array> { yield body; })();
    }
    else if (Symbol.asyncIterator in body && body === body[Symbol.asyncIterator]()) {
      return body as AsyncIterableIterator<Uint8Array>;
    }
    else if (Symbol.iterator in body || Symbol.asyncIterator in body) {
      return (async function*(): AsyncIterableIterator<Uint8Array> { yield* body; })();
    }
  }
  return createEmptyAsyncIterator();
}

/**
 * Add `header` to `iterable`, but only if not present.
 *
 * @privateRemarks
 *
 * **Always** add header unless already present.
 *
 * @param header - Header to check for and add.
 * @param iterable - Iterable to check.
 */
export function addHeaderToIterable(
  service: Service,
  iterable: AsyncIterableIterator<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  const header = ServiceHeaders[service];
  if (!header) {
    throw new TypeError("argument `service` must be a value from enum Service");
  }
  if (!(iterable && Symbol.asyncIterator in iterable)) {
    throw new TypeError("argument `iterable` does not contain Symbol.asyncIterable");
  }
  return it();

  async function *it(): AsyncIterableIterator<Uint8Array> {
    const result = await iterable.next();
    if (result.value) {
      if (!bufferEquals(header, result.value.slice(0, header.length))) {
        yield header;
      }
      yield result.value;
    }
    if (!result.done) {
      yield* iterable;
    }
  }
}

export async function *addMessagesToIterable(
  messages: Iterable<Uint8Array> | IterableIterator<Uint8Array>,
  iterable: AsyncIterableIterator<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  yield* messages;
  yield* iterable;
}

// http://codahale.com/a-lesson-in-timing-attacks/
function bufferEquals(buf1: Uint8Array, buf2: Uint8Array): boolean {
  if (buf1.length !== buf2.length) {
    return false;
  }
  let result = 0;
  // Don't short circuit
  for (let i = 0; i < buf1.byteLength; i += 1) {
    result |= buf1[i] ^ buf2[i]; // tslint:disable-line:no-bitwise
  }
  return result === 0;
}

/**
 * Advertisement Headers for response
 */
export const ServiceHeaders: Record<Service, Uint8Array> = {
  [Service.ReceivePack]: encodeString("001f# service=git-receive-pack\n0000"),
  [Service.UploadPack]: encodeString("001e# service=git-upload-pack\n0000"),
};

export function pushMetadata(
  commands: Commands,
  capabilities: Capabilities,
  result: string,
  metadata: CommandReceivePack | CommandUploadPack,
) {
  commands.push(metadata);
  if (result) {
    for (const c of result.trim().split(" ")) {
      if (/=/.test(c)) {
        const [k, v] = c.split("=");
        capabilities.set(k, v);
      }
      else {
        capabilities.set(c, undefined);
      }
    }
  }
}

/**
 * Maps {@link Service} to a valid packet reader for
 * {@link Request.body | request body}.
 */
export const ServiceReaders: Record<Service, (...arg: [Capabilities, Commands]) => (b: Uint8Array) => any> = {
  [Service.ReceivePack]: (capabilities: Capabilities, commands: Commands) => {
    const pre_check = /[\da-f]{40} [\da-f]{40}/;
    const regex =
      /^[\da-f]{4}(?<c4t1>[\da-f]{40}) (?<c4t2>[\da-f]{40}) (?<r7e>refs\/[^\n\0 ]*?)(?<c10s>(?: [a-z\d_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
    return (buffer) => {
      if (pre_check.test(decodeString(buffer.slice(4, 85)))) {
        const value = decodeString(buffer);
        const results = regex.exec(value);
        if (results) {
          // c4t1 -> commit 1, c4t2 -> commit 2, c10s -> capabilities, r7e -> reference
          const { c4t1, c4t2, c10s, r7e } = results.groups!;
          let kind: "create" | "delete" | "update";
          if (results[1] === "0000000000000000000000000000000000000000") {
            kind = "create";
          }
          else if (results[2] === "0000000000000000000000000000000000000000") {
            kind = "delete";
          }
          else {
            kind = "update";
          }
          pushMetadata(commands, capabilities, c10s, {
            commits: [c4t1, c4t2],
            kind,
            reference: r7e,
          });
        }
      }
    };
  },
  [Service.UploadPack]: (capabilities, commands) => {
    const pre_check = /want|have/;
    const regex = /^[\da-f]{4}(?<k2d>want|have) (?<c4t>[\da-f]{40})(?<c10s>(?: [a-z\d_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
    return (buffer) => {
      if (pre_check.test(decodeString(buffer.slice(4, 8)))) {
        const value = decodeString(buffer);
        const results = regex.exec(value);
        if (results) {
          // c4t -> commit, c10s -> capabilities, k2d -> kind
          const { c4t, c10s, k2d } = results.groups!;
          pushMetadata(commands, capabilities, c10s, {
            commits: [c4t],
            kind: k2d as "want" | "have",
          });
        }
      }
    };
  },
};
