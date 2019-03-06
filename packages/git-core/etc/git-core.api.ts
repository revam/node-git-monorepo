// @public (undocumented)
declare type Body = Uint8Array | Promise<Uint8Array> | PromiseLike<Uint8Array> | Iterable<Uint8Array> | IterableIterator<Uint8Array> | AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array> | undefined | null;

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
declare class Context implements Response {
    // (undocumented)
    constructor();
    // (undocumented)
    constructor(url: string);
    // (undocumented)
    constructor(url: string, method: string);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | IncomingHttpHeaders);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | IncomingHttpHeaders, advertisement: boolean, path?: string, service?: Service);
    // (undocumented)
    constructor(url?: string, method?: string, body?: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers?: Headers | IncomingHttpHeaders, advertisement?: boolean, path?: string, service?: Service);
    addError(errorMessage: string): void;
    addMessage(message: string): void;
    readonly advertisement: boolean;
    body: Body;
    capabilities(): Promise<Capabilities>;
    commands(): Promise<ReadonlyCommands>;
    headers: Headers;
    initialise(): Promise<void>;
    readonly isInitialised: boolean;
    length: number | undefined;
    readonly method: "HEAD" | "GET" | "OPTIONS" | "PATCH" | "POST" | "PUT";
    path: string | undefined;
    readonly readable: {
        request(): Readable;
        response(): Readable;
    };
    readonly request: Readonly<Request>;
    readonly response: Response;
    readonly service: Service | undefined;
    setHeader(headerName: string, value: number | string | string[]): void;
    setHeader(headerName: string): void;
    setHeader(headerName: string, value?: number | string | string[]): void;
    state: Record<PropertyKey, any>;
    status: number;
    toAsyncIterator(): AsyncIterableIterator<Uint8Array>;
    type: string | undefined;
    readonly url: string;
}

// @public
declare class Controller implements ServiceController {
    constructor(options?: ControllerOptions | undefined | null);
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
interface ControllerOptions {
    enabledDefaults?: boolean | Partial<Record<Service, boolean>>;
    httpsOnly?: boolean;
    origin?: string;
    remoteTail?(service: Service, advertise: boolean): string;
}

// @public
declare enum ErrorCodes {
    ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
    ERR_INCOMPLETE_PACKET = "ERR_INCOMPLETE_PACKET",
    ERR_INVALID_BODY_FOR_2XX = "ERR_INVALID_BODY_FOR_2XX",
    ERR_INVALID_PACKET = "ERR_INVALID_PACKET"
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

// @public (undocumented)
declare type ReadonlyCommands = ReadonlyArray<Readonly<CommandReceivePack | CommandUploadPack>>;

// @public
interface Request {
    body: AsyncIterableIterator<Uint8Array>;
    headers: Headers;
    method: "GET" | "HEAD" | "OPTIONS" | "PATCH" | "POST" | "PUT";
    url: string;
}

// @public
interface Response {
    body: Body;
    headers: Headers;
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
