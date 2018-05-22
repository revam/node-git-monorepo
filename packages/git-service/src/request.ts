import { createHash } from "crypto";
import { createPacketReader } from "git-packet-streams";
import { Readable } from "stream";
import { RequestStatus, ServiceType } from "./enums";
import { Headers } from "./headers";
import { IReceivePackCommand, IRequestData, IUploadPackCommand } from "./interfaces";

export function createRequest(
  body: Readable,
  headers: Headers,
  isAdvertisement: boolean = false,
  service?: ServiceType,
  path?: string,
): Promise<IRequestData> {
  return new Promise((resolve, reject) => {
    const requestData: IRequestData = Object.create(null, {
      __signature: {
        enumerable: false,
        value: undefined,
      },
      body: {
        value: body,
        writable: false,
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
        writable: false,
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
          return this.__signature = createHash("sha256").update(JSON.stringify(this)).digest("hex");
        },
        writable: false,
      },
      status: {
        value: RequestStatus.Pending,
      },
    });
    if (service && !isAdvertisement) {
      const middleware = ServiceReaders.get(service);
      const reader = middleware(requestData);
      const passthrough = createPacketReader(reader);
      passthrough.on("error", reject);
      passthrough.on("end", () => resolve(requestData));
      Object.defineProperty(requestData, "body", {
        value: passthrough,
      });
      body.pipe(passthrough);
    }
    else {
      resolve(requestData);
    }
  });
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
