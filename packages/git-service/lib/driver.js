"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const child_process_1 = require("child_process");
const http_1 = require("http");
const https_1 = require("https");
const path_1 = require("path");
const url_1 = require("url");
const enums_1 = require("./enums");
/**
 * Creates an IGitDriver compatible object.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
function createDriver(origin, options = {}) {
    let driver = /https?:\/\//.test(origin) ?
        createWebDriver(origin) : createFileSystemDriver(origin, options.enabledDefaults);
    if (options.methods) {
        driver = createProxiedDriver(driver, options.methods);
    }
    return driver;
}
exports.createDriver = createDriver;
/**
 * Creates an IDriver compatible object with some proxied methods.
 * @param driver Original driver object
 * @param methods Proxy methods
 */
function createProxiedDriver(driver, methods) {
    return new Proxy(driver, {
        get(target, prop, receiver) {
            if (ProxyMethods.has(prop) && prop in methods) {
                return async (...args) => {
                    try {
                        const value = await methods[prop].apply(receiver, args);
                        if (value !== undefined) {
                            return value;
                        }
                    }
                    catch (error) {
                        throw createProxiedError(error, prop);
                    }
                    return target[prop].apply(receiver, args);
                };
            }
            return Reflect.get(target, prop, receiver);
        },
    });
}
exports.createProxiedDriver = createProxiedDriver;
/**
 * Creates an IDriver compatible object for use on the file system.
 * @param origin Repositories root folder
 * @param enabledDefaults Service usage defaults
 */
function createFileSystemDriver(origin, enabledDefaults = true) {
    return {
        checkForAccess() {
            return true;
        },
        async checkIfEnabled(request) {
            if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return false;
            }
            const fullpath = path_1.join(origin, request.path);
            const command = request.service.replace("-", "");
            const child = child_process_1.spawn("git", ["-C", fullpath, "config", "--bool", `deamon.${command}`]);
            const { exitCode, stdout, stderr } = await waitForChild(child);
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
            if (request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return false;
            }
            const fullpath = path_1.join(origin, request.path);
            const child = child_process_1.spawn("git", ["ls-remote", fullpath, "HEAD"], { stdio: ["ignore", null, null] });
            const { exitCode } = await waitForChild(child);
            return exitCode === 0;
        },
        async createResponse(request) {
            if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return;
            }
            const fullpath = path_1.join(origin, request.path);
            const option = request.isAdvertisement ? "--advertise-refs" : "--stateless-rpc";
            const child = child_process_1.spawn("git", ["-C", fullpath, request.service, option, "."]);
            if (!request.isAdvertisement) {
                request.body.pipe(child.stdin);
            }
            const { exitCode, stdout, stderr } = await waitForChild(child);
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
exports.createFileSystemDriver = createFileSystemDriver;
/**
 * Creates an IDriver compatible object for use over http(s).
 * @param origin Origin location URL
 */
function createWebDriver(origin) {
    return {
        checkForAccess() {
            return true;
        },
        async checkIfEnabled(request) {
            if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return false;
            }
            const url = `${origin}/${request.path}/info/refs?service=git-${request.service}`;
            const response = await waitForResponse(url, "GET");
            return response.statusCode < 300 && response.statusCode >= 200;
        },
        async checkIfExists(request) {
            if (request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return false;
            }
            const url = `${origin}/${request.path}/info/refs?service=git-upload-pack`;
            const response = await waitForResponse(url, "GET");
            return response.statusCode < 300 && response.statusCode >= 200;
        },
        async createResponse(request, onResponse) {
            if (request.service === undefined || request.path === undefined || RELATIVE_PATH_REGEX.test(request.path)) {
                return;
            }
            const typePrefix = request.isAdvertisement ? "info/refs?service=" : "";
            const url = `${origin}/${request.path}/${typePrefix}git-${request.service}`;
            const method = request.isAdvertisement ? "GET" : "POST";
            const response = await waitForResponse(url, method, request.headers.toJSON(), request.body);
            onResponse.addOnce(({ headers }) => {
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
exports.createWebDriver = createWebDriver;
// Based on function exec() from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
async function waitForChild(child) {
    const result = Promise.all([
        new Promise((_, r) => child.once("error", r).once("exit", _)),
        waitForBuffer(child.stdout),
        waitForBuffer(child.stderr).then((buffer) => buffer.toString("utf8")),
    ]);
    try {
        const [exitCode, stdout, stderr] = await result;
        return { exitCode, stdout, stderr };
    }
    catch (error) {
        return { exitCode: -1, stdout: Buffer.alloc(0), stderr: error && error.message || "Unkonwn error" };
    }
}
function waitForResponse(url, method, headers, body) {
    return new Promise((ok, error) => {
        const parsedUrl = url_1.parse(url);
        const options = {
            headers,
            host: parsedUrl.host,
            method,
            path: parsedUrl.path,
            port: parsedUrl.port,
            protocol: parsedUrl.protocol,
        };
        const request = (parsedUrl.protocol === "https:" ? https_1.request : http_1.request)(options, ok);
        request.once("error", error);
        if (method === "POST") {
            body.pipe(request);
        }
        else {
            request.end();
        }
    });
}
function createDriverError(exitCode, stderr) {
    const error = new Error("Failed to execute git");
    error.code = enums_1.ErrorCodes.ERR_FAILED_GIT_EXECUTION;
    error.exitCode = exitCode;
    error.stderr = stderr;
    return error;
}
function createProxiedError(innerError, methodName) {
    const error = new Error("Failed to execute proxied method");
    error.code = enums_1.ErrorCodes.ERR_FAILED_PROXY_METHOD;
    error.inner = innerError;
    error.methodName = methodName;
    throw error;
}
function waitForBuffer(readable) {
    return new Promise((ok, error) => {
        const buffers = [];
        readable.once("error", error);
        readable.on("data", (b) => buffers.push(b));
        readable.once("close", () => ok(Buffer.concat(buffers)));
    });
}
const ProxyMethods = new Set(["checkForAccess", "checkIfExists", "checkIfEnabled"]);
const RELATIVE_PATH_REGEX = /\.{1,2}[/\\]/;
//# sourceMappingURL=driver.js.map