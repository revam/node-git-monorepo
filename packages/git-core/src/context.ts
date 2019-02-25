import { Headers } from "node-fetch";
import { Readable } from "stream";
import { URL } from "url";
import { TextDecoder } from "util";
import { Service, Status } from "./enums";
import { concatBuffers, createPacketIterator, encodePacket, encodeString, PacketType, readPacketLength } from "./packet-utils";

const SymbolPromise = Symbol("promise");

const AllowedMethods = new Set(["GET", "HEAD", "PATCH", "POST", "PUT"]);

/**
 * @public
 */
export class Context {
  //#region constructor

  public constructor();
  public constructor(
    url: string,
  );
  public constructor(
    url: string,
    method: string,
  );
  public constructor(
    url: string,
    method: string,
    body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>,
  );
  public constructor(
    url: string,
    method: string,
    body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>,
    headers: Headers | Record<string, string>,
  );
  public constructor(
    url: string,
    method: string,
    body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>,
    headers: Headers | Record<string, string>,
    advertisement: boolean,
    path?: string,
    service?: Service,
  );
  public constructor(
    url?: string,
    method?: string,
    body?: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>,
    headers?: Headers | Record<string, string>,
    advertisement?: boolean,
    path?: string,
    service?: Service,
  );
  public constructor(...rest: [
    string?,
    string?,
    (AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>)?,
    (Headers | Record<string, string>)?,
    boolean?,
    string?,
    Service?
  ]) {
    // tslint:disable:cyclomatic-complexity
    // url and method must be provided at the same time.
    const url = rest.length >= 1 ? rest[0] : "/";
    if (typeof url !== "string") {
      throw new TypeError("argument `url` must be of type 'string'.");
    }
    if (!url.length || url[0] !== "/") {
      throw new TypeError("argument `url` must start with '/'.");
    }
    const method = rest.length >= 2 ? (rest[1] && rest[1].trim().toUpperCase()) : "GET";
    if (!(typeof method === "string" && AllowedMethods.has(method))) {
      throw new TypeError(`argument \`method\` must be one of the following HTTP verbs: '${Array.from(AllowedMethods).join("', '")}'`);
    }
    let body = rest.length >= 3 ? asyncIterator(rest[2]) : emptyIterable();
    if (rest.length >= 4 && (rest[3] === null || typeof rest[3] !== "object")) {
      throw new TypeError("argument `headers` must be of type 'object'.");
    }
    const headers = new Headers(rest[3]);
    let advertisement = rest.length >= 5 ? rest[4] : false;
    if (typeof advertisement !== "boolean") {
      throw new TypeError("argument `advertisement`must be of type 'boolean'.");
    }
    let path = rest.length >= 6 ? rest[5] : undefined;
    if (!(path === undefined || typeof path === "string")) {
      throw new TypeError("argument `path` must be undefined or of type 'string'.");
    }
    let service = rest.length >= 7 ? rest[6] : undefined;
    if (!(service === undefined || typeof service === "string" && checkEnum(service, Service))) {
      throw new TypeError("argument `service` must be a value from enum Service.");
    }
    // Advertisement, path and service is inferred if none of them is supplied.
    if (rest.length < 5) {
      [advertisement, path, service] = mapInputToRequest(url, method, headers.get("Content-Type"));
    }
    // Read and analyse packets if we have a valid service and requester does **not** want advertisement.
    if (service && !advertisement) {
      const middleware = ServiceReaders.get(service)!;
      body = readPackets(body, middleware(this.__capabilities, this.__commands));
      this[SymbolPromise] = body.next().then(() => undefined);
    }
    // Add request and response objects.
    this.request = {
      advertisement,
      body,
      headers,
      method: method as "GET" | "HEAD" | "PATCH" | "POST" | "PUT",
      path,
      service,
      url,
      toReadable() {
        return bodyToReadable(this.body);
      },
    };
    this.response = {
      body: undefined,
      headers: new Headers(),
      status: 200,
    };
    // tslint:enable:cyclomatic-complexity
  }

  //#endregion constructor
  //#region own properties and methods

  /**
   * Request object.
   */
  public readonly request: Request;
  /**
   * Response object.
   */
  public readonly response: Response;

  /**
   * Current status of request.
   *
   * @remarks
   *
   * Can only be set through {@link (Context:class).updateStatus}.
   */
  public get status(): Status {
    return this.__status;
  }

  /**
   * Check if request is still pending.
   */
  public get isPending(): boolean {
    return this.__status === Status.Pending;
  }

  /**
   * Current
   */
  private __status: Status = Status.Pending;

