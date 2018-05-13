import { ChildProcess, spawn } from "child_process";
import { exists, mkdir } from "fs";
import {
  IHeaders,
  IResponseRawData,
  IService,
  IServiceDriver,
  RequestType,
} from "git-service";
import {
  IncomingMessage,
  OutgoingHttpHeaders,
  request as send,
  RequestOptions,
  STATUS_CODES,
} from "http";
import { request as sendSecure } from "https";
import { join, normalize, resolve } from "path";
import { Readable } from "stream";
import { parse } from "url";
import { promisify } from "util";

/**
 * Error codes thrown by this package.
 */
export enum ErrorCodes {
  /**
   * Something went wrong when executing git bin.
   */
  ERR_FAILED_GIT_EXECUTION = "ERR_FAILED_GIT_EXECUTION",
}

export interface IExecError extends Error {
  code: string;
  exitCode: number;
  stderr: string;
}

/**
 * IServiceDriver options.
 */
export interface IServiceDriverOptions {
  /**
   * Cache for booleans and responses.
   */
  cache?: IServiceDriverCache;
  /**
   * Custom implementation of checkForAccess. Will fallback to default
   * implementation if promise resolves to `undefined`.
   * @param service Service interface with related information
   * @param headers HTTP Headers sent with request
   * @param origin Origin location.
   * @param cache Cache for responses and other return values.
   */
  checkForAccess?(
    service: IService,
    headers: IHeaders,
    origin: string,
    cache?: IServiceDriverCache,
  ): Promise<boolean | undefined>;
  /**
   * Custom implementation of checkIfEnabled. Will fallback to default
   * implementation if promise resolves to `undefined`.
   * @param service Service interface with related information
   * @param origin Origin location.
   * @param cache Cache for responses and other return values.
   */
  checkIfEnabled?(
    service: IService,
    origin: string,
    cache?: IServiceDriverCache,
  ): Promise<boolean | undefined>;
  /**
   * Custom implementation of checkIfExists. Will fallback to default
   * implementation if promise resolves to `undefined`.
   * @param service Service interface with related information
   * @param origin Origin location.
   * @param cache Cache for responses and other return values.
   */
  checkIfExists?(
    service: IService,
    origin: string,
    cache?: IServiceDriverCache,
  ): Promise<boolean | undefined>;
  /**
   * Custom implementation of createAndInitRespository. Will fallback to default
   * implementation if promise resolves to `undefined`.
   * @param service Service interface with related information
   * @param headers HTTP Headers sent with request
   * @param origin Origin location.
   * @param cache Cache for responses and other return values.
   */
  createAndInitRepository?(
    service: IService,
    headers: IHeaders,
    origin: string,
    cache?: IServiceDriverCache,
  ): Promise<boolean | undefined>;
  /**
   * Defautls to use if config for service not found. Only used by the file-
   * system driver.
   */
  serviceEnabledByDefault?: boolean | { [K in RequestType]?: boolean; };
}

/**
 * Service driver cache interface. Stores responses from IServiceDriver.
 */
export interface IServiceDriverCache {
  /**
   * Clears all cached data.
   */
  clear(): Promise<void>;
  /**
   * Returns size of cache.
   */
  size(): Promise<number>;
  /**
   * Deletes an entry from cache.
   */
  delete(key: string): Promise<boolean>;
  /**
   * Creates a new async iterator, iterating over every entry in cache till stopped or finished.
   */
  entries<T extends boolean | IResponseRawData>(): AsyncIterableIterator<[string, T]>;
  /**
   * Gets an entry from cache.
   */
  get<T extends boolean | IResponseRawData>(key: string): Promise<T>;
  /**
   * Checks if a valid entry exists in cache.
   */
  has(key: string): Promise<boolean>;
  /**
   * Sets value for entry in cache.
   */
  set<T extends boolean | IResponseRawData>(key: string, value: T): Promise<void>;
  /**
   * Used by for-await-of loops.
   */
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, boolean | IResponseRawData]>;
}

/**
 * Creates a driver for a remote (http) or local (file-system) origin.
 * @param origin An url or path
 * @param options Extra options.
 */
export function createDriver(origin: string, options: IServiceDriverOptions = {}): IServiceDriver {
  if (/https?:\/\//.test(origin)) {
    return createHttpDriver(origin, options);
  } else {
    return createFileSystemDriver(origin, options);
  }
}

/**
 * Creates a driver for a local origin.
 * @param origin A path
 * @param options Extra options
 */
