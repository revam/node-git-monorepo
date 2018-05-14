import { createPacketReader } from "git-packet-streams";
import { Readable } from "stream";
import { DataSignal } from "./data-signal";
import { RequestStatus, ServiceType } from "./enums";
import { Headers } from "./headers";
import { IReceivePackCommand, IRequestData, IUploadPackCommand } from "./interfaces";

export function createRequest(
  body: Readable,
  headers: Headers,
  isAdvertisement: boolean = false,
  service?: ServiceType,
  repository?: string,
): DataSignal<IRequestData> {
  const request = new DataSignal<IRequestData>();
  const requestData: IRequestData = {
    body,
    capabilities: new Map(),
    commands: [],
    headers,
    isAdvertisement,
    repository,
    service,
    status: RequestStatus.Pending,
  };
  if (service && !isAdvertisement) {
    const middleware = ServiceReaders.get(service);
    const reader = middleware(requestData);
    const passthrough = createPacketReader(reader);
    passthrough.on("error", (error) => request.onError.dispatch(error));
    passthrough.on("end", () => request.dispatch(requestData));
    requestData.body = body.pipe(passthrough);
  } else {
    request.dispatch(requestData as IRequestData);
  }
  return request;
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
      };
    },
  ],
]);
