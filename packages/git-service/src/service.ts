
import { createHash } from "crypto";
import { concatPacketBuffers, createPacketReader, readPacketLength } from "git-packet-streams";
import * as encode from "git-side-band-message";
import { STATUS_CODES } from "http";
import { Readable } from "stream";
import { RequestStatus, RequestType } from "./enums";
import { Headers } from "./headers";
import { inspectServiceDriver } from "./helpers";
import {
  IReceivePackCommand,
  IRequestData,
  IResponseData,
  IResponseRawData,
  IService,
  IServiceDriver,
  IServiceInput,
  IUploadPackCommand,
} from "./interfaces";
import { Signal } from "./signal";

export { Service as default };

/**
 * Reference implementation of IService. Works with all valid driver implementation.
 */
export class Service implements IService {
  public readonly driver: IServiceDriver;
  public readonly awaitRequestData: Promise<IRequestData>;
  public readonly awaitResponseData: Promise<IResponseData>;
  public readonly isAdvertisement: boolean;
  public readonly onError: Signal<any>;
  public readonly onRequest: Signal<IRequestData>;
  public readonly onResponse: Signal<IResponseData>;
  public readonly body: Readable;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
  public repository: string;
  private __headers: Headers;
  private __messages: Buffer[];
  private __repository?: string;
  private __signatures: Map<string, string>;
  private __status: RequestStatus;

  /**
   * Creates a new service compatible with IService interface.
   * @param driver Service driver to use.
   * @param data Input data
   * @throws {TypeError}
   */
  constructor(driver: IServiceDriver, data: IServiceInput) {
    inspectServiceDriver(driver);
    if (typeof data !== "object") {
      throw new TypeError("argument `data` must be of type 'object'");
    }
    this.__headers = new Headers(data.headers);
    this.__messages = [];
    this.__status = RequestStatus.Pending;
    this.__repository = data.repository;
    this.__signatures = new Map();
    Object.defineProperties(this, {
      driver: {
        value: driver,
        writable: false,
      },
      isAdvertisement: {
        value: data.isAdvertisement,
        writable: false,
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
      onRequest: {
        value: new Signal(),
        writable: false,
      },
      onResponse: {
        value: new Signal(),
        writable: false,
      },
      repository: {
        get(this: Service) {
          return this.__repository;
        },
        set(this: Service, value) {
          if (this.__repository !== value) {
            this.__signatures.delete("request");
            this.__signatures.delete("shared");
            this.__repository = value;
          }
        },
      },
      status: {
        get(this: Service) {
          return this.__status;
        },
      },
      type: {
        value: data.requestType,
        writable: false,
      },
    });
    Object.defineProperties(this, {
      awaitRequestData: {
        value: new Promise<IRequestData>((resolve, reject) => {
          this.onError.addOnce(reject);
          this.onRequest.addOnce(resolve);
        }),
        writable: false,
      },
      awaitResponseData: {
        value: new Promise<IResponseData>((resolve, reject) => {
          this.onError.addOnce(reject);
          this.onResponse.addOnce(resolve);
        }),
        writable: false,
      },
    });
    if (this.type && !this.isAdvertisement) {
      const middleware = PacketMapper.get(this.type);
      const reader = middleware((payload) => this.dispatchRequest(payload));
      const passthrough = createPacketReader(reader);
      passthrough.on("error", (error) => this.onError.dispatch(error));
      data.body.pipe(passthrough);
      Object.defineProperty(this, "body", {
        value: passthrough,
        writable: false,
      });
    } else {
      this.dispatchRequest({capabilities: new Map(), commands: []});
      Object.defineProperty(this, "body", {
        value: data.body,
        writable: false,
      });
    }
  }

  public async accept(): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }
    this.__status = RequestStatus.Accepted;
    if (!this.type) {
      return;
    }
    try {
      const output = await this.driver.createResponse(this, this.__headers);
      if (output.statusCode >= 400) {
        this.__status = RequestStatus.Failure;
        this.createRejectedResponse(output);
      } else {
        this.createAcceptedResponse(output);
      }
    } catch (err) {
      this.onError.dispatch(err);
    }
  }

  private createAcceptedResponse(payload: IResponseRawData) {
    let packets: Buffer[];
    const headers = new Headers(payload.headers);
    if (payload.body) {
      if (this.isAdvertisement) {
        const header = AdHeaders[this.type];
        packets = payload.body.slice(0, header.length).equals(header) ? [payload.body] : [header, payload.body];
        headers.set("Content-Type", `application/x-git-${this.type}-advertisement`);
      } else {
        packets = [payload.body, ...this.__messages];
        headers.set("Content-Type", `application/x-git-${this.type}-result`);
      }
      headers.set("Content-Length", packets.reduce((p, c) => p + c.length, 0).toString());
    }
    const body = concatPacketBuffers(packets, !this.isAdvertisement && this.__messages.length ? 0 : undefined);
    this.dispatchResponse({
      body,
      headers,
      statusCode: payload.statusCode,
      statusMessage: payload.statusMessage,
    });
  }

  public async reject(statusCode?: number, statusMessage?: string): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }
    this.__status = RequestStatus.Rejected;
    if (!(statusCode < 600 && statusCode >= 400)) {
      statusCode = 403;
    }
    if (!(statusMessage && typeof statusMessage === "string")) {
      statusMessage = STATUS_CODES[statusCode] || "";
    }
    this.createRejectedResponse({statusCode, statusMessage});
  }

  private createRejectedResponse(payload: IResponseRawData) {
    const headers = new Headers(payload.headers);
    let body: Buffer;
    if (!payload.body) {
      body = Buffer.from(payload.statusMessage);
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Length", body.length);
    } else {
      body = payload.body;
    }
    this.dispatchResponse({
      body,
      headers,
      statusCode: payload.statusCode,
      statusMessage: payload.statusMessage,
    });
  }

  /**
   * Schedule payload dispatchment for next event loop.
   * @param payload Payload to dispatch
   */
  private dispatchResponse(payload: IResponseData) {
    setImmediate(async() => {
      try {
        await this.onResponse.dispatch(payload);
      } catch (err) {
        await this.onError.dispatch(err);
      }
    });
  }

  /**
   * Schedule payload dispatchment for next event loop.
   * @param payload Payload to dispatch
   */
  private dispatchRequest(payload: IRequestData) {
    setImmediate(async() => {
      try {
        await this.onRequest.dispatch(payload);
      } catch (err) {
        await this.onError.dispatch(err);
      }
    });
  }

  public async checkIfExists(): Promise<boolean> {
    try {
      return await this.driver.checkIfExists(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async checkIfEnabled(): Promise<boolean> {
    if (!this.type) {
      return false;
    }
    try {
      return await this.driver.checkIfEnabled(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async checkForAccess(): Promise<boolean> {
    if (!this.type) {
      return false;
    }
    try {
      return await this.driver.checkForAccess(this, this.__headers);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async createAndInitRepository(): Promise<boolean> {
    try {
      return await this.driver.createAndInitRespository(this, this.__headers);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async createSignature(type: "request" | "response" | "shared" = "request"): Promise<string> {
    if (!this.type) {
      return;
    }
    switch (type) {
      case "request":
        return this.__createRequestSignature();
      case "response":
        return this.__createRequestSignature();
      case "shared":
        return this.__createSharedSignature();
      default:
        return;
    }
  }

  private async __createRequestSignature(): Promise<string> {
    if (this.__signatures.has("request")) {
      return this.__signatures.get("request");
    }
    const hash = createHash("sha256");
    hash.update(this.repository);
    hash.update(this.type);
    if (!this.isAdvertisement) {
      const request = await this.awaitRequestData;
      const commands = request.commands.slice().sort(sortMetadata).map((m) => JSON.stringify(m));
      hash.update(commands.join(","));
      const capabilities = Array.from(request.capabilities).sort(sortCapabilities).map((a) => a.join("="));
      hash.update(capabilities.join(","));
    }
    const signature = hash.digest("hex");
    this.__signatures.set("request", signature);
    return signature;
  }

  private async __createResponseSignature(): Promise<string> {
    if (this.__signatures.has("response")) {
      return this.__signatures.get("response");
    }
    const response = await this.awaitResponseData;
    const hash = createHash("sha256");
    hash.update(response.statusCode.toString());
    hash.update(response.statusMessage);
    response.headers.forEach((header, value) => hash.update(`${header}: ${value}`));
    hash.update(await response.body);
    const signature = hash.digest("hex");
    this.__signatures.set("response", signature);
    return signature;
  }

  private async __createSharedSignature(): Promise<string> {
    if (this.__signatures.has("shared")) {
      return this.__signatures.get("shared");
    }
    const hash = createHash("sha256");
    hash.update(await this.__createRequestSignature());
    hash.update(await this.__createResponseSignature());
    const signature = hash.digest("hex");
    this.__signatures.set("shared", signature);
    return signature;
  }

  public sidebandMessage(message: string | Buffer) {
    this.__messages.push(encode(message));
    return this;
  }
}

/**
 * Advertisement Headers for response
 */
const AdHeaders = {
  [RequestType.ReceivePack]: Buffer.from("001f# service=git-receive-pack\n0000"),
  [RequestType.UploadPack]: Buffer.from("001e# service=git-upload-pack\n0000"),
};

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const PacketMapper = new Map<RequestType, (resolve: (value: IRequestData) => void) => (buffer: Buffer) => any>([
  [
    RequestType.ReceivePack,
    (resolve) => {
      let ongoing = true;
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      const request: IRequestData = {
        capabilities: new Map(),
        commands: [],
      };
      return (buffer) => {
        if (ongoing) {
          const length = readPacketLength(buffer);
          if (length === 0) {
            ongoing = false;
            resolve(request);
          } else {
            const value = buffer.toString("utf8");
            const results = regex.exec(value);
            if (results) {
              let kind: "create" | "delete" | "update";
              if ("0000000000000000000000000000000000000000" === results[1]) {
                kind = "create";
              } else if ("0000000000000000000000000000000000000000" === results[2]) {
                kind = "delete";
              } else {
                kind = "update";
              }
              const command: IReceivePackCommand = {
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
                  } else {
                    request.capabilities.set(c, undefined);
                  }
                }
              }
            }
          }
        }
      };
    },
  ],
  [
    RequestType.UploadPack,
    (resolve) => {
      let ongoing = true;
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      const request: IRequestData = {
        capabilities: new Map(),
        commands: [],
      };
      return (buffer) => {
        if (ongoing) {
          const length = readPacketLength(buffer);
          if (length === 0) {
            ongoing = false;
            resolve(request);
          } else {
            const value = buffer.toString("utf8");
            const results = regex.exec(value);
            if (results) {
              const metadata: IUploadPackCommand = {
                commits: [results[2]],
                kind: results[1] as ("want" | "have"),
              };
              request.commands.push(metadata);
              if (results[3]) {
                for (const c of results[3].trim().split(" ")) {
                  if (/=/.test(c)) {
                    const [k, v] = c.split("=");
                    request.capabilities.set(k, v);
                  } else {
                    request.capabilities.set(c, undefined);
                  }
                }
              }
            }
          }
        }
      };
    },
  ],
]);

/**
 * Sort metadata in uniform order.
 * @param a Data pack A
 * @param b Data pack B
 */
function sortMetadata(
  a: IUploadPackCommand | IReceivePackCommand,
  b: IUploadPackCommand | IReceivePackCommand,
): number {
  // TODO: Make a predictable sort for metadata
  return 0;
}

/**
 * Sort capabilities in uniform order.
 * @param a Capability a
 * @param b Capability b
 */
function sortCapabilities(a: [string, string], b: [string, string]): number {
  // TODO: Make a predictable sort for metadata
  return 0;
}
