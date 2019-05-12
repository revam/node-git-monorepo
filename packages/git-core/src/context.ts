import { Headers } from "node-fetch";
import { Readable } from "stream";
import {
  addHeaderToIterable,
  addMessagesToIterable,
  checkMethod,
  checkObject,
  createAsyncIterator,
  createEmptyAsyncIterator,
  createHeaders,
  createReadable,
  inferValues,
  markObject,
  ServiceReaders,
  SymbolPromise,
} from "./context.private";
import { Service } from "./enum";
import { checkEnum } from "./enum.private";
import { encode as encodeString } from "./util/buffer";
import { encodePacket, PacketType, readPackets } from "./util/packet";

/**
 * Generic context for use with an implementation of {@link ServiceController}.
 *
 * @remarks
 *
 * Can be extended for framework spesific functionality, or used directly.
 *
 * @public
 */
export class Context implements Response {
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
    pathname?: string,
    service?: Service,
  );
  public constructor(
    url?: string,
    method?: string,
    body?: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>,
    headers?: Headers | Record<string, string>,
    advertisement?: boolean,
    pathname?: string,
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
    if (!(typeof method === "string" && checkMethod(method))) {
      throw new TypeError("argument `method` must be one of the following HTTP verbs: GET, HEAD, PATCH, POST, PUT");
    }
    let body = rest.length >= 3 ? asyncIterator(rest[2]) : createEmptyAsyncIterator();
    const incomingHeaders = rest.length >= 4 ? rest[3] : {};
    if (incomingHeaders === null || typeof incomingHeaders !== "object") {
      throw new TypeError("argument `headers` must be of type 'object'.");
    }
    const headers = createHeaders(incomingHeaders);
    let advertisement = rest.length >= 5 ? rest[4] : false;
    if (typeof advertisement !== "boolean") {
      throw new TypeError("argument `advertisement`must be of type 'boolean'.");
    }
    let pathname = rest.length >= 6 ? rest[5] : undefined;
    if (!(pathname === undefined || typeof pathname === "string")) {
      throw new TypeError("argument `pathname` must be undefined or of type 'string'.");
    }
    let service = rest.length >= 7 ? rest[6] : undefined;
    if (!(service === undefined || typeof service === "string" && checkEnum(service, Service))) {
      throw new TypeError("argument `service` must be a value from enum Service.");
    }
    // Advertisement, path and service is inferred if none of them is supplied.
    if (rest.length < 5) {
      [advertisement, pathname, service] = inferValues(url, method, headers.get("Content-Type"));
    }
    // Set some properties early.
    this.__capabilities = new Map();
    this.__commands = [];
    // Read and analyse packets if we have a valid service and requester does **not** want advertisement.
    if (service && !advertisement) {
      body = readPackets(body, ServiceReaders[service](this.__capabilities, this.__commands));
      // Start analysing body, and delete promise when done.
      this[SymbolPromise] = body.next().then(() => { delete this[SymbolPromise]; });
    }
    // Set properties.
    this.__messages = [];
    this.advertisement = advertisement;
    // Ensure pathname is set.
    this.pathname = pathname || "";
    this.readable = Object.freeze({
      request: (): Readable => createReadable(this.request.body),
      response: (): Readable => createReadable(this.toAsyncIterator()),
    });
    this.request = Object.freeze({
      body,
      headers,
      method,
      url,
    });
    this.response = {
      body: undefined,
      headers: createHeaders(),
      status: 404,
    };
    this.service = service;
    this.state = Object.create(null);
    // tslint:enable:cyclomatic-complexity
  }

  //#endregion constructor
  //#region own properties and methods

  /**
   * Incoming request.
   */
  public readonly request: Readonly<Request>;
  /**
   * Outgoing response.
   */
  public response: Response;

  /**
   * Application/library defined properties for request.
   *
   * @remarks
   *
   * Up to extending libraries and/or applications on how to use this object,
   * the only restriction set is: it _must_ be an object.
   */
  public state: Record<PropertyKey, any>;

  /**
   * Resolves when request has been analysed.
   *
   * @remarks
   *
   * Is set to `undefined` when promise resolves, and is only present when not
   * advertising.
   */
  private [SymbolPromise]?: Promise<void> | undefined;

  /**
   * Check if request body has been analysed and is ready for use.
   */
  public get isInitialised(): boolean {
    return !(SymbolPromise in this);
  }

  /**
   * Resolves when request has been analysed.
   */
  public async initialise(): Promise<void> {
    return this[SymbolPromise];
  }

  /**
   * Raw capabilities for git retrived from request body.
   */
  private readonly __capabilities: Capabilities;

  /**
   * Capabilities read from {@link Request.body}.
   *
   * @remarks
   *
   * Will only be filled when request is not asking for advertisement.
   */
  public async capabilities(): Promise<Capabilities> {
    if (!this.isInitialised) {
      await this.initialise();
    }
    return new Map(this.__capabilities);
  }

  /**
   * Raw commands for git retrived from request body.
   */
  private readonly __commands: Commands;
  /**
   * Commands retrived from {@link Request.body}.
   *
   * @remarks
   *
   * Will only be filled when request is not asking for advertisement.
   */
  public async commands(): Promise<ReadonlyCommands> {
    if (!this.isInitialised) {
      await this.initialise();
    }
    return this.__commands.slice();
  }

  /**
   * String messages from application to requester.
   */
  private readonly __messages: Array<[PacketType, string]>;

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
   */
  public toAsyncIterator(): AsyncIterableIterator<Uint8Array> {
    let body = createAsyncIterator(this.body);
    // Only do the following if object is not already marked and if response
    // body, service and response "Content-Type" header is set.
    if (!checkObject(body) && this.body && this.service && this.type) {
      // Add header or messages to packed git stream if header "Content-Type" is
      // equal to below constant.
      const content_type = `application/x-git-${this.service}-${this.advertisement ? "advertisement" : "result"}`;
      if (this.type === content_type) {
        // Add header if advertisement is expected and no header is previously
        // set
        if (this.advertisement) {
          body = addHeaderToIterable(this.service, body);
          // Remove last known length (as it _may_ have been modified)
          this.length = undefined;
        }
        // Or add messages if service is used directly.
        else if (this.__messages.length) {
          // Consume messages by setting length to zero afterwards
          const packedMessages = this.__messages.map(([t, m]) => encodePacket(t, m));
          this.__messages.length = 0;
          body = addMessagesToIterable(packedMessages, body);
          // Append length if previously known
          if (this.length !== undefined) {
            this.length += packedMessages.reduce((p, c) => p + c.length, 0);
          }
        }
      }
      // Or add messages if type is "text/plain".
      else if (/^text\/plain(;|$)/.test(this.type) && this.__messages.length) {
        // Consume messages by setting length to zero afterwards
        const messages = this.__messages.map(([t, m]) => `${t === PacketType.Message ? "Message" : "Error"}: ${m}\n`).map(encodeString);
        this.__messages.length = 0;
        body = addMessagesToIterable(messages, body);
        // Append length if previously known
        if (this.length !== undefined) {
          this.length += messages.reduce((p, c) => p + c.length, 0);
        }
      }
    }
    // Mark body in case method is called multiple times.
    markObject(body);
    // Replace response body with new body
    return this.body = body;
  }

  /**
   * Requester want advertisement for {@link Service | service}, and not the
   * service itself.
   */
  public readonly advertisement: boolean;

  /**
   * Requested project path.
   *
   * @remarks
   *
   * If `pathname` was not supplied to {@link (Context:class) | constructor} or
   * could not be infered from the preceding arguments, then its value is set to
   * `undefined`.
   */
  public pathname: string;

  /**
   * Requester want to use {@link Service | service}.
   *
   * @remarks
   *
   * If `service` was not supplied to {@link Context | constructor} or could not
   * be infered from the preceding arguments, then its value is set to
   * `undefined`.
   */
  public readonly service: Service | undefined;

  //#endregion own properties and methods
  //#region stream compatibility

  /**
   * For compatibility with other libraries using standard node streams.
   */
  public readonly readable: {
    /**
     * Convert {@link Request.body | request body} to a
     * {@link stream#Readable | readable stream}.
     *
     * @remarks
     *
     * For compatibility with other libraries using standard node streams.
     */
    request(): Readable;
    /**
     * Convert {@link Response.body | response body} to a
     * {@link stream#Readable | readable stream}.
     *
     * @remarks
     *
     * For compatibility with other libraries using standard node streams.
     */
    response(): Readable;
  };

  //#endregion stream compatibility
  //#region request delegation

  /**
   * URL-string without origin of incoming request.
   */
  public get url() {
    return this.request.url;
  }

  /**
   * HTTP verb used with incoming request.
   */
  public get method() {
    return this.request.method;
  }

  //#endregion request delegation
  //#region response delegation

  /**
   * Set header in {@link Response.headers | response headers}.
   *
   * @param headerName - Case-insensitive name of header to set.
   * @param value - New value(s) to set.
   */
  public setHeader(headerName: string, value: number | string | string[]): void;
  /**
   * Delete header from {@link Response.headers | response headers}.
   *
   * @param headerName - Case-insensitive name of header to delete.
   */
  public setHeader(headerName: string): void;
  /**
   * Set or delete header in/from {@link Response.headers | response headers}.
   *
   * @remarks
   *
   * Using an undefined value for `value` will remove the header.
   *
   * @param headerName - Case-insensitive name of header to set.
   * @param value - New value(s) to set. Set `undefined` to delete instead.
   */
  public setHeader(headerName: string, value?: number | string | string[]): void;
  public setHeader(headerName: string, value?: number | string | string[]): void {
    if (value instanceof Array) {
      value.forEach((v) => this.response.headers.append(headerName, v));
      return;
    }
    if (typeof value === "number") {
      value = value.toString(10);
    }
    if (typeof value === "string") {
      this.response.headers.set(headerName, value);
    }
    else {
      this.response.headers.delete(headerName);
    }
  }

  /**
   * Response body to send.
   *
   * @remarks
   *
   * See {@link Body} for possible values.
   */
  public get body(): Body {
    return this.response.body;
  }
  public set body(value: Body) {
    this.response.body = value;
  }

  /**
   * Outgoing response headers.
   */
  public get headers(): Headers {
    return this.response.headers;
  }
  public set headers(value: Headers) {
    this.response.headers = value;
  }

  /**
   * Status code for outgoing response.
   */
  public get status(): number {
    return this.response.status;
  }
  public set status(value: number) {
    this.response.status = value;
  }

  /**
   * Get/set "Content-Type" header for response.
   */
  public get type(): string | undefined {
    return this.response.headers.get("Content-Type") || undefined;
  }
  public set type(value: string | undefined) {
    this.setHeader("Content-Type", value);
  }

  /**
   * Get/set "Content-Length" header for response.
   */
  public get length(): number | undefined {
    const value = this.response.headers.get("Content-Length");
    if (typeof value === "string") {
      return Number.parseInt(value, 10);
    }
  }
  public set length(value: number | undefined) {
    this.setHeader("Content-Length", value);
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
 * An incoming request.
 *
 * @public
 */
export interface Request {
  /**
   * Incoming request body.
   */
  body: AsyncIterableIterator<Uint8Array>;
  /**
   * Incoming HTTP headers.
   */
  headers: Headers;
  /**
   * HTTP verb used with incoming request.
   */
  method: "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";
  /**
   * URL-string without origin of incoming request.
   */
  url: string;
}

/**
 * An outgoing response.
 *
 * @public
 */
export interface Response {
  /**
   * Response body to send.
   *
   * @remarks
   *
   * See {@link Body} for possible values.
   */
  body: Body;
  /**
   * Outgoing response headers.
   */
  headers: Headers;
  /**
   * Status code for outgoing response.
   */
  status: number;
}

function asyncIterator<T>(iterable?: AsyncIterable<T> | AsyncIterableIterator<T>): AsyncIterableIterator<T> {
  if (!(iterable && Symbol.asyncIterator in iterable)) {
    throw new TypeError("argument `iterable` must be an async iterable.");
  }
  return iterable[Symbol.asyncIterator]() as AsyncIterableIterator<T>;
}