  /**
   * Update {@link (Context:class).status | status} of request.
   *
   * @remarks
   *
   * We can only promote status once, except for failures, which can only be
   * set after request was accepted.
   */
  public updateStatus(status: Status): void {
    // We can only update promote status once,
    if (this.__status === Status.Pending) {
      this.__status = status;
    }
    // except for failures, which can only be set after `Status.Accepted`.
    else if (this.__status === Status.Accepted && status === Status.Failure) {
      this.__status = Status.Failure;
    }
  }

  /**
   * Application defined properties for request.
   *
   * @remarks
   *
   * Up to application on how to use this object, the only restriction set is it
   * must be an object.
   */
  public state: Record<PropertyKey, any> = {};

  /**
   * Resolves when request has been analysed.
   *
   * @remarks
   *
   * Is set to `undefined` when promise resolves, and is only present when not
   * advertising.
   *
   * @internal
   */
  private [SymbolPromise]?: Promise<void> | undefined;

  /**
   * Check if request body has been analysed and is ready for use.
   */
  public get isReady(): boolean {
    return !(SymbolPromise in this);
  }

  /**
   * Resolves when request has been analysed.
   */
  public async initialise(): Promise<void> {
    return this[SymbolPromise];
  }

  /**
   * Get header from {@link Request.headers | request headers}.
   *
   * @param headerName - Case-insensitive name of header to retrive.
   */
  public get(headerName: string): string | undefined {
    return this.request.headers.get(headerName) || undefined;
  }

  /**
   * Set header in {@link Response.headers | response headers}.
   *
   * @param headerName - Case-insensitive name of header to set.
   * @param value - New value of field.
   */
  public set(headerName: string, value?: number | string | string[]): void;
  /**
   * Set multiple values for header in {@link Response.headers | response headers}.
   *
   * @param headerName - Case-insensitive name of header to set.
   * @param values - Values to append to field.
   */
  public set(headerName: string, ...values: [string, string, ...string[]]): void;
  public set(headerName: string, ...values: [(number | string | string[])?, ...string[]] | string[]): void {
    if (values[0] instanceof Array) {
      values = values[0];
    }
    if (values.length === 1) {
      this.response.headers.set(headerName, values[0] as string);
    }
    else {
      for (const value of values) {
        this.response.headers.append(headerName, value as string);
      }
    }
  }

  /**
   * Raw capabilities for git retrived from request body.
   */
  private readonly __capabilities: Capabilities = new Map();

  /**
   * Capabilities read from {@link Request.body}.
   *
   * @remarks
   *
   * Will only be filled when request is not asking for advertisement.
   */
  public async capabilities(): Promise<Capabilities> {
    if (!this.isReady) {
      await this.initialise();
    }
    return new Map(this.__capabilities);
  }

  /**
   * Raw commands for git retrived from request body.
   */
  private readonly __commands: Commands = [];
  /**
   * Commands retrived from {@link Request.body}.
   *
   * @remarks
   *
   * Will only be filled when request is not asking for advertisement.
   */
  public async commands(): Promise<ReadonlyCommands> {
    if (!this.isReady) {
      await this.initialise();
    }
    return this.__commands.slice();
  }

  /**
   * String messages from application to requester.
   */
  private readonly __messages: Array<[PacketType, string]> = [];

  /**
   * Adds `message` to messages for {@link Response.body | response body}.
   *
   * @param message - Message to add.
   */
  public addMessage(message: string): void {
    this.__messages.push([PacketType.Message, message]);
  }

  /**
   * Adds `errorMessage` to messages for {@link Response.body | response body}.
   *
   * @param errorMessage - Error message to add.
   */
  public addError(errorMessage: string): void {
    this.__messages.push([PacketType.Error, errorMessage]);
  }

  /**
   * Create an new async iterable for {@link Response.body | response body}.
   *
   * @remarks
   *
   * Any messages added with {@link Context.addMessage} and/or errors added with
   * {@link Context.addError} will be included in the resulting iterator.
   *
   * Also takes care of patching the header for advertisement.
   *
   * @privateRemarks
   *
   * Messages must be consumed if used, so multiple uses don't have the multiple
   * instances(?) of the same message.
   */
  public toAsyncIterator(): AsyncIterableIterator<Uint8Array> {
    let body = bodyToAsyncIterator(this.response.body);
    // Check if body and service is truthy
    if (this.response.body && this.request.service && this.type) {
      // Add header or messages if content type is the expected type.
      const content_type = `application/x-git-${this.service}-${this.advertisement ? "advertisement" : "result"}`;
      if (this.type === content_type) {
        // Add header if none found
        if (this.advertisement) {
          body = addHeader(AdHeaders[this.request.service], body);
        }
        // Add messages
        else if (this.__messages.length) {
          // Consume messages
          const packedMessages = this.__messages.map(([t, m]) => encodePacket(t, m));
          this.__messages.length = 0;
          body = addMessages(packedMessages, body);
        }
      }
      // Or add messages if type is "text/plain".
      else if (/^text\/plain(;|$)/.test(this.type) && this.__messages.length) {
        // Consume messages
        const messages = this.__messages.map(([t, m]) => `${t === PacketType.Message ? "Error" : "Message"}: ${m}\n`).map(encodeString);
        this.__messages.length = 0;
        body = addMessages(messages, body);
      }
    }
    // Set body
    return this.response.body = body;
  }

