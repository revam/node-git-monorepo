import { Headers } from "node-fetch";
import { Readable } from "stream";
import {
  addHeaderToIterable,
  addMessagesToIterable,
  AllowedMethods,
  createAsyncIterator,
  createReadable,
  inferValues,
} from "./context.private";
import { Service } from "./enum";
import { checkEnum } from "./enum.private";
import { decodeString, encodePacket, encodeString, PacketType, readPackets } from "./packet-util";

const SymbolPromise = Symbol("promise");

/**
 * Generic context for use with an implementation of {@link ServiceController}.
 *
 * @remarks
 *
 * Can be extended for framework spesific functionality, or used directly.
 *
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
    const method = rest.length >= 2 ? (rest[1] && rest[1].toUpperCase()) : "GET";
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
      [advertisement, path, service] = inferValues(url, method, headers.get("Content-Type"));
    }
    // Read and analyse packets if we have a valid service and requester does **not** want advertisement.
    if (service && !advertisement) {
      const middleware = ServiceReaders.get(service)!;
      body = readPackets(body, middleware(this.__capabilities, this.__commands));
      this[SymbolPromise] = body.next().then(() => { delete this[SymbolPromise]; });
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
        return createReadable(this.body);
      },
    };
    this.response = {
      body: undefined,
      headers: new Headers(),
      status: 404,
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
    let body = createAsyncIterator(this.response.body);
    // Check if body and service is truthy
    if (this.response.body && this.request.service && this.type) {
      // Add header or messages if content type is the expected type.
      const content_type = `application/x-git-${this.service}-${this.advertisement ? "advertisement" : "result"}`;
      if (this.type === content_type) {
        // Add header if none found
        if (this.advertisement) {
          body = addHeaderToIterable(this.request.service, body);
        }
        // Add messages
        else if (this.__messages.length) {
          // Consume messages
          const packedMessages = this.__messages.map(([t, m]) => encodePacket(t, m));
          this.__messages.length = 0;
          body = addMessagesToIterable(packedMessages, body);
        }
      }
      // Or add messages if type is "text/plain".
      else if (/^text\/plain(;|$)/.test(this.type) && this.__messages.length) {
        // Consume messages
        const messages = this.__messages.map(([t, m]) => `${t === PacketType.Message ? "Error" : "Message"}: ${m}\n`).map(encodeString);
        this.__messages.length = 0;
        body = addMessagesToIterable(messages, body);
      }
    }
    // Set body
    return this.response.body = body;
  }

  /**
   * Create a {@link stream#Readable | readable} for {@link Response.body | response body}.
   */
  public toReadable(): Readable {
    return createReadable(this.toAsyncIterator());
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
 * Requested capebilities client support and want to use with this request.
 *
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
 * Contains commands for {@link Service | service} used.
 *
 * @public
 */
export type Commands = Array<CommandReceivePack | CommandUploadPack>;

/**
 * @public
 */
export type ReadonlyCommands = ReadonlyArray<Readonly<CommandReceivePack | CommandUploadPack>>;

/**
 *
 *
 * @public
 */
export type Body =
| Uint8Array
| Promise<Uint8Array>
| PromiseLike<Uint8Array>
| Iterable<Uint8Array>
| IterableIterator<Uint8Array>
| AsyncIterable<Uint8Array>
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
   * Request body as a {@link stream#Readable | readable stream}.
   *
   * @remarks
   *
   * For compatibility with other libraries using standard node streams.
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

async function *emptyIterable(): AsyncIterableIterator<Uint8Array> { return; }

function asyncIterator<T>(iterable?: AsyncIterable<T> | AsyncIterableIterator<T>): AsyncIterableIterator<T> {
  if (!(iterable && Symbol.asyncIterator in iterable)) {
    throw new TypeError("argument `iterable` must be an async iterable.");
  }
  return iterable[Symbol.asyncIterator]() as AsyncIterableIterator<T>;
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

/**
 * Maps {@link Service} to a valid packet reader for
 * {@link Request.body | request body}.
 */
const ServiceReaders = new Map<Service, (...args: [Capabilities, Commands]) => (b: Uint8Array) => any>([
  [
    Service.ReceivePack,
    (capabilities, commands) => {
      const pre_check = /[0-9a-f]{40} [0-9a-f]{40}/;
      const regex =
        /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n?$/;
      return (buffer) => {
        if (pre_check.test(decodeString(buffer.slice(4, 85)))) {
          const value = decodeString(buffer);
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
        if (pre_check.test(decodeString(buffer.slice(4, 8)))) {
          const value = decodeString(buffer);
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
