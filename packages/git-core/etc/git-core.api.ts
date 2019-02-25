// @public (undocumented)
declare type Body = Uint8Array | Promise<Uint8Array> | PromiseLike<Uint8Array> | IterableIterator<Uint8Array> | AsyncIterableIterator<Uint8Array> | undefined | null;

// @public (undocumented)
declare type Capabilities = Map<string, string | undefined>;

// @public
declare function checkServiceDriver(target: unknown): target is ServiceDriver;

// @public
interface CommandReceivePack {
    commits: [string, string];
    kind: "create" | "update" | "delete";
    reference: string;
}

// @public (undocumented)
declare type Commands = Array<CommandReceivePack | CommandUploadPack>;

// @public
interface CommandUploadPack {
    commits: [string];
    kind: "want" | "have";
}

// @public (undocumented)
declare class Context {
    // (undocumented)
    constructor();
    // (undocumented)
    constructor(url: string);
    // (undocumented)
    constructor(url: string, method: string);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | Record<string, string>);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | Record<string, string>, advertisement: boolean, path?: string, service?: Service);
    // (undocumented)
    constructor(url?: string, method?: string, body?: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers?: Headers | Record<string, string>, advertisement?: boolean, path?: string, service?: Service);
    addError(errorMessage: string): void;
    addMessage(message: string): void;
    // (undocumented)
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
    // (undocumented)
    path: string | undefined;
    readonly request: Request;
    readonly response: Response;
    // (undocumented)
    readonly service: Service | undefined;
    set(headerName: string, value?: number | string | string[]): void;
    set(headerName: string, ...values: [string, string, ...string[]]): void;
    state: Record<PropertyKey, any>;
    readonly status: Status;
    // (undocumented)
    statusCode: number;
    toAsyncIterator(): AsyncIterableIterator<Uint8Array>;
    toReadable(): Readable;
    // (undocumented)
    type: string | undefined;
    updateStatus(status: Status): void;
    // (undocumented)
    readonly url: string;
}

// @public
declare enum ErrorCodes {
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
declare class GenericDriver implements ServiceDriver {
    constructor(options?: GenericDriverOptions);
    constructor(origin: string, options?: GenericDriverOptions);
    // (undocumented)
    checkForAuth(): Promise<boolean> | boolean;
    // (undocumented)
    protected checkFSIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    protected checkFSIfExists(context: Context): Promise<boolean>;
    // (undocumented)
    protected checkHTTPIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    protected checkHTTPIfExists(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfExists(context: Context): Promise<boolean>;
    protected readonly enabledDefaults: Readonly<Record<Service, boolean>>;
    protected readonly origin?: string;
    protected readonly originIsRemote: boolean;
    protected preparePath(context: Context): {
        // (undocumented)
        isValid: boolean;
        // (undocumented)
        isHttp: boolean;
    };
    protected remoteURL(baseURL: string, service: Service, advertise: boolean): string;
    // (undocumented)
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
declare class LogicController implements ServiceDriver {
    constructor(serviceDriver: ServiceDriver);
    accept(context: Context): Promise<void>;
    // (undocumented)
    checkForAuth(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfExists(context: Context): Promise<boolean>;
    readonly driver: ServiceDriver;
    readonly onComplete: ReadableSignal<Context>;
    readonly onError: ReadableSignal<any>;
    readonly onUsable: ReadableSignal<Context>;
    redirect(request: Context): Promise<void>;
    redirect(request: Context, ststuCode: 304): Promise<void>;
    redirect(request: Context, statusCode: number): Promise<void>;
    redirect(request: Context, location: string, statusCode?: number): Promise<void>;
    // (undocumented)
    redirect(reqiest: Context, locationOrStatus?: string | number, statusCode?: number): Promise<void>;
    reject(context: Context, statusCode?: number, reason?: string): Promise<void>;
    serve(context: Context): Promise<void>;
    use(...middleware: Middleware[]): this;
}

// @public
declare type Middleware = (this: MiddlewareContext, context: Context) => any;

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
declare type ReadonlyCommands = ReadonlyArray<Readonly<CommandReceivePack | CommandUploadPack>>;

// @public (undocumented)
interface Request {
    readonly advertisement: boolean;
    readonly body: AsyncIterableIterator<Uint8Array>;
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
declare enum Service {
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
declare enum Status {
    Accepted = "Accepted",
    Failure = "Failure",
    Pending = "Pending",
    Redirect = "Redirect",
    Rejected = "Rejected"
}


// (No @packageDocumentation comment for this package)
