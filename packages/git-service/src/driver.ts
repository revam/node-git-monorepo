import { ChildProcess, spawn } from "child_process";
import { IncomingMessage, OutgoingHttpHeaders, request as send, RequestOptions } from "http";
import { request as sendSecure } from "https";
import { join } from "path";
import { Readable } from "stream";
import { parse } from "url";
import { ErrorCodes, ServiceType } from "./enums";
import { IDriver, IDriverError, IDriverResponseData, IGenericDriverOptions, IProxiedDriverMethods } from "./interfaces";

/**
 * Creates an IGitDriver compatible object.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export function createDriver(origin: string, options: IGenericDriverOptions): IDriver {
  let driver = /https?:\/\//.test(origin) ?
    createWebDriver(origin) : createFileSystemDriver(origin, options.enabledDefaults);
  if (options.methods) {
    driver = createProxiedDriver(driver, options.methods);
  }
  return driver;
}

/**
 * Creates an IDriver compatible object with some proxied methods.
 * @param driver Original driver object
 * @param methods Proxy methods
 */
export function createProxiedDriver(driver: IDriver, methods: IProxiedDriverMethods): IDriver {
  return new Proxy(driver, {
    get(target, prop, receiver) {
      if (DriverMethods.has(prop as any) && Reflect.has(methods, prop)) {
        return async(...args) => {
          const value = await methods[prop].apply(receiver, args);
          if (value !== undefined) {
            return value;
          }
          return target[prop].apply(receiver, args);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
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
    checkForAccess(): boolean {
      return true;
    },
    async checkIfEnabled(request): Promise<boolean> {
      if (/\.\.?(\/\\)/.test(request.path)) {
        return false;
      }
      const fullpath = `${origin}/${request.path}`;
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
    async checkIfExists(request) {
      if (/\.\.?(\/\\)/.test(request.path)) {
        return false;
      }
      const fullpath = join(origin, request.path);
      const child = spawn("git", ["ls-remote", fullpath, "HEAD"], {stdio: ["ignore", null, null]});
      const {exitCode} = await waitForChild(child);
      return exitCode === 0;
    },
    async createResponse(request): Promise<IDriverResponseData> {
      if (/\.\.?(\/\\)/.test(request.path)) {
        return;
      }
      const fullpath = join(origin, request.path);
      const option = request.isAdvertisement ? "--advertise-refs" : "--stateless-rpc";
      const args = ["-C", fullpath, request.service, option, "."];
      const child = spawn("git", args);
      if (!request.isAdvertisement) {
        request.body.pipe(child.stdin);
      }
      const {exitCode, stdout, stderr} = await waitForChild(child);
      if (exitCode !== 0) {
        throw createDriverError(exitCode, stderr);
      }
      return {
        body: stdout,
        statusCode: 200,
      };
    },
  };
}

/**
 * Creates an IDriver compatible object for use over http(s).
 * @param origin Origin location URL
 */
export function createWebDriver(origin: string, keyvAdapter?: string): IDriver {
  return {
    checkForAccess() {
      return true;
    },
    async checkIfEnabled(request) {
      if (!request.service || /\.\.?(\/|\\)/.test(request.path)) {
        return false;
      }
      const url = `${origin}/${request.path}/info/refs?service=git-${request.service}`;
      const response = await waitForResponse(url, "GET");
      return response.statusCode < 300 && response.statusCode >= 200;
    },
    async checkIfExists(request) {
      if (!request.service || /\.\.?(\/|\\)/.test(request.path)) {
        return false;
      }
      const url = `${origin}/${request.path}/info/refs?service=git-upload-pack`;
      const response = await waitForResponse(url, "GET");
      return response.statusCode < 300 && response.statusCode >= 200;
    },
    async createResponse(request, onResponse): Promise<IDriverResponseData> {
      const typePrefix = request.isAdvertisement ? "info/refs?service=" : "";
      const url = `${origin}/${request.path}/${typePrefix}git-${request.service}`;
      const method = request.isAdvertisement ? "GET" : "POST";
      const response = await waitForResponse(url, method, request.headers.toJSON(), request.body);
      onResponse.addOnce(({headers}) => {
        for (const [header, value] of Object.entries(response.headers)) {
          headers.set(header, value);
        }
      });
      return {
        body: await waitForBuffer(response),
        statusCode: response.statusCode,
        statusMessage: response.statusMessage,
      };
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
  method: string,
  headers?: OutgoingHttpHeaders,
  body?: Readable,
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
      body.pipe(request);
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

const DriverMethods = new Set(["checkForAccess", "checkIfExists", "checkIfEnabled"]);