  /**
   * Create a {@link stream#Readable | readable} for {@link Response.body | response body}.
   */
  public toReadable(): Readable {
    return bodyToReadable(this.toAsyncIterator());
  }

  //#endregion own properties and methods
  //#region request delegation

  /**
   * {@inheritdoc Request.advertisement}
   */
  public get advertisement(): boolean {
    return this.request.advertisement;
  }

  /**
   * {@inheritdoc Request.service}
   */
  public get service(): Service | undefined {
    return this.request.service;
  }

  /**
   * {@inheritdoc Request.path}
   */
  public get path(): string | undefined {
    return this.request.path;
  }
  public set path(value: string | undefined) {
    this.request.path = value;
  }

  /**
   * {@inheritdoc Request.url}
   */
  public get url(): string {
    return this.request.url;
  }

  //#endregion request delegation
  //#region response delegation

  /**
   * {@inheritdoc Response.status}
   */
  public get statusCode(): number {
    return this.response.status;
  }
  public set statusCode(value: number) {
    this.response.status = value;
  }

  public get body(): Body {
    return this.response.body;
  }
  public set body(value: Body) {
    this.response.body = value;
  }

  public get type(): string | undefined {
    return this.response.headers.get("Content-Type") || undefined;
  }
  public set type(value: string | undefined) {
    if (value) {
      this.response.headers.set("Content-Type", value);
    }
    else {
      this.response.headers.delete("Content-Type");
    }
  }

  public get length(): number {
    const value = this.response.headers.get("Content-Length");
    if (value) {
      return Number.parseInt(value, 10);
    }
    return 0;
  }
  public set length(value: number) {
    this.response.headers.set("Content-Length", value.toString(10));
  }

  //#endregion response delegation
}

/**
 * @public
 */
export type Capabilities = Map<string, string | undefined>;

/**
 * Contains information of what client want to upload in a receive-pack request.
 *
 * @public
 */
export interface CommandReceivePack {
  /**
   * Receive-pack command type.
   */
  kind: "create" | "update" | "delete";
  /**
   * First child is old commit sha-hash, second is new commit sha-hash.
   */
  commits: [string, string];
  /**
   * Reference path. Can be any segmented path, but usually starting with either
   * "heads" or "tags".
   */
  reference: string;
}

/**
 * Contains information of what client want to retrive from this upload-pack
 * service request.
 *
 * @public
 */
export interface CommandUploadPack {
  /**
   * Upload-pack command type.
   */
  kind: "want" | "have";
  /**
   * Commit. In plural form for compatibility with IRequestPushData.
   */
  commits: [string];
}

/**
 * @public
 */
export type Commands = Array<CommandReceivePack | CommandUploadPack>;

/**
 * @public
 */
export type ReadonlyCommands = ReadonlyArray<Readonly<CommandReceivePack | CommandUploadPack>>;

/**
 * @public
 */
export type Body =
| Uint8Array
| Promise<Uint8Array>
| PromiseLike<Uint8Array>
| IterableIterator<Uint8Array>
| AsyncIterableIterator<Uint8Array>
| undefined
| null
;

/**
 * @public
 */
export interface Request {
  /**
   * Requester want advertisement for service, and not the service itself.
   */
  readonly advertisement: boolean;
  /**
   * Request body.
   */
  readonly body: AsyncIterableIterator<Uint8Array>;
  /**
   * Request body as a readable stream.
   */
  toReadable(): Readable;
  /**
   * Headers.
   */
  readonly headers: Headers;
  /**
   * HTTP method used.
   */
  readonly method: "GET" | "HEAD" | "PATCH" | "POST" | "PUT";
  /**
   * Requested resource path.
   *
   * @remarks
   *
   * If constructor is unable to get path, from either the `url` or `path`
   * argument provided, then this path is set to undefined.
   */
  path?: string;
  readonly service?: Service;
  readonly url: string;
}

