
import { createHash } from "crypto";
import { createPacketInspectStream, createPacketReadableStream } from "git-packet-streams";
import * as encode from "git-side-band-message";
import { STATUS_CODES } from "http";
import { Readable } from "stream";
import { RequestStatus, RequestType } from "./enums";
import { Headers, HeadersInput } from "./headers";
import {
  IReceivePackData,
  IResponseData,
  IService,
  IServiceDriver,
  IUploadPackData,
} from "./interfaces";
import { Signal } from "./signal";

export { Service as default };

/**
 * Reference implementation of IService. Works with all valid driver implementation.
 */
export class Service implements IService {
  public readonly driver: IServiceDriver;
  public readonly awaitRequestReady: Promise<void>;
  public readonly awaitResponseReady: Promise<IResponseData>;
  public readonly isAdvertisement: boolean;
  public readonly isRequestReady: boolean;
  public readonly isResponseReady: boolean;
  public readonly onError: Signal<any>;
  public readonly onResponse: Signal<IResponseData>;
  public readonly requestBody: Readable;
  public readonly requestCapabilities: Map<string, string>;
  public readonly requestData: Array<IUploadPackData | IReceivePackData>;
  public readonly status: RequestStatus;
  public readonly type: RequestType;
  public repository: string;
  private __headers: Headers;
  private __messages: Buffer[];
  private __readyRequest: boolean;
  private __readyResponse: boolean;
  private __repository?: string;
  private __signatureRequest?: string;
  private __signatureResponse?: string;
  private __status: RequestStatus;

  /**
   * Accepts 5 arguments and will throw if it is supplied the wrong type or to few arguments.
   *
   * @param driver Service driver to use.
   * @param method Upper-case HTTP method for request.
   * @param url Incoming URL or tail snippet. Will extract repository from here when possible.
   * @param headers Request headers supplied as: 1) an instance of [Headers](.),
   *                2) a key-value array, or 3) a plain object with headers as keys.
   * @param body Input (normally the request itself)
   *
   * @throws {TypeError}
   */
  constructor(
    driver: IServiceDriver,
    method: string,
    url: string,
    headers: HeadersInput,
    body: Readable,
  ) {
    inspectServiceDriver(driver);
    if (typeof method !== 'string' || !method) {
      throw new TypeError('argument `method` must be a valid string');
    }
    if (typeof url !== 'string' || !url) {
      throw new TypeError('argument `url_fragment` must be a valid string');
    }
    if (!(body instanceof Readable)) {
      throw new TypeError('argument `input` must be s sub-instance of stream.Readable');
    }
    this.__headers = new Headers(headers);
    this.__messages = [];
    this.__status = RequestStatus.Pending;
    this.__readyRequest = false;
    this.__readyResponse = false;
    this.__repository = undefined;
    this.__signatureRequest = undefined;
    this.__signatureResponse = undefined;
    Object.defineProperties(this, {
      driver: {
        value: driver,
        writable: false,
      },
      isRequestReady: {
        get() {
          return this.__readyRequest;
        },
      },
      isResponseReady: {
        get() {
          return this.__readyResponse;
        },
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
      onResponse: {
        value: new Signal(),
        writable: false,
      },
      repository: {
        get() {
          return this.__repository;
        },
        set(value) {
          if (this.__repository !== value) {
            this.__signatureRequest = undefined;
            this.__repository = value;
          }
        },
      },
      requestCapabilities: {
        value: new Map(),
        writable: false,
      },
      requestData: {
        value: [],
        writable: false,
      },
      status: {
        get() {
          return this.__status;
        },
      },
    });
    Object.defineProperties(this, {
      awaitResponseReady: {
        value: new Promise<IResponseData>((resolve, reject) => {
          this.onError.addOnce(reject);
          this.onResponse.addOnce(() => this.__readyResponse = true);
          this.onResponse.addOnce(resolve);
        }),
        writable: false,
      },
    });
    for (const [service, expected_method, regex, expected_content_type] of Services) {
      const results = regex.exec(url);
      if (results) {
        const advertisement = !expected_content_type;
        if (method !== expected_method) {
          this.onError.dispatch(
            new TypeError(`Unexpected HTTP ${method} request, expected a HTTP ${expected_method}) request`),
          );
          break;
        }
        if (expected_content_type) {
          // Only check content type for post requests
          const content_type = this.__headers.get('Content-Type');
          if (content_type !== expected_content_type) {
            this.onError.dispatch(
              new TypeError(`Unexpected content-type "${content_type}", expected "${expected_content_type}"`),
            );
            break;
          }
        }
        this.__repository = results[1];
        Object.defineProperties(this, {
          isAdvertisement: {
            enumerable: true,
            value: advertisement,
            writable: false,
          },
          type: {
            enumerable: true,
            value: service,
            writable: false,
          },
        });
        break;
      }
    }
    if (!('type' in this)) {
      Object.defineProperties(this, {
        isAdvertisement: {
          enumerable: true,
          value: false,
          writable: false,
        },
        type: {
          enumerable: true,
          value: undefined,
          writable: false,
        },
      });
    }
    if ("isAdvertisement" in this && !this.isAdvertisement) {
      const disposables: Array<() => void> = [];
      const onError = (ee, cb) => { ee.on('error', cb); disposables.push(() => ee.removeListener('error', cb)); };
      onError(body, (err) => this.onError.dispatch(err));
      const middleware = PacketMapper.get(this.type);
      const [parser, awaitReady] = createPacketInspectStream(middleware(this));
      onError(parser, (err) => this.onError.dispatch(err));
      Object.defineProperties(this, {
        awaitRequestReady: {
          value: awaitReady.then(() => {
            this.__readyRequest = true;
            disposables.forEach((d) => d());
            disposables.length = 0;
          }),
          writable: false,
        },
        requestBody: {
          value: parser,
          writable: false,
        },
      });
      body.pipe(parser);
    } else {
      this.__readyRequest = true;
      Object.defineProperties(this, {
        awaitRequestReady: {
          value: Promise.resolve(),
          writable: false,
        },
        requestBody: {
          value: body,
          writable: false,
        },
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
      const output = await this.driver.createResponse(this, this.__headers, this.__messages);
      if (output.statusCode >= 400) {
        this.__status = RequestStatus.Failure;
      }
      // Schedule dispatch for next loop
      this.dispatchResponse(output);
    } catch (err) {
      this.onError.dispatch(err);
    }
  }

  public async reject(statusCode?: number, statusMessage?: string): Promise<void> {
    if (this.__status !== RequestStatus.Pending) {
      return;
    }
    this.__status = RequestStatus.Rejected;
    if (!(statusCode < 600 && statusCode >= 400)) {
      statusCode = 403;
    }
    if (!(statusMessage && typeof statusMessage === 'string')) {
      statusMessage = STATUS_CODES[statusCode] || '';
    }
    const buffer = Buffer.from(statusMessage);
    const body = createPacketReadableStream([buffer]);
    const headers = new Headers();
    headers.set('Content-Type', 'text/plain');
    headers.set('Content-Length', buffer.length.toString());
    this.dispatchResponse({
      headers,
      statusCode,
      statusMessage,
      async buffer() { return Buffer.from(buffer); },
      stream() { return createPacketReadableStream([buffer]); },
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
      return await this.driver.createAndInitRespository(this);
    } catch (err) {
      this.onError.dispatch(err);
      return false;
    }
  }

  public async createRequestSignature(): Promise<string> {
    if (!this.type) {
      return;
    }
    if (this.__signatureRequest) {
      return this.__signatureRequest;
    }
    if (!this.isAdvertisement) {
      await this.awaitRequestReady;
    }
    const hash = createHash("sha256");
    hash.update(this.repository);
    hash.update(this.type);
    const metadata = this.requestData.slice().sort(sortMetadata).map((m) => JSON.stringify(m));
    hash.update(metadata.join(","));
    const capabilities = Array.from(this.requestCapabilities).sort(sortCapabilities).map((a) => a.join("="));
    hash.update(capabilities.join(","));
    return this.__signatureRequest = hash.digest("hex");
  }

  public async createResponseSignature(): Promise<string> {
    if (!this.type) {
      return;
    }
    if (this.__signatureResponse) {
      return this.__signatureResponse;
    }
    const response = await this.awaitResponseReady;
    const hash = createHash("sha256");
    hash.update(response.statusCode.toString());
    hash.update(response.statusMessage);
    response.headers.forEach((header, value) => hash.update(`${header}: ${value}`));
    hash.update(await response.buffer());
    return this.__signatureResponse = hash.digest("hex");
  }

  public informClient(message: string | Buffer) {
    this.__messages.push(encode(message));
    return this;
  }
}

/**
 * Inspects candidate for any missing or invalid methods from `IServiceDriver`,
 * and throws an error if found. Will only check the same candidate once if
 * no errors was found.
 * @param candidate Service driver candidate
 * @throws {TypeError}
 */
export function inspectServiceDriver(candidate: any): candidate is IServiceDriver {
  if (SymbolChecked in candidate) {
    return true;
  }

  if (typeof candidate !== "object") {
    throw new TypeError("Candidate is not an object primitive type");
  }

  if (!("checkForAccess" in candidate) || typeof candidate.checkForAccess !== "function") {
    throw new TypeError("Candidate is missing method 'checkForAccess'");
  }

  if (candidate.checkForAccess.length !== 2) {
    throw new TypeError("Method 'checkForAccess' on candidate has invalid call signature");
  }

  if (!("checkIfEnabled" in candidate) || typeof candidate.checkIfEnabled !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfEnabled'");
  }

  if (candidate.checkIfEnabled.length !== 1) {
    throw new TypeError("Method 'checkIfEnabled' on candidate has invalid call signature");
  }

  if (!("checkIfExists" in candidate) || typeof candidate.checkIfExists !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfExists'");
  }

  if (candidate.checkIfExists.length !== 1) {
    throw new TypeError("Method 'checkIfExists' on candidate has invalid call signature");
  }

  if (!("createResponse" in candidate) || typeof candidate.createResponse !== "function") {
    throw new TypeError("Candidate driver is missing valid method 'createResponse'");
  }

  if (candidate.createResponse.length !== 3) {
    throw new TypeError("Method 'createResponse' on candidate has invalid call signature");
  }

  if (!("createAndInitRepository" in candidate) || typeof candidate.createAndInitRepository !== "function") {
    throw new TypeError("Candidate is missing method 'createAndInitRepository'");
  }

  if (candidate.createAndInitRepository.length !== 1) {
    throw new TypeError("Method 'createAndInitRepository' on candidate has invalid call signature");
  }

  candidate[SymbolChecked] = undefined;
  return true;
}

/**
 * Symbol used to check if candidate has been checked previously.
 */
const SymbolChecked = Symbol("checked");

/**
 * Maps request url to vaild services.
 */
const Services: Array<[RequestType, "GET" | "POST", RegExp, string]> = [
  [RequestType.UploadPack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-upload-pack$/, void 0],
  [RequestType.ReceivePack, 'GET', /^\/?(.*?)\/info\/refs\?service=git-receive-pack$/, void 0],
  [RequestType.UploadPack, 'POST',  /^\/?(.*?)\/git-upload-pack$/, 'application/x-git-upload-pack-request'],
  [RequestType.ReceivePack, 'POST',  /^\/?(.*?)\/git-receive-pack$/, 'application/x-git-receive-pack-request'],
];

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const PacketMapper = new Map<RequestType, (service: IService) => (buffer: Buffer) => any>([
  [
    RequestType.ReceivePack,
    (service) => {
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString('utf8');
        const results = regex.exec(value);
        if (results) {
          let kind: 'create' | 'delete' | 'update';
          if ('0000000000000000000000000000000000000000' === results[1]) {
            kind = 'create';
          } else if ('0000000000000000000000000000000000000000' === results[2]) {
            kind = 'delete';
          } else {
            kind = 'update';
          }
          const metadata: IReceivePackData = {
            commits: [results[1], results[2]],
            kind,
            reference: results[3],
          };
          service.requestData.push(metadata);
          if (results[4]) {
            for (const c of results[4].trim().split(' ')) {
              if (/=/.test(c)) {
                const [k, v] = c.split('=');
                service.requestCapabilities.set(k, v);
              } else {
                service.requestCapabilities.set(c, undefined);
              }
            }
          }
        }
      };
    },
  ],
  [
    RequestType.UploadPack,
    (service) => {
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString('utf8');
        const results = regex.exec(value);
        if (results) {
          const metadata: IUploadPackData = {
            commits: [results[2]],
            kind: results[1] as ('want' | 'have'),
          };
          service.requestData.push(metadata);
          if (results[3]) {
            for (const c of results[3].trim().split(' ')) {
              if (/=/.test(c)) {
                const [k, v] = c.split('=');
                service.requestCapabilities.set(k, v);
              } else {
                service.requestCapabilities.set(c, undefined);
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
function sortMetadata(a: IUploadPackData | IReceivePackData , b: IUploadPackData | IReceivePackData): number {
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
