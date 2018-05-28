"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const git_packet_streams_1 = require("git-packet-streams");
const url_1 = require("url");
const enums_1 = require("./enums");
function createRequest(body, headers, isAdvertisement = false, service, path) {
    return new Promise((resolve, reject) => {
        const requestData = Object.create(null, {
            __signature: {
                enumerable: false,
                value: undefined,
                writable: true,
            },
            body: {
                value: body,
                writable: true,
            },
            capabilities: {
                value: new Map(),
                writable: false,
            },
            commands: {
                value: new Array(),
                writable: false,
            },
            headers: {
                value: headers,
                writable: false,
            },
            isAdvertisement: {
                value: isAdvertisement,
                writable: false,
            },
            path: {
                value: path,
                writable: true,
            },
            service: {
                value: service,
                writable: false,
            },
            signature: {
                enumerable: false,
                value() {
                    if (this.__signature) {
                        return this.__signature;
                    }
                    return this.__signature = crypto_1.createHash("sha256").update(JSON.stringify(this)).digest("hex");
                },
                writable: false,
            },
            state: {
                enumerable: true,
                value: {},
                writable: true,
            },
            status: {
                value: enums_1.RequestStatus.Pending,
                writable: true,
            },
        });
        if (service && !isAdvertisement) {
            const middleware = ServiceReaders.get(service);
            const reader = middleware(requestData);
            const passthrough = git_packet_streams_1.createPacketReader(reader);
            passthrough.on("error", reject);
            passthrough.on("finish", () => resolve(requestData));
            requestData.body = passthrough;
            body.pipe(passthrough);
        }
        else {
            resolve(requestData);
        }
    });
}
exports.createRequest = createRequest;
/**
 * Maps vital request properties to vital service properties.
 * @param fragment Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 */
function mapInputToRequest(fragment, method, content_type) {
    const url = new url_1.URL(fragment, "https://127.0.0.1/");
    // Get advertisement from service
    let results = /^\/?(.*?)\/info\/refs$/.exec(url.pathname);
    if (results) {
        const path = results[1];
        if (method !== "GET") {
            return [true, undefined, path];
        }
        if (!url.searchParams.has("service")) {
            return [true, undefined, path];
        }
        const serviceName = url.searchParams.get("service");
        results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
        if (!results) {
            return [true, undefined, path];
        }
        return [true, results[1], path];
    }
    // Use service directly
    results = /^\/?(.*?)\/(git-[\w\-]+)$/.exec(url.pathname);
    if (results) {
        const path = results[1];
        const serviceName = results[2];
        if (method !== "POST") {
            return [false, undefined, path];
        }
        results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
        if (!results) {
            return [false, undefined, path];
        }
        const service = results[1];
        if (content_type !== `application/x-git-${service}-request`) {
            return [false, undefined, path];
        }
        return [false, service, path];
    }
    return [undefined, undefined, undefined];
}
exports.mapInputToRequest = mapInputToRequest;
/**
 * Maps RequestType to a valid packet reader for request body.
 */
const ServiceReaders = new Map([
    [
        enums_1.ServiceType.ReceivePack,
        (request) => {
            const regex = /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
            return (buffer) => {
                const value = buffer.toString("utf8");
                const results = regex.exec(value);
                if (results) {
                    let kind;
                    if ("0000000000000000000000000000000000000000" === results[1]) {
                        kind = "create";
                    }
                    else if ("0000000000000000000000000000000000000000" === results[2]) {
                        kind = "delete";
                    }
                    else {
                        kind = "update";
                    }
                    const command = {
                        commits: [results[1], results[2]],
                        kind,
                        reference: results[3],
                    };
                    request.commands.push(command);
                    if (results[4]) {
                        for (const c of results[4].trim().split(" ")) {
                            if (/=/.test(c)) {
                                const [k, v] = c.split("=");
                                request.capabilities.set(k, v);
                            }
                            else {
                                request.capabilities.set(c, undefined);
                            }
                        }
                    }
                }
            };
        },
    ],
    [
        enums_1.ServiceType.UploadPack,
        (request) => {
            const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
            return (buffer) => {
                const value = buffer.toString("utf8");
                const results = regex.exec(value);
                if (results) {
                    const metadata = {
                        commits: [results[2]],
                        kind: results[1],
                    };
                    request.commands.push(metadata);
                    if (results[3]) {
                        for (const c of results[3].trim().split(" ")) {
                            if (/=/.test(c)) {
                                const [k, v] = c.split("=");
                                request.capabilities.set(k, v);
                            }
                            else {
                                request.capabilities.set(c, undefined);
                            }
                        }
                    }
                }
            };
        },
    ],
]);
//# sourceMappingURL=request.js.map