import { Readable } from "stream";
import { URL } from "url";
import { Body } from "./context";
import { Service } from "./enum";
import { encodeString } from "./packet-util";

/**
 * Infer {@link Request.advertisement | advertisement},
 * {@link Request.path | path} and {@link Request.service | service} from
 * `urlPath`, `method`, and `content_type`.
 *
 * @param urlPath - The trailing part after the url origin, including the leading
 *                  forward slash (/).
 * @param method - HTTP verb.
 * @param content_type - Content of "Content-Type" header, if present.
 */
export function inferValues(
  urlPath: string,
  method: string,
  content_type?: string | undefined | null,
): [boolean, string?, Service?] {
  const url = new URL(urlPath, "https://127.0.0.1/");
  // Get advertisement from service
  let results: RegExpExecArray | null = /^\/?(.*?)\/info\/refs$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    if (!(method === "GET" || method === "HEAD") || !url.searchParams.has("service")) {
      return [true, path];
    }
    const serviceName = url.searchParams.get("service")!;
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [true, path];
    }
    return [true, path, results[1] as Service];
  }
  // Use service directly
  results = /^\/?(.*?)\/(git-[\w\-]+\w)$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    const serviceName = results[2];
    if (method !== "POST" || !content_type) {
      return [false, path];
    }
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [false, path];
    }
    const service = results[1];
    if (content_type !== `application/x-git-${service}-request`) {
      return [false, path];
    }
    return [false, path, service as Service];
  }
  return [false];
}

/**
 * Creates a new {@link stream#Readable | readable} from `iterable`.
 *
 * @param iterable - Async iterable to transform.
 */
export function createReadable(iterable?: AsyncIterableIterator<Uint8Array>): Readable {
  if (iterable && Symbol.asyncIterator in iterable) {
    const it: AsyncIterableIterator<Uint8Array> = iterable[Symbol.asyncIterator]();
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
  return new Readable({ read() { this.push(null); } });
}

/**
 * Create an async iterable for `body`.
 *
 * @param body - {@link Body} to convert.
 */
export async function *createAsyncIterator(body: Body): AsyncIterableIterator<Uint8Array> {
  if (body) {
    if (body instanceof Uint8Array || "then" in body) {
      yield body;
    }
    else if (Symbol.asyncIterator in body || Symbol.iterator in body) {
      yield* body;
    }
  }
}

/**
 * Add `header` to `iterable`, but only if not present.
 *
 * @param header - Header to check for and add.
 * @param iterable - Iterable to check.
 */
export async function *addHeaderToIterable(
  service: Service,
  iterable: AsyncIterableIterator<Uint8Array>,
): AsyncIterableIterator<Uint8Array> {
  const header = Headers[service];
  const result = await iterable.next();
  if (!result.done) {
    if (result.value && !bufferEquals(result.value.slice(0, header.length))) {
      yield header;
    }
    yield* iterable;
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
function bufferEquals(buf1?: Uint8Array, buf2?: Uint8Array): boolean {
  if (buf1 === undefined && buf2 === undefined) {
    return true;
  }
  if (buf1 === undefined || buf2 === undefined) {
    return false;
  }
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
const Headers: Record<Service, Uint8Array> = {
  [Service.ReceivePack]: encodeString("001f# service=git-receive-pack\n0000"),
  [Service.UploadPack]: encodeString("001e# service=git-upload-pack\n0000"),
};
