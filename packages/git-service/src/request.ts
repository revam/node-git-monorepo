import { createPacketReader } from "git-packet-streams";
import { STATUS_CODES } from "http";
import { URL } from "url";
import { RequestStatus, ServiceType } from "./enums";
import { Headers, HeadersInput } from "./headers";
import { IReceivePackCommand, IRequestData, IResponseData, IUploadPackCommand } from "./interfaces";

export function createRequest(
  body: NodeJS.ReadableStream,
  inputHeaders: HeadersInput,
  method: string,
  fragment: string,
): Promise<IRequestData> {
  if (typeof body !== "object" || typeof body.pipe !== "function") {
    throw new TypeError("argument `body` must be streamable");
  }
  if (typeof inputHeaders !== "object") {
    throw new TypeError("argument `inputHeaders` must be of type 'object'.");
  }
  if (typeof method !== "string" || !method) {
    throw new TypeError("argument `method` must be of type 'string'.");
  }
  if (typeof fragment !== "string" || !fragment) {
    throw new TypeError("argument `fragment` must be of type 'string'.");
  }
  const headers = new Headers(inputHeaders);
  const content_type = headers.get("Content-Type");
  const [isAdvertisement = false, path, service] = mapInputToRequest(fragment, method, content_type);
  return new Promise((resolve, reject) => {
    const requestData: IRequestData = Object.create(null, {
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
      state: {
        enumerable: true,
        value: {},
        writable: true,
      },
      status: {
        value: RequestStatus.Pending,
        writable: true,
      },
    });
    Object.defineProperty(requestData, "response", {
      value: createResponse(requestData),
      writable: false,
    });
    if (service && !isAdvertisement) {
      const middleware = ServiceReaders.get(service)!;
      const passthrough = createPacketReader(middleware(requestData));
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

/**
 * Creates a response data holder with signature.
 * @param data Response data
 */
function createResponse(request: IRequestData): IResponseData {
  return Object.create(null, {
    addMessage: {
      enumerable: false,
      value(message: string | Buffer | Uint8Array): void {
        if (!(message instanceof Buffer)) {
          message = Buffer.from(message as string);
        }
        this.messages.push(message);
        return;
      },
      writable: false,
    },
    body: {
      value: undefined,
      writable: true,
    },
    headers: {
      value: new Headers(),
      writable: false,
    },
    messages: {
      value: [],
      writable: false,
    },
    request: {
      value: request,
      writable: false,
    },
    state: {
      enumerable: true,
      get(): any {
        return this.request.state;
      },
      set(value: any) {
        this.request.state = value;
      },
    },
    statusCode: {
      enumerable: true,
      value: 200,
      writable: true,
    },
    statusMessage: {
      enumerable: true,
      get(): string {
        return this.statusCode && STATUS_CODES[this.statusCode] || "";
      },
    },
  });
}

/**
 * Maps vital request properties to vital service properties.
 * @param fragment Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 * @internal
 */
export function mapInputToRequest(
  fragment: string,
  method: string,
  content_type?: string,
): [boolean?, string?, ServiceType?] {
  const url = new URL(fragment, "https://127.0.0.1/");
  // Get advertisement from service
  let results: RegExpExecArray | null = /^\/?(.*?)\/info\/refs$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    if (!(method === "GET" || method === "HEAD") || !url.searchParams.has("service")) {
      return [true, path];
    }
    const serviceName = url.searchParams.get("service")!;
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [true, path];
    }
    return [true, path, results[1] as ServiceType];
  }
  // Use service directly
  results = /^\/?(.*?)\/(git-[\w\-]+)$/.exec(url.pathname);
  if (results) {
    const path = results[1];
    const serviceName = results[2];
    if (method !== "POST") {
      return [false, path];
    }
    results = /^git-((?:receive|upload)-pack)$/.exec(serviceName);
    if (!results) {
      return [false, path];
    }
    const service = results[1];
    if (content_type !== `application/x-git-${service}-request`) {
      return [false, path];
    }
    return [false, path, service as ServiceType];
  }
  return [];
}

function reader(
  commands: Array<IUploadPackCommand | IReceivePackCommand>,
  capabilities: Map<string, string | undefined>,
  resrt: string,
  metadata: IUploadPackCommand | IReceivePackCommand,
) {
  commands.push(metadata);
  if (resrt) {
    for (const c of resrt.trim().split(" ")) {
      if (/=/.test(c)) {
        const [k, v] = c.split("=");
        capabilities.set(k, v);
      }
      else {
        capabilities.set(c, undefined);
      }
    }
  }
}

/**
 * Maps RequestType to a valid packet reader for request body.
 */
const ServiceReaders = new Map<ServiceType, (s: IRequestData) => (b: Buffer) => any>([
  [
    ServiceType.ReceivePack,
    (request) => {
      const regex =
      /^[0-9a-f]{4}([0-9a-f]{40}) ([0-9a-f]{40}) (refs\/[^\n\0 ]*?)((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString("utf8");
        const results = regex.exec(value);
        if (results) {
          let kind: "create" | "delete" | "update";
          if ("0000000000000000000000000000000000000000" === results[1]) {
            kind = "create";
          }
          else if ("0000000000000000000000000000000000000000" === results[2]) {
            kind = "delete";
          }
          else {
            kind = "update";
          }
          reader(request.commands as any, request.capabilities as any, results[4], {
            commits: [results[1], results[2]],
            kind,
            reference: results[3],
          });
        }
      };
    },
  ],
  [
    ServiceType.UploadPack,
    (request) => {
      const regex = /^[0-9a-f]{4}(want|have) ([0-9a-f]{40})((?: [a-z0-9_\-]+(?:=[\w\d\.-_\/]+)?)* ?)?\n$/;
      return (buffer) => {
        const value = buffer.toString("utf8");
        const results = regex.exec(value);
        if (results) {
          reader(request.commands as any, request.capabilities as any, results[3], {
            commits: [results[2]],
            kind: results[1] as ("want" | "have"),
          });
        }
      };
    },
  ],
]);
