// @public
export function checkServiceDriver(target: unknown): target is ServiceDriver;

// @public
interface CommandReceivePack {
  commits: [string, string];
  kind: "create" | "update" | "delete";
  reference: string;
}

// @public
interface CommandUploadPack {
  commits: [string];
  kind: "want" | "have";
}

// @public (undocumented)
class Context {
  constructor();
  addError(errorMessage: string): void;
  addMessage(message: string): void;
  readonly advertisement: boolean;
  // (undocumented)
  body: Body;
  capabilities(): Promise<Capabilities>;
  commands(): Promise<ReadonlyCommands>;
  get(headerName: string): string | undefined;
  initialise(): Promise<void>;
  readonly isPending: boolean;
  readonly isReady: boolean;
  // (undocumented)
  length: number;
  path: string | undefined;
  readonly request: Request;
  readonly response: Response;
  // (undocumented)
  readonly service: Service | undefined;
  set(headerName: string, value?: number | string | string[]): void;
  state: Record<PropertyKey, any>;
  readonly status: Status;
  // (undocumented)
  statusCode: number;
  toAsyncIterator(): AsyncIterableIterator<Uint8Array>;
  // WARNING: Unable to find a documentation file ("stream.api.json") for the referenced package
  toReadable(): Readable;
  // (undocumented)
  type: string | undefined;
  updateStatus(status: Status): void;
  // (undocumented)
  readonly url: string;
}

// @public
enum ErrorCodes {
  ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
  ERR_FAILED_IN_COMPLETE_SIGNAL = "ERR_FAILED_IN_COMPLETE_SIGNAL",
  ERR_FAILED_IN_USABLE_SIGNAL = "ERR_FAILED_IN_USABLE_SIGNAL",
  ERR_FAILED_PROXY_METHOD = "ERR_FAILED_PROXY_METHOD",
  ERR_INCOMPLETE_PACKET = "ERR_INCOMPLETE_PACKET",
  ERR_INVALID_ARG_TYPE = "ERR_INVALID_ARG_TYPE",
  ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
  ERR_INVALID_PACKET = "ERR_INVALID_PACKET_START"
}

// @public
class GenericDriver implements ServiceDriver {
  constructor(options?: GenericDriverOptions);
  checkForAuth(): Promise<boolean> | boolean;
  // (undocumented)
  protected checkFSIfEnabled(context: Context): Promise<boolean>;
  // (undocumented)
  protected checkFSIfExists(context: Context): Promise<boolean>;
  // (undocumented)
  protected checkHTTPIfEnabled(context: Context): Promise<boolean>;
  // (undocumented)
  protected checkHTTPIfExists(context: Context): Promise<boolean>;
  checkIfEnabled(context: Context): Promise<boolean>;
  // (undocumented)
  checkIfExists(context: Context): Promise<boolean>;
  protected readonly enabledDefaults: Readonly<Record<Service, boolean>>;
  protected readonly origin?: string;
  protected readonly originIsRemote: boolean;
  protected preparePath: {
    isHttp: boolean;
    isValid: boolean;
  }
  protected remoteURL(baseURL: string, service: Service, advertise: boolean): string;
  serve(context: Context): Promise<void>;
  // (undocumented)
  protected serveFS(context: Context): Promise<void>;
  // (undocumented)
  protected serveHTTP(context: Context): Promise<void>;
}

// @public
interface GenericDriverOptions {
  enabledDefaults?: boolean | Partial<Record<Service, boolean>>;
  httpsOnly?: boolean;
  methods?: ProxiedMethods;
  origin?: string;
  remoteTail?(service: Service, advertise: boolean): string;
}

// @public (undocumented)
interface IError extends Error {
  // (undocumented)
  code: string;
  // (undocumented)
  statusCode?: number;
}

// @public (undocumented)
interface IOuterError extends IError {
  // (undocumented)
  inner: any;
}

// @public
class LogicController implements ServiceDriver {
  constructor(serviceDriver: ServiceDriver);
  accept(context: Context): Promise<void>;
  checkForAuth(context: Context): Promise<boolean>;
  checkIfEnabled(context: Context): Promise<boolean>;
  checkIfExists(context: Context): Promise<boolean>;
  readonly driver: ServiceDriver;
  readonly onComplete: ReadableSignal<Context>;
  readonly onError: ReadableSignal<any>;
  readonly onUsable: ReadableSignal<Context>;
  redirect(request: Context): Promise<void>;
  reject(context: Context, statusCode?: number, reason?: string): Promise<void>;
  serve(context: Context): Promise<void>;
  use(...middleware: Middleware[]): this;
}

// @public
interface ProcessError extends IError {
  // (undocumented)
  exitCode: number;
  // (undocumented)
  stderr: string;
}

// @public
interface ProxyError extends IOuterError {
  // (undocumented)
  inner: Error;
  // (undocumented)
  methodName: string;
}

// @public (undocumented)
interface Request {
  readonly advertisement: boolean;
  readonly body: AsyncIterableIterator<Uint8Array>;
  // (undocumented)
  readonly headers: Headers;
  readonly method: "GET" | "HEAD" | "PATCH" | "POST" | "PUT";
  path?: string;
  // (undocumented)
  readonly service?: Service;
  toReadable(): Readable;
  // (undocumented)
  readonly url: string;
}

// @public (undocumented)
interface Response {
  // (undocumented)
  body: Body;
  // (undocumented)
  headers: Headers;
  // (undocumented)
  status: number;
}

// @public
enum Service {
  ReceivePack = "receive-pack",
  UploadPack = "upload-pack"
}

// @public
interface ServiceDriver {
  checkForAuth(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  checkIfEnabled(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  checkIfExists(context: Context): boolean | Promise<boolean> | PromiseLike<boolean>;
  serve(context: Context): Promise<void>;
}

// @public
enum Status {
  Accepted = "Accepted",
  Failure = "Failure",
  Pending = "Pending",
  Redirect = "Redirect",
  Rejected = "Rejected"
}

// WARNING: Unsupported export: Capabilities
// WARNING: Unsupported export: Commands
// WARNING: Unsupported export: ReadonlyCommands
// WARNING: Unsupported export: Body
// WARNING: Unsupported export: Middleware
// (No @packagedocumentation comment for this package)
