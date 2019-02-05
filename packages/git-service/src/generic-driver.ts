import { ChildProcess, spawn } from "child_process";
import { IncomingMessage, OutgoingHttpHeaders, request as send, RequestOptions } from "http";
import { request as sendSecure } from "https";
import { isAbsolute, join, resolve } from "path";
import { Readable } from "stream";
import { parse } from "url";
import { ErrorCodes, ServiceType } from "./enums";
import { IDriver, IDriverError, IProxiedError, IRequestData, IResponseData } from "./interfaces";

/**
 * A generic implementation of the {@link IDriver} interface both file system
 * access and/or forwarding to other http(s) servers.
 *
 * All public `check*` methods can be proxied through `options.methods`.
 */
export class GenericDriver implements IDriver {
  protected readonly enabledDefaults: Readonly<Record<ServiceType, boolean>>;
  protected readonly origin?: string;
  protected readonly originIsHttp: boolean;

  /**
   * Creates a new instance of {@link GenericDriver}.
   */
  public constructor();
  /**
   * Creates a new instance of {@link GenericDriver}.
   *
   * @param options Driver options.
   */
  public constructor(options: GenericDriver.Options);
  /**
   * Creates a new instance of {@link GenericDriver}.
   *
   * @param origin Default repository storage location (rel./abs. path or url)
   * @param options Driver options. Property `origin` will be ignored.
   */
  public constructor(origin: string, options?: GenericDriver.Options);
  /**
   * Creates a new instance of {@link GenericDriver}.
   *
   * @param originOrOptions Origin string or options object
   * @param options Driver options. Ignored if `originOrOptions` is an object.
   */
  public constructor(originOrOptions?: string | GenericDriver.Options, options?: GenericDriver.Options);
  public constructor(origin?: string | GenericDriver.Options, options: GenericDriver.Options = {}) {
    if (typeof origin === "object") {
      options = origin;
      origin = options.origin;
      delete options.origin;
    }
    if (typeof origin === "string" && origin.length > 0) {
      const isHttp = hasHttpProtocol(origin);
      // Resolve path if it is not an url and not absolute.
      if (!isHttp && !isAbsolute(origin)) {
        origin = resolve(origin);
      }
      // Strip trailing slash if found
      if (origin.length > 1 && origin.endsWith("/")) {
        origin = origin.substring(0, origin.length - 1);
      }
      this.origin = origin;
      this.originIsHttp = isHttp;
    }
    else {
      this.origin = undefined;
      this.originIsHttp = false;
    }
    this.enabledDefaults = {
      "receive-pack": true,
      "upload-pack": true,
    };
    if (options.enabledDefaults) {
      const enabledDefaults = options.enabledDefaults;
      if (typeof enabledDefaults === "boolean") {
        for (const service of Object.keys(this.enabledDefaults)) {
          if (this.enabledDefaults.hasOwnProperty(service)) {
            this.enabledDefaults[service] = enabledDefaults;
          }
        }
      }
      else if (typeof enabledDefaults === "object") {
        for (const [service, state] of Object.entries(enabledDefaults)) {
          if (this.enabledDefaults.hasOwnProperty(service)) {
            this.enabledDefaults[service] = state;
          }
        }
      }
    }
    if (typeof options.methods === "object") {
      const proxyMethods = new Set(["checkForAccess", "checkIfExists", "checkIfEnabled"]);
      const methods = options.methods;
      return new Proxy(this, {
        get(target, prop: string, receiver) {
          if (proxyMethods.has(prop) && prop in methods) {
            return async(...args: any[]): Promise<any> => {
              try {
                const value = await methods[prop].apply(methods, args);
                if (value !== undefined) {
                  return value;
                }
              } catch (error) {
                throw createProxiedError(error, prop);
              }
              return target[prop].apply(receiver, args);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
    }
  }

  protected preparePath(request: IRequestData): { isValid: boolean; isHttp: boolean } {
    let path = request.path;
    let isValid = false;
    let isHttp = false;
    // Path must be provided and not contain any segments equal to "." or "..".
    if (typeof path === "string" && !RELATIVE_PATH_REGEX.test(path)) {
      // urls has first priority
      if (hasHttpProtocol(path)) {
        isValid = isHttp = true;
      }
      else if (this.origin) {
        // Sanetize input
        if (!path.length) {
          path = "/";
        }
        else if (path.length > 1 && path.endsWith("/")) {
          path = path.substring(0, path.length - 1);
        }
        if (this.originIsHttp) {
          if (path[0] !== "/") {
            path = `/${path}`;
          }
          isHttp = true;
          path = this.origin + path;
        }
        else {
          path = join(this.origin, path);
        }
        isValid = true;
      }
      else if (isAbsolute(path)) {
        isValid = true;
      }
    }
    return { isHttp, isValid };
  }

  public checkForAccess(): Promise<boolean> | boolean {
    // No built-in access control.
    return true;
  }

  public async checkIfEnabled(request: IRequestData): Promise<boolean> {
    if (request.service) {
      const { isValid, isHttp } = this.preparePath(request);
      if (isValid) {
        return isHttp ? this.checkHTTPIfEnabled(request) : this.checkFSIfEnabled(request);
      }
    }
    return false;
  }

  protected async checkHTTPIfEnabled(request: IRequestData): Promise<boolean> {
    const url = `${request.path!}/info/refs?service=git-${request.service}`;
    const response = await waitForResponse(url, "HEAD");
    return Boolean(response.statusCode && response.statusCode < 300 && response.statusCode >= 200);
  }

  protected async checkFSIfEnabled(request: IRequestData): Promise<boolean> {
    const command = request.service!.replace("-", "");
    const child = spawn("git", ["-C", request.path!, "config", "--bool", `deamon.${command}`]);
    const {exitCode, stdout, stderr} = await waitForChild(child);
    if (exitCode === 0) {
      const output = stdout.toString("utf8");
      return command === "uploadpack" ? output !== "false" : output === "true";
    }
    // Return default value for setting when not found in configuration
    if (!stdout.length) {
      return this.enabledDefaults[request.service!];
    }
    throw createDriverError(exitCode, stderr);
  }

  public async checkIfExists(request: IRequestData): Promise<boolean> {
    const { isValid, isHttp } = this.preparePath(request);
    if (isValid) {
      return isHttp ? this.checkHTTPIfExists(request) : this.checkFSIfExists(request);
    }
    return false;
  }

  protected async checkHTTPIfExists(request: IRequestData): Promise<boolean> {
    const url = `${request.path!}/info/refs?service=git-upload-pack`;
    const response = await waitForResponse(url, "HEAD");
    return Boolean(response.statusCode && response.statusCode < 300 && response.statusCode >= 200);
  }

  protected async checkFSIfExists(request: IRequestData): Promise<boolean> {
    const child = spawn("git", ["ls-remote", request.path!, "HEAD"], {stdio: ["ignore", null, null]});
    const {exitCode} = await waitForChild(child);
    return exitCode === 0;
  }

  public async serve(request: IRequestData, response: IResponseData): Promise<void> {
    if (request.service) {
      const { isValid, isHttp } = this.preparePath(request);
      if (isValid) {
        return isHttp ? this.serveHTTP(request, response) : this.serveFS(request, response);
      }
    }
  }

  protected async serveHTTP(request: IRequestData, response: IResponseData): Promise<void> {
    const url = `${request.path!}/${request.isAdvertisement ? "info/refs?service=" : ""}git-${request.service}`;
    const method = request.isAdvertisement ? "GET" : "POST";
    const message = await waitForResponse(url, method, request.headers.toJSON(), request.body);
    for (const [header, value] of Object.entries(message.headers)) {
      response.headers.set(header, value);
    }
    response.body = await waitForBuffer(message);
    // ALLWAYS override status code/message
    response.statusCode = message.statusCode!;
  }

  protected async serveFS(request: IRequestData, response: IResponseData): Promise<void> {
    const option = request.isAdvertisement ? "--advertise-refs" : "--stateless-rpc";
    const child = spawn("git", ["-C", request.path!, request.service!, option, "."]);
    if (!request.isAdvertisement) {
      request.body.pipe(child.stdin);
    }
    const {exitCode, stdout, stderr} = await waitForChild(child);
    if (exitCode !== 0) {
      throw createDriverError(exitCode, stderr);
    }
    response.body = stdout;
    // ALLWAYS override status code/message
    response.statusCode = 200;
  }
}

export namespace GenericDriver {
  /**
   * Generic driver options.
   */
  export interface Options {
    /**
     * Default values for enabled-check with file-system driver.
     */
    enabledDefaults?: boolean | { [K in ServiceType]?: boolean; };
    /**
     * Custom implementations (overrides) of driver methods.
     *
     * All proxied methods should act the same as the methods they are proxying,
     * with the exception of allowing void as a return type.
     *
     * When a proxied method returns undefined, or a promise-like object resolving
     * to undefined, the proxided method will fallback to the original method
     * implementation.
     */
    methods?: ProxiedMethods;
    /**
     * Origin location as an URI or relative/abolute path.
     */
    origin?: string;
  }

  /**
   * Custom implementations (overrides) of driver methods.
   *
   * All proxied methods should act the same as the methods they are proxying,
   * with the exception of allowing void as a return type.
   *
   * When a proxied method returns undefined, or a promise-like object resolving
   * to undefined, the proxided method will fallback to the original method
   * implementation.
   */
  export type ProxiedMethods = {
    [P in keyof Exclude<IDriver, "serve">]?: (
      request: IRequestData,
      response: IResponseData,
    ) => ReturnType<IDriver[P]> | void | PromiseLike<void>;
  };
}

function hasHttpProtocol(uriOrPath?: string): boolean {
  return Boolean(uriOrPath && /^https?:\/\//.test(uriOrPath));
}

// Based on function exec() from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
async function waitForChild(child: ChildProcess): Promise<IExecutionResult> {
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      new Promise<number>((_, r) => child.once("error", r).once("exit", _)),
      waitForBuffer(child.stdout),
      waitForBuffer(child.stderr).then((buffer) => buffer.toString("utf8")),
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    return { exitCode: -1, stdout: Buffer.alloc(0), stderr: error && error.message || "Unkonwn error" };
  }
}

function waitForResponse(
  url: string,
  method: "GET" | "HEAD",
): Promise<IncomingMessage>;
function waitForResponse(
  url: string,
  method: "POST",
  headers: OutgoingHttpHeaders,
  body: NodeJS.ReadableStream,
): Promise<IncomingMessage>;
function waitForResponse(
  url: string,
  method: "GET" | "HEAD" | "POST",
  headers?: OutgoingHttpHeaders,
  body?: NodeJS.ReadableStream,
): Promise<IncomingMessage>;
async function waitForResponse(
  url: string,
  method: string,
  headers?: OutgoingHttpHeaders,
  body?: NodeJS.ReadableStream,
): Promise<IncomingMessage> {
  return new Promise<IncomingMessage>((ok, error) => {
    const parsedUrl = parse(url);
    const options: RequestOptions = {
      headers,
      host: parsedUrl.host,
      method,
      path: parsedUrl.path,
      port: parsedUrl.port,
      protocol: parsedUrl.protocol,
    };
    const request = (parsedUrl.protocol === "https:" ? sendSecure : send)(options, ok);
    request.once("error", error);
    if (method === "POST") {
      body!.pipe(request);
    } else {
      request.end();
    }
  });
}

function createDriverError(exitCode: number, stderr: string): IDriverError {
  const error: Partial<IDriverError> = new Error("Failed to execute git");
  error.code = ErrorCodes.ERR_FAILED_GIT_EXECUTION;
  error.exitCode = exitCode;
  error.stderr = stderr;
  return error as IDriverError;
}

function createProxiedError(innerError: Error, methodName: string) {
  const error: Partial<IProxiedError> = new Error(`Proxied method ${methodName} failed: ${innerError.message}`);
  error.code = ErrorCodes.ERR_FAILED_PROXY_METHOD;
  error.inner = innerError;
  error.methodName = methodName;
  error.stack = innerError.stack;
  throw error as IProxiedError;
}

interface IExecutionResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}

async function waitForBuffer(readable: Readable): Promise<Buffer> {
  return new Promise<Buffer>((ok, error) => {
    const buffers: Buffer[] = [];
    readable.once("error", error);
    readable.on("data", (b: Buffer) => buffers.push(b));
    readable.once("close", () => ok(Buffer.concat(buffers)));
  });
}

const RELATIVE_PATH_REGEX = /(^|[/\\])\.{1,2}[/\\]/;
