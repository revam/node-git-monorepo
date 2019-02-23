import { ChildProcess, spawn } from "child_process";
import { PathLike, stat as STAT } from "fs";
import fetch from "node-fetch";
import { isAbsolute, join, resolve } from "path";
import { PassThrough, Readable } from "stream";
import { promisify } from "util";
import { Context } from "./context";
import { ErrorCodes, Service } from "./enums";
import { IError, IOuterError, ServiceDriver } from "./main";

const stat = promisify(STAT);
const isDirectory = async (path: PathLike): Promise<boolean> => stat(path).then((s) => s.isDirectory()).catch(() => false);

/**
 * A generic implementation of the {@link ServiceDriver} interface for both
 * file-system access and/or forwarding to other remote http(s) servers.
 *
 * @remarks
 *
 * All public `check*` methods can be proxied through `options.methods`.
 *
 * @public
 */
export class GenericDriver implements ServiceDriver {
  /**
   * Defaults for {@link GenericDriver.checkFSIfEnabled}.
   *
   * @remarks
   *
   * When no default is set for {@link Service | given service}
   * in the repository configuration, the corresponding value from this object
   * is used.
   */
  protected readonly enabledDefaults: Readonly<Record<Service, boolean>>;

  /**
   * Default repository storage location.
   *
   * @remarks
   *
   * Is either an absolute path, an URL leading to a remote repository
   * server, or `undefined`.
   *
   * If value is `undefined` then each request should be rewritten for a remote
   * server location, or else it will silently fail.
   */
  protected readonly origin?: string;

  /**
   * Indicate if origin is a remote location.
   *
   * @remarks
   *
   * Is true if {@link GenericDriver.origin | origin} is defined and
   * {@link GenericDriver.originIsRemote} evaluates to true.
   */
  protected readonly originIsRemote: boolean;

  /**
   * Check if `input` has either http- or https-protocol, or only https-protocol.
   *
   * @remarks
   *
   * It is determined if it only checks for https protocol by setting
   * {@link GenericDriverOptions.httpsOnly} to true. If it is
   * otherwise false or undefined then this function will check for http- or
   * https-protocols.
   */
  private readonly isURL: (input: string) => boolean;

  /**
   * Create the tailing part of the remote URL.
   *
   * @remarks
   *
   * Output of this function will be directly appended to the the base URL.
   *
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   * @returns Tail of remote URL.
   */
  private readonly getRemoteTail: (service: Service, advertise: boolean) => string;

