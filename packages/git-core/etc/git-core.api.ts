// @public (undocumented)
declare type Body = Uint8Array | Promise<Uint8Array> | PromiseLike<Uint8Array> | Iterable<Uint8Array> | IterableIterator<Uint8Array> | AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array> | undefined | null;

// @public
declare type Capabilities = Map<string, string | undefined>;

// @public
declare function checkServiceController(target: unknown): target is ServiceController;

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
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | Record<string, string>);
    // (undocumented)
    constructor(url: string, method: string, body: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers: Headers | Record<string, string>, advertisement: boolean, path?: string, service?: Service);
    // (undocumented)
    constructor(url?: string, method?: string, body?: AsyncIterable<Uint8Array> | AsyncIterableIterator<Uint8Array>, headers?: Headers | Record<string, string>, advertisement?: boolean, path?: string, service?: Service);
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
    checkIfEnabled(context: Context): Promise<boolean>;
    // (undocumented)
    checkIfExists(context: Context): Promise<boolean>;
    protected readonly origin?: string;
    protected preparePath(context: Context): {
        isValid: boolean;
        isRemote: boolean;
    };
    protected remoteURL(baseURL: string, service: Service, advertise: boolean): string;
    // (undocumented)
    serve(context: Context): Promise<void>;
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
    checkForAuth(context: Context): Promise<boolean>;
    checkIfEnabled(context: Context): Promise<boolean>;
    checkIfExists(context: Context): Promise<boolean>;
    custom(context: Context): void;
    readonly onComplete: ReadableSignal<Context>;
    readonly onUsable: ReadableSignal<Context>;
    redirect(context: Context, statusCode: 304): void;
    redirect(context: Context, statusCode?: number): void;
    redirect(context: Context, location: string, statusCode?: number): void;
    redirect(context: Context, locationOrStatus?: string | number, statusCode?: number): void;
    reject(context: Context, statusCode?: number, reason?: string): void;
    serve(context: Context): Promise<void>;
    use(...middleware: Middleware[]): this;
}

// @public
declare class LogicControllerInstance {
    // (undocumented)
    constructor(controller: LogicController, context: Context);
    accept(): Promise<void>;
    checkForAuth(): Promise<boolean>;
    checkIfEnabled(): Promise<boolean>;
    checkIfExists(): Promise<boolean>;
    readonly context: Context;
    custom(): void;
    redirect(statusCode: 304): void;
    redirect(statusCode?: number): void;
    redirect(location: string, statusCode?: number): void;
    redirect(locationOrStatus?: string | number, statusCode?: number): void;
    reject(statusCode?: number, reason?: string): void;
}

// @public
declare type MethodOverride = (this: LogicControllerInstance, context: Context) => (void | boolean) | Promise<void | boolean> | PromiseLike<void | boolean>;

// @public
declare type MethodOverrides = Partial<Record<Exclude<keyof ServiceController, "serve">, boolean | MethodOverride>>;

// @public
declare type Middleware = (this: LogicControllerInstance, context: Context) => any;

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
