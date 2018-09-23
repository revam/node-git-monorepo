import { createPacketReader } from "git-packet-streams";
import { STATUS_CODES } from "http";
import { URL } from "url";
import { RequestStatus, ServiceType } from "./enums";
import { Headers, HeadersInput } from "./headers";
import { IReceivePackCommand, IRequestData, IResponseData, IUploadPackCommand } from "./interfaces";

export async function createRequest(
  body: NodeJS.ReadableStream,
  inputHeaders: HeadersInput,
  method: string,
  url: string,
): Promise<IRequestData> {
  if (typeof body !== "object") {
    throw new TypeError("argument `body` must be of type 'object'.");
  }
  if (typeof inputHeaders !== "object") {
    throw new TypeError("argument `inputHeaders` must be of type 'object'.");
  }
  if (typeof method !== "string" || !method) {
    throw new TypeError("argument `method` must be of type 'string'.");
  }
  if (typeof url !== "string" || !url) {
    throw new TypeError("argument `url` must be of type 'string'.");
  }
  const headers = new Headers(inputHeaders);
  const content_type = headers.get("Content-Type");
  const [isAdvertisement = false, path, service] = mapInputToRequest(url, method, content_type);
  const requestData: IRequestData = Object.create(null, {
    body: {
      enumerable: true,
      value: body,
      writable: true,
    },
    capabilities: {
      enumerable: true,
      value: new Map(),
      writable: false,
    },
    commands: {
      enumerable: true,
      value: new Array(),
      writable: false,
    },
    headers: {
      enumerable: true,
      value: headers,
      writable: false,
    },
    isAdvertisement: {
      enumerable: true,
      value: isAdvertisement,
      writable: false,
    },
    method: {
      enumerable: true,
      value: method,
      writable: false,
    },
    path: {
      enumerable: true,
      value: path,
      writable: true,
    },
    service: {
      enumerable: true,
      value: service,
      writable: false,
    },
    state: {
      enumerable: true,
      value: {},
      writable: true,
    },
    status: {
      enumerable: true,
      value: RequestStatus.Pending,
      writable: true,
    },
    url: {
      enumerable: true,
      value: url,
      writable: false,
    },
  });
  Object.defineProperty(requestData, "response", {
    value: createResponse(requestData),
    writable: false,
  });
  if (service && !isAdvertisement) {
    const middleware = ServiceReaders.get(service)!;
    const passthrough = createPacketReader(middleware(requestData));
    requestData.body = passthrough;
    body.pipe(passthrough);
    await new Promise((ok, nok) => passthrough.on("error", nok).on("finish", ok));
  }
  return requestData;
}

/**
 * Creates a response data holder with signature.
 * @param data Response data
 */
function createResponse(request: IRequestData): IResponseData {
  return Object.create(null, {
    addMessage: {
      enumerable: false,
      value(this: IResponseData, message: string): void {
        (this.messages as string[]).push(message);
      },
      writable: false,
    },
    body: {
      enumerable: true,
      value: undefined,
      writable: true,
    },
    headers: {
      enumerable: true,
      value: new Headers(),
      writable: false,
    },
    messages: {
      enumerable: true,
      value: [],
      writable: false,
    },
    request: {
      enumerable: true,
      value: request,
      writable: false,
    },
    state: {
      enumerable: true,
      get(this: IResponseData): any {
        return this.request.state;
      },
      set(this: IResponseData, value: any) {
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
      get(this: IResponseData): string {
        return STATUS_CODES[this.statusCode] || "";
      },
    },
  }) as IResponseData;
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
  result: string,
  metadata: IUploadPackCommand | IReceivePackCommand,
) {
  commands.push(metadata);
  if (result) {
    for (const c of result.trim().split(" ")) {
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
          if (results[1] === "0000000000000000000000000000000000000000") {
            kind = "create";
          }
          else if (results[2] === "0000000000000000000000000000000000000000") {
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
