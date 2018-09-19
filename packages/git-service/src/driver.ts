import { ChildProcess, spawn } from "child_process";
import { IncomingMessage, OutgoingHttpHeaders, request as send, RequestOptions } from "http";
import { request as sendSecure } from "https";
import { join } from "path";
import { Readable } from "stream";
import { parse } from "url";
import { ErrorCodes, ServiceType } from "./enums";
import {
  IDriver,
  IDriverError,
  IGenericDriverOptions,
  IProxiedError,
} from "./interfaces";

/**
 * Creates an `IDriver` compatible object.
 *
 * @param options Options object. Must contain property `origin`.
 */
export function createDriver(options: IGenericDriverOptions): IDriver;
/**
 * Creates an `IDriver` compatible object.
 *
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options.
 */
export function createDriver(origin: string, options?: IGenericDriverOptions): IDriver;
/**
 * Creates an `IDriver` compatible object.
 *
 * @param originOrOptions Origin location or options
 * @param options Extra options. Ignored if `originOrOptions` is an object.
 */
export function createDriver(originOrOptions: string | IGenericDriverOptions, options?: IGenericDriverOptions): IDriver;
export function createDriver(origin: string | IGenericDriverOptions, options: IGenericDriverOptions = {}): IDriver {
  if (typeof origin === "object") {
    options = origin;
    if (!options.origin) {
      throw new TypeError("argument `origin` is expected, either as part of `options` or as first argument");
    }
    origin = options.origin;
  }
  const driver = /^https?:\/\//.test(origin) ?
    createWebDriver(origin) : createFileSystemDriver(origin, options.enabledDefaults);
  if (options.methods) {
    const methods = options.methods;
    return new Proxy(driver, {
      get(target, prop, receiver) {
        if (ProxyMethods.has(prop as any) && prop in methods) {
          return async(...args) => {
            try {
              const value = await methods[prop].apply(receiver, args);
              if (value !== undefined) {
                return value;
              }
            } catch (error) {
              throw createProxiedError(error, prop as string);
            }
            return target[prop].apply(receiver, args);
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
  return driver;
}

/**
 * Creates an IDriver compatible object for use on the file system.
 * @param origin Repositories root folder
 * @param enabledDefaults Service usage defaults
 */
export function createFileSystemDriver(
  origin: string,
  enabledDefaults: boolean | { [K in ServiceType]?: boolean; } = true,
): IDriver {
  return {
    // No access control built-in.
    checkForAccess(): boolean {
      return true;
    },
    async checkIfEnabled(request): Promise<boolean> {
      if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return false;
      }
      const fullpath = join(origin, request.path);
      const command = request.service.replace("-", "");
      const child = spawn("git", ["-C", fullpath, "config", "--bool", `deamon.${command}`]);
      const {exitCode, stdout, stderr} = await waitForChild(child);
      if (exitCode === 0) {
        const output = stdout.toString("utf8");
        return command === "uploadpack" ? output !== "false" : output === "true";
      }
      // Return default value for setting when not found in configuration
      if (!stdout.length) {
        if (typeof enabledDefaults === "boolean") {
          return enabledDefaults;
        }
        return enabledDefaults && enabledDefaults[request.service] || true;
      }
      throw createDriverError(exitCode, stderr);
    },
    async checkIfExists(request): Promise<boolean> {
      if (request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return false;
      }
      const fullpath = join(origin, request.path);
      const child = spawn("git", ["ls-remote", fullpath, "HEAD"], {stdio: ["ignore", null, null]});
      const {exitCode} = await waitForChild(child);
      return exitCode === 0;
    },
    async serve(request, response): Promise<void> {
      if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return;
      }
      const fullpath = join(origin, request.path);
      const option = request.isAdvertisement ? "--advertise-refs" : "--stateless-rpc";
      const child = spawn("git", ["-C", fullpath, request.service, option, "."]);
      if (!request.isAdvertisement) {
        request.body.pipe(child.stdin);
      }
      const {exitCode, stdout, stderr} = await waitForChild(child);
      if (exitCode !== 0) {
        throw createDriverError(exitCode, stderr);
      }
      response.body = stdout;
      // ALLWAYS ignore previous status code/message
      response.statusCode = 200;
    },
  };
}

/**
 * Creates an IDriver compatible object for use over http(s).
 * @param origin Origin location URL
 */
export function createWebDriver(origin: string): IDriver {
  return {
    // No access control built-in.
    checkForAccess(): boolean {
      return true;
    },
    async checkIfEnabled(request): Promise<boolean> {
      if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return false;
      }
      const url = `${origin}/${request.path}/info/refs?service=git-${request.service}`;
      const response = await waitForResponse(url, "HEAD");
      return Boolean(response.statusCode && response.statusCode < 300 && response.statusCode >= 200);
    },
    async checkIfExists(request): Promise<boolean> {
      if (request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return false;
      }
      const url = `${origin}/${request.path}/info/refs?service=git-upload-pack`;
      const response = await waitForResponse(url, "HEAD");
      return Boolean(response.statusCode && response.statusCode < 300 && response.statusCode >= 200);
    },
    async serve(request, response): Promise<void> {
      if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
        return;
      }
      const typePrefix = request.isAdvertisement ? "info/refs?service=" : "";
      const url = `${origin}/${request.path}/${typePrefix}git-${request.service}`;
      const method = request.isAdvertisement ? "GET" : "POST";
      const message = await waitForResponse(url, method, request.headers.toJSON(), request.body);
      for (const [header, value] of Object.entries(message.headers)) {
        response.headers.set(header, value);
      }
      response.body = await waitForBuffer(message);
      // ALLWAYS ignore previous status code/message
      response.statusCode = message.statusCode!;
    },
  };
}

// Based on function exec() from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
async function waitForChild(child: ChildProcess): Promise<IExecutionResult> {
  const result = Promise.all([
    new Promise<number>((_, r) => child.once("error", r).once("exit", _)),
    waitForBuffer(child.stdout),
    waitForBuffer(child.stderr).then((buffer) => buffer.toString("utf8")),
  ]);
  try {
    const [exitCode, stdout, stderr] = await result;
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
function waitForResponse(
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

function createProxiedError(innerError: any, methodName: string) {
  const error: Partial<IProxiedError> = new Error("Failed to execute proxied method");
  error.code = ErrorCodes.ERR_FAILED_PROXY_METHOD;
  error.inner = innerError;
  error.methodName = methodName;
  throw error as IProxiedError;
}

interface IExecutionResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}

function waitForBuffer(readable: Readable): Promise<Buffer> {
  return new Promise<Buffer>((ok, error) => {
    const buffers: Buffer[] = [];
    readable.once("error", error);
    readable.on("data", (b: Buffer) => buffers.push(b));
    readable.once("close", () => ok(Buffer.concat(buffers)));
  });
}

const ProxyMethods = new Set(["checkForAccess", "checkIfExists", "checkIfEnabled"]);

const RELATIVE_PATH_REGEX = /\.{1,2}[/\\]/;