/**
 * @public
 */
export interface Response {
  body: Body;
  headers: Headers;
  status: number;
}

/**
 * Check if `value` is part of `enumConst`.
 *
 * @param value - Value to check.
 * @param enumConst - Enumerable object.
 */
function checkEnum<TEnum extends Record<string, any>>(value: string | number, enumConst: TEnum): value is TEnum[keyof TEnum] {
  for (const v of Object.values(enumConst)) {
    if (value === v) {
      return true;
    }
  }
  return false;
}

async function *emptyIterable(): AsyncIterableIterator<Uint8Array> { return; }

function asyncIterator<T>(iterable?: AsyncIterable<T> | AsyncIterableIterator<T>): AsyncIterableIterator<T> {
  if (!(iterable && Symbol.asyncIterator in iterable)) {
    throw new TypeError("argument `iterable` must be an async iterable.");
  }
  return iterable[Symbol.asyncIterator]() as AsyncIterableIterator<T>;
}

async function *readPackets(
  read: AsyncIterableIterator<Uint8Array>,
  fn: (buffer: Uint8Array) => any,
): AsyncIterableIterator<Uint8Array> {
  //#region init
  const backhaul: Uint8Array[] = [];
  let buffer: Uint8Array | undefined;
  let done = false;
  do {
    const r = await read.next();
    if (r.done) {
      break;
    }
    if (buffer) {
      r.value = concatBuffers([buffer, r.value]);
      buffer = undefined;
    }
    done = r.done;
    const iterator = createPacketIterator(r.value, true, true);
    let result: IteratorResult<Uint8Array>;
    do {
      result = iterator.next();
      if (result.value) {
        if (result.done) {
          const length = readPacketLength(result.value);
          if (length === 0) {
            done = true;
          } else {
            buffer = result.value;
          }
        } else {
          await fn(result.value);
        }
      }
    } while (!done);
    backhaul.push(r.value);
  } while (buffer);
  yield new Uint8Array(0);
  //#endregion init
  yield* backhaul;
  if (!done) {
    yield* read;
  }
}
/**
 * Maps vital request properties to vital service properties.
 * @param fragment Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 * @internal
 */
function mapInputToRequest(
  fragment: string,
  method: string,
  content_type?: string | undefined | null,
): [boolean, string?, Service?] {
  const url = new URL(fragment, "https://127.0.0.1/");
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

function reader(
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

const DECODER = new TextDecoder("utf8", { fatal: true, ignoreBOM: true });

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const ServiceReaders = new Map<Service, (...args: [Capabilities, Commands]) => (b: Uint8Array) => any>([
  [
    Service.ReceivePack,
    (capabilities, commands) => {
      const pre_check = /[0-9a-f]{40} [0-9a-f]{40}/;
      const regex =
        /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
      return (buffer) => {
        if (pre_check.test(DECODER.decode(buffer.slice(4, 85)))) {
          const value = DECODER.decode(buffer);
          const results = regex.exec(value);
          if (results) {
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
            reader(commands, capabilities, results[4], {
              commits: [results[1], results[2]],
              kind,
              reference: results[3],
            });
          }
        }
      };
    },
  ],
  [
    Service.UploadPack,
    (capabilities, commands) => {
      const pre_check = /want|have/;
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
      return (buffer) => {
        if (pre_check.test(DECODER.decode(buffer.slice(4, 8)))) {
          const value = DECODER.decode(buffer);
          const results = regex.exec(value);
          if (results) {
            reader(commands, capabilities, results[3], {
              commits: [results[2]],
              kind: results[1] as ("want" | "have"),
            });
          }
        }
      };
    },
  ],
]);

function bodyToReadable(iterable?: AsyncIterableIterator<Uint8Array>): Readable {
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

async function *bodyToAsyncIterator(body: Body): AsyncIterableIterator<Uint8Array> {
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
 * Add `header` to response if not found.
 *
 * @param header - Header to check for and add.
 * @param iterable - Iterable to check.
 */
async function *addHeader(header: Uint8Array, iterable: AsyncIterableIterator<Uint8Array>): AsyncIterableIterator<Uint8Array> {
  const result = await iterable.next();
  if (!result.done && result.value) {
    if (!bufferEquals(result.value.slice(0, header.length))) {
      yield header;
    }
    yield* iterable;
  }
}

async function *addMessages(
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
const AdHeaders = {
  [Service.ReceivePack]: encodeString("001f# service=git-receive-pack\n0000"),
  [Service.UploadPack]: encodeString("001e# service=git-upload-pack\n0000"),
};
