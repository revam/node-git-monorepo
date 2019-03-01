// @public (undocumented)
declare type Body = Uint8Array | Promise<Uint8Array> | PromiseLike<Uint8Array> | IterableIterator<Uint8Array> | AsyncIterableIterator<Uint8Array> | undefined | null;

// @public
declare type Capabilities = Map<string, string | undefined>;

// @public
declare function checkServiceDriver(target: unknown): target is ServiceController;

// @public
interface CommandReceivePack {
    commits: [string, string];
    kind: "create" | "update" | "delete";
    reference: string;
}

// @public
declare type Commands = Array<CommandReceivePack | CommandUploadPack>;

// @public
interface CommandUploadPack {
    commits: [string];
    kind: "want" | "have";
}

// @public
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
    // (undocumented)
    statusCode: number;
    toAsyncIterator(): AsyncIterableIterator<Uint8Array>;
    toReadable(): Readable;
    // (undocumented)
    type: string | undefined;
    // (undocumented)
    readonly url: string;
}

// @public
declare class Controller implements ServiceController {
    constructor(options?: GenericControllerOptions | undefined | null);
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
declare enum ErrorCodes {
    ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
    ERR_FAILED_IN_COMPLETE_SIGNAL = "ERR_FAILED_IN_COMPLETE_SIGNAL",
    ERR_FAILED_IN_USABLE_SIGNAL = "ERR_FAILED_IN_USABLE_SIGNAL",
    ERR_INCOMPLETE_PACKET = "ERR_INCOMPLETE_PACKET",
    ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
    ERR_INVALID_PACKET = "ERR_INVALID_PACKET_START"
}

// @public
interface GenericControllerOptions {
    enabledDefaults?: boolean | Partial<Record<Service, boolean>>;
    httpsOnly?: boolean;
    origin?: string;
    remoteTail?(service: Service, advertise: boolean): string;
}

// @public
declare class LogicController implements ServiceController {
    constructor(serviceController: ServiceController, overrides?: MethodOverrides);
    accept(context: Context): Promise<void>;
    protected argumentMethod(method: keyof ServiceController, context: Context, defaultValue?: boolean): Promise<boolean>;
    // (undocumented)
    checkForAuth(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfExists(context: Context): Promise<boolean>;
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
interface ServiceController {
    checkForAuth?(context: Context): Promise<boolean>;
    checkIfEnabled(context: Context): Promise<boolean>;
    checkIfExists(context: Context): Promise<boolean>;
    serve(context: Context): Promise<void>;
}


// (No @packageDocumentation comment for this package)