export function createFileSystemDriver(origin: string, options: IServiceDriverOptions = {}): IServiceDriver {
  if (/file:\/\//.test(origin)) {
    origin = origin.slice(7);
  }
  origin = resolve(normalize(origin));
  return {
    get origin() { return origin; },
    async checkForAccess(service, headers) {
      if (options.checkForAccess) {
        const value = options.checkForAccess(service, headers, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return true;
    },
    checkIfEnabled(service) {
      if (options.checkIfEnabled) {
        const value = options.checkIfEnabled(service, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return checkIfEnabledOnFS(origin, service, options.serviceEnabledByDefault, options.cache);
    },
    checkIfExists(service) {
      if (options.checkIfExists) {
        const value = options.checkIfExists(service, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return checkIfExistsOnFS(origin, service, options.cache);
    },
    createResponse(service) {
      return createFSResponse(origin, service, options.cache);
    },
    async createAndInitRepository(service, headers) {
      if (options.createAndInitRepository) {
        const value = options.createAndInitRepository(service, headers, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return createAndInitRespositoryOnFS(origin, service, options.cache);
    },
  };
}

/**
 * Creates a driver for a remote origin.
 * @param origin An url prefix
 * @param options Extra options
 */
export function createHttpDriver(origin: string, options: IServiceDriverOptions = {}): IServiceDriver {
  return {
    get origin() { return origin; },
    async checkForAccess(service, headers) {
      if (options.checkForAccess) {
        const value = options.checkForAccess(service, headers, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return true;
    },
    checkIfEnabled(service) {
      if (options.checkIfEnabled) {
        const value = options.checkIfEnabled(service, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return checkIfEnabledOverHTTP(origin, service, options.cache);
    },
    checkIfExists(service) {
      if (options.checkIfExists) {
        const value = options.checkIfExists(service, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return checkIfExistsOverHTTP(origin, service, options.cache);
    },
    createResponse(service, headers) {
      return createHTTPResponse(origin, service, headers, options.cache);
    },
    async createAndInitRepository(service, headers) {
      if (options.createAndInitRepository) {
        const value = options.createAndInitRepository(service, headers, origin, options.cache);
        if (value !== undefined) {
          return value;
        }
      }
      return false;
    },
  };
}

/**
 * Creates a simple in-memory cache using a proxy-object leading to a Map
 * instance. It is not meant to be used in production code.
 */
export function createDriverCache(): IServiceDriverCache {
  // TODO: Improve implementation. Very  B A S I C  at the moment.
  const map = new Map<string, any>();
  return {
    async clear() {
      return map.clear();
    },
    async delete(key) {
      return map.delete(key);
    },
    async *entries() {
      for (const pair of map) {
        yield pair;
      }
    },
    async get(key) {
      return map.get(key);
    },
    async has(key) {
      return map.has(key);
    },
    async set(key, value) {
      map.set(key, value);
    },
    async size() {
      return map.size;
    },
    [Symbol.asyncIterator]() {
      return this.entries();
    },
  };
}

async function checkIfExistsOnFS(
  origin: string,
  service: IService,
  cache?: IServiceDriverCache,
): Promise<boolean> {
  let key: string;
  if (cache) {
    key = `${origin};${service.repository};exists`;
    if (await cache.has(key)) {
      return cache.get(key) as Promise<boolean>;
    }
  }
  let value: boolean;
  if (/\.\.?(\/\\)/.test(service.repository)) {
    value = false;
  } else {
    const fullpath = join(origin, service.repository);
    const child = spawn("git", ["ls-remote", fullpath, "HEAD"], {stdio: ["ignore", null, null]});
    const {exitCode} = await waitForChild(child);
    value = exitCode === 0;
  }
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function checkIfEnabledOnFS(
  origin: string,
  service: IService,
  defaults: boolean | { [K in RequestType]?: boolean; } = true,
  cache?: IServiceDriverCache,
): Promise<boolean> {
  let key: string;
  if (cache) {
    key = `${origin};${service.repository};${service.type};enabled`;
    if (await cache.has(key)) {
      return cache.get(key) as Promise<boolean>;
    }
  }
  let value: boolean;
  if (/\.\.?(\/\\)/.test(service.repository)) {
    value = false;
  } else {
    const fullpath = `${origin}/${service.repository}`;
    const command = service.type.replace("-", "");
    const child = spawn("git", ["-C", fullpath, "config", "--bool", `deamon.${command}`]);
    const {exitCode, stdout, stderr} = await waitForChild(child);
    if (exitCode === 1 && !stdout.length) {
      // Return default value for setting when not found in configuration
      return typeof defaults === "boolean" ? defaults : defaults[service.type] || true;
    } else if (exitCode === 0) {
      const output = stdout.toString("utf8");
      value = command === "uploadpack" ? output !== "false" : output === "true";
    } else {
      const error: Partial<IExecError> = new Error("Failed to execute git");
      error.code = ErrorCodes.ERR_FAILED_GIT_EXECUTION;
      error.exitCode = exitCode;
      error.stderr = stderr;
      throw error;
    }
  }
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function checkIfExistsOverHTTP(
  origin: string,
  service: IService,
  cache?: IServiceDriverCache,
): Promise<boolean> {
  const key = `${origin};${service.repository};exists`;
  if (cache && await cache.has(key)) {
    return cache.get(key) as Promise<boolean>;
  }
  let value: boolean;
  if (!service.type || /\.\.?(\/|\\)/.test(service.repository)) {
    value = false;
  } else {
    const url = `${origin}/${service.repository}/info/refs?service=git-upload-pack`;
    const response = await waitForResponse(url, "GET");
    value = response.statusCode === 200 || response.statusCode === 304;
  }
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function checkIfEnabledOverHTTP(
  origin: string,
  service: IService,
  cache?: IServiceDriverCache,
): Promise<boolean> {
  const key = `${origin};${service.repository};${service.type};enabled`;
  if (cache && await cache.has(key)) {
    return cache.get(key) as Promise<boolean>;
  }
  let value: boolean;
  if (!service.type || /\.\.?(\/|\\)/.test(service.repository)) {
    value = false;
  } else {
    const url = `${origin}/${service.repository}/info/refs?service=git-${service.type}`;
    const response = await waitForResponse(url, "GET");
    value = response.statusCode === 200 || response.statusCode === 304;
  }
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function createFSResponse(
  origin: string,
  service: IService,
  cache?: IServiceDriverCache,
): Promise<IResponseRawData> {
  let key: string;
  if (cache) {
    key = `${origin};${await service.createSignature("request")};response`;
    if (await cache.has(key)) {
      return cache.get(key) as Promise<IResponseRawData>;
    }
  }
  let value: IResponseRawData;
  if (!/\.\.?(\/\\)/.test(service.repository)) {
    const fullpath = join(origin, service.repository);
    const args = ["-C", fullpath, service.type, service.isAdvertisement ? "--advertise-refs" : "--stateless-rpc", "."];
    const child = spawn("git", args);
    if (service.isAdvertisement) {
      service.body.pipe(child.stdin);
    }
    const {exitCode, stdout, stderr} = await waitForChild(child);
    if (exitCode !== 0) {
      const error: Partial<IExecError> = new Error("Failed to execute git");
      error.code = ErrorCodes.ERR_FAILED_GIT_EXECUTION;
      error.exitCode = exitCode;
      error.stderr = stderr;
      throw error;
    }
    value = {
      body: stdout,
      statusCode: 200,
      statusMessage: STATUS_CODES[200],
    };
  }
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function createHTTPResponse(
  origin: string,
  service: IService,
  inHeaders: IHeaders,
  cache?: IServiceDriverCache,
): Promise<IResponseRawData> {
  let key: string;
  if (cache) {
    key = `${origin};${await service.createSignature("request")};response`;
    if (await cache.has(key)) {
      return cache.get(key) as Promise<IResponseRawData>;
    }
  }
  const typePrefix = service.isAdvertisement ? "info/refs?service=" : "";
  const url = `${origin}/${service.repository}/${typePrefix}git-${service.type}`;
  const method = service.isAdvertisement ? "GET" : "POST";
  const response = await waitForResponse(url, method, inHeaders.toJSON(), service.body);
  const value = {
    body: await waitForBuffer(response),
    headers: response.headers,
    statusCode: response.statusCode,
    statusMessage: response.statusMessage,
  };
  if (cache) {
    await cache.set(key, value);
  }
  return value;
}

async function createAndInitRespositoryOnFS(
  origin: string,
  service: IService,
  cache?: IServiceDriverCache,
): Promise<boolean> {
  // TODO: Imeplement this later.
  //       (Should recurr mkdir till target directory is made and init (a bare) git in target directory)
  return false;
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

function waitForBuffer(readable: Readable): Promise<Buffer> {
  return new Promise<Buffer>((ok, error) => {
    const buffers: Buffer[] = [];
    readable.once("error", error);
    readable.on("data", (b: Buffer) => buffers.push(b));
    readable.once("close", () => ok(Buffer.concat(buffers)));
  });
}

interface IExecutionResult {
  exitCode: number;
  stdout: Buffer;
  stderr: string;
}