  /**
   * Creates a new instance of {@link GenericDriver}.
   *
   * @param options - {@link GenericDriverOptions | Optional options}.
   */
  public constructor(options?: GenericDriverOptions);
  /**
   * Creates a new instance of {@link GenericDriver}.
   *
   * @param origin - Default repository storage location, given as a relative path,
   *                 absolute path, or URL to a remote server.
   * @param options - {@link GenericDriverOptions | Optional options}.
   *                  Property {@link GenericDriverOptions.origin | `origin`}
   *                  will be ignored, because it is supplied seperatly.
   */
  public constructor(origin: string, options?: GenericDriverOptions);
  public constructor(origin?: string | GenericDriverOptions, options: GenericDriverOptions = {}) {
    if (typeof origin === "object") {
      options = origin;
      origin = options.origin;
      delete options.origin;
    }
    this.isURL = options.httpsOnly ? hasHttpsProtocol : hasHttpOrHttpsProtocol;
    this.getRemoteTail = options.remoteTail ? options.remoteTail.bind(undefined)
      : ((s, a) => a ? `/info/refs?service=git-${s}` : `/git-${s}`);
    if (typeof origin === "string" && origin.length > 0) {
      const isRemote = this.isURL(origin);
      // Resolve path if it is not an url and not absolute.
      if (!isRemote && !isAbsolute(origin)) {
        origin = resolve(origin);
      }
      // Strip trailing slash if found
      if (origin.length > 1 && origin.endsWith("/")) {
        origin = origin.substring(0, origin.length - 1);
      }
      this.origin = origin;
      this.originIsRemote = isRemote;
    }
    else {
      this.origin = undefined;
      this.originIsRemote = false;
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
            return async (...args: any[]): Promise<any> => {
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

  /**
   * Combine `baseURL` with the result of `GenericDriver.getRemoteTail`.
   *
   * @param baseURL - Remote repository location as a URL without trailing slash.
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   * @returns The full URL-string.
   */
  protected remoteURL(baseURL: string, service: Service, advertise: boolean): string {
    return baseURL + this.getRemoteTail(service, advertise);
  }

  /**
   * Prepare path and report findings.
   *
   * @remarks
   *
   * Should check path and validate if it is valid and if it is an URL.
   *
   * @param context - Context to prepare for.
   */
  protected preparePath(context: Context): { isValid: boolean; isHttp: boolean } {
    let path = context.path;
    let isValid = false;
    let isHttp = false;
    // Path must be provided and not contain any segments equal to "." or "..".
    if (typeof path === "string" && !RELATIVE_PATH_REGEX.test(path)) {
      // Sanetise input
      if (!path.length) {
        path = "/";
      }
      else if (!path.endsWith("/")) {
        path += "/";
      }
      // Check if path is a **valid** URL-string.
      if (this.isURL(path)) {
        isValid = isHttp = true;
      }
      // Then check for origin
      else if (this.origin) {
        if (this.originIsRemote) {
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
      // And last, check if path is absolute
      else if (isAbsolute(path)) {
        isValid = true;
      }
      context.path = path;
    }
    return { isHttp, isValid };
  }

  /**
   * {@inheritdoc ServiceDriver.checkForAuth}
   */
  public checkForAuth(): Promise<boolean> | boolean {
    // No built-in access control.
    return true;
  }

  /**
   * {@inheritdoc ServiceDriver.checkIfEnabled}
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    if (context.service) {
      const { isValid, isHttp } = this.preparePath(context);
      if (isValid) {
        return isHttp ? this.checkHTTPIfEnabled(context) : this.checkFSIfEnabled(context);
      }
    }
    return false;
  }

  protected async checkHTTPIfEnabled(context: Context): Promise<boolean> {
    const url = this.remoteURL(context.path!, context.service!, true);
    const response = await fetch(url, { method: "HEAD" });
    return Boolean(response.status < 300 && response.status >= 200);
  }

  protected async checkFSIfEnabled(context: Context): Promise<boolean> {
    const command = context.service!.replace("-", "");
    const child = spawn("git", ["-C", context.path!, "config", "--bool", `deamon.${command}`]);
    const { exitCode, stdout, stderr } = await waitForChild(child);
    if (exitCode === 0) {
      const output = stdout.toString("utf8");
      return command === "uploadpack" ? output !== "false" : output === "true";
    }
    // Return default value for setting when not found in configuration
    if (!stdout.length && !stderr.length) {
      return this.enabledDefaults[context.service!];
    }
    throw createProcessError(exitCode, stderr);
  }
  public async checkIfExists(context: Context): Promise<boolean> {
    const { isValid, isHttp } = this.preparePath(context);
    if (isValid) {
      return isHttp ? this.checkHTTPIfExists(context) : this.checkFSIfExists(context);
    }
    return false;
  }

  protected async checkHTTPIfExists(context: Context): Promise<boolean> {
    const url = this.remoteURL(context.path!, Service.UploadPack, true);
    const response = await fetch(url, { method: "HEAD" });
    return Boolean(response.status >= 200 && response.status < 300);
  }

  protected async checkFSIfExists(context: Context): Promise<boolean> {
    if (!context.path || !(await isDirectory(context.path))) {
      return false;
    }
    const child = spawn("git", ["ls-remote", context.path, "HEAD"], { stdio: ["ignore", null, null] });
    const { exitCode } = await waitForChild(child);
    return exitCode === 0;
  }

  /**
   * {@inheritdoc ServiceDriver.serve}
   */
  public async serve(context: Context): Promise<void> {
    if (context.service) {
      const { isValid, isHttp } = this.preparePath(context);
      if (isValid) {
        return isHttp ? this.serveHTTP(context) : this.serveFS(context);
      }
    }
  }

  protected async serveHTTP(context: Context): Promise<void> {
    const url = this.remoteURL(context.path!, context.service!, context.advertisement);
    const response = await fetch(url, {
      body: context.request.toReadable(),
      headers: context.request.headers,
      method: context.advertisement ? "GET" : "POST",
    });
    context.statusCode = response.status;
    context.body = response.body.pipe(new PassThrough())[Symbol.asyncIterator]();
    for (const [header, value] of response.headers) {
      context.set(header, value);
    }
  }

  protected async serveFS(context: Context): Promise<void> {
    // Short-circut if directory don't exist.
    if (await isDirectory(context.path!)) {
      const option = context.advertisement ? "--advertise-refs" : "--stateless-rpc";
      const child = spawn("git", ["-C", context.path!, context.service!, option, "."]);
      if (!context.advertisement) {
        context.request.toReadable().pipe(child.stdin);
      }
      context.statusCode = 200;
      context.body = child.stdout[Symbol.asyncIterator]();
      context.type = `application/x-git-${context.service}-${context.advertisement ? "advertisement" : "result"}`;
    }
    else {
      context.statusCode = 404;
      context.body = undefined;
      context.type = undefined;
    }
  }
}

/**
 * Options for {@link GenericDriver}.
 *
 * @public
 */
export interface GenericDriverOptions {
  /**
   * Default values for enabled-check with file-system driver.
   */
  enabledDefaults?: boolean | Partial<Record<Service, boolean>>;
  /**
   * Only check for https protocol.
   */
  httpsOnly?: boolean;
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
  /**
   * Create the tailing part of the remote URL.
   *
   * @remarks
   *
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   */
  remoteTail?(service: Service, advertise: boolean): string;
}

/**
 * An error thrown from a proxied driver method.
 *
 * @public
 */
export interface ProxyError extends IOuterError {
  methodName: string;
  inner: Error;
}

/**
 * An error thrown from the execution of a child process.
 *
 * @public
 */
export interface ProcessError extends IError {
  exitCode: number;
  stderr: string;
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
type ProxiedMethods = {
  [P in keyof Exclude<ServiceDriver, "serve">]?: (
    context: Context,
  ) => ReturnType<ServiceDriver[P]> | void | PromiseLike<void>;
};

function hasHttpsProtocol(uriOrPath?: string): boolean {
  return Boolean(uriOrPath && /^https:\/\//.test(uriOrPath));
}

function hasHttpOrHttpsProtocol(uriOrPath?: string): boolean {
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

function createProcessError(exitCode: number, stderr: string): ProcessError {
  const error: Partial<ProcessError> = new Error("Failed to execute git");
  error.code = ErrorCodes.ERR_FAILED_GIT_EXECUTION;
  error.exitCode = exitCode;
  error.stderr = stderr;
  return error as ProcessError;
}

function createProxiedError(innerError: Error, methodName: string) {
  const error: Partial<ProxyError> = new Error(`Proxied method ${methodName} failed: ${innerError.message}`);
  error.code = ErrorCodes.ERR_FAILED_PROXY_METHOD;
  error.inner = innerError;
  error.methodName = methodName;
  error.stack = innerError.stack;
  throw error as ProxyError;
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
