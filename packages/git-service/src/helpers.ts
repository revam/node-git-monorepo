import { Readable } from "stream";
import { RequestType } from "./enums";
import { HeadersInput } from "./headers";
import { IResponseData, IService, IServiceDriver, IServiceInput } from './interfaces';

/**
 * Reference business logic in line with spec. defined in the technical documentation.
 *
 * See https://github.com/git/git/blob/master/Documentation/technical/http-protocol.txt for more info.
 */
export async function serveRequest(
  service: IService,
  createAndInitNonexistant: boolean = false,
): Promise<IResponseData> {
  if (! await service.checkIfExists()) {
    // should we skip creation of resource?
    if (!createAndInitNonexistant) {
      service.reject(404); // 404 Not Found
      return service.awaitResponseData;
    }
    if (! await service.createAndInitRepository()) {
      service.reject(500, "Could not initialize new repository");
      return service.awaitResponseData;
    }
  }
  if (! await service.checkForAccess()) {
    service.reject(401); // 401 Unauthorized
  } else if (! await service.checkIfEnabled()) {
    service.reject(403); // 403 Forbidden
  } else {
    service.accept();
  }
  return service.awaitResponseData;
}

/**
 * Maps method and url to valid service types for IServiceInput.
 * @param method Upper-case HTTP method for request.
 * @param url Incoming URL or tail snippet. Will extract repository from here when possible.
 * @param headers Request headers supplied as: 1) an instance of [Headers](.),
 *                2) a key-value array, or 3) a plain object with headers as keys.
 * @param body Input (normally the request itself)
 */
export function mapToServiceInput(method: string, url: string, headers: HeadersInput, body: Readable): IServiceInput {
  if (typeof method !== "string" || !method) {
    throw new TypeError("argument `method` must be a valid string");
  }
  if (typeof url !== "string" || !url) {
    throw new TypeError("argument `url_fragment` must be a valid string");
  }
  if (!(body instanceof Readable)) {
    throw new TypeError("argument `input` must be s sub-instance of stream.Readable");
  }
  for (const [requestType, expected_method, regex, expected_content_type] of Services) {
    const results = regex.exec(url);
    if (results) {
      const isAdvertisement = !expected_content_type;
      if (method !== expected_method) {
        this.onError.dispatch(
          new TypeError(`Unexpected HTTP ${method} request, expected a HTTP ${expected_method}) request`),
        );
        break;
      }
      if (expected_content_type) {
        // Only check content type for post requests
        const content_type = this.__headers.get("Content-Type");
        if (content_type !== expected_content_type) {
          this.onError.dispatch(
            new TypeError(`Unexpected content-type "${content_type}", expected "${expected_content_type}"`),
          );
          break;
        }
      }
      this.__repository = results[1];
      return {
        body,
        headers,
        isAdvertisement,
        repository: results[1],
        requestType,
      };
    }
  }
  return {
    body,
    headers,
    isAdvertisement: false,
    repository: undefined,
    requestType: undefined,
  };
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

  if (!("checkIfEnabled" in candidate) || typeof candidate.checkIfEnabled !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfEnabled'");
  }

  if (!("checkIfExists" in candidate) || typeof candidate.checkIfExists !== "function") {
    throw new TypeError("Candidate is missing method 'checkIfExists'");
  }

  if (!("createResponse" in candidate) || typeof candidate.createResponse !== "function") {
    throw new TypeError("Candidate driver is missing valid method 'createResponse'");
  }

  if (!("createAndInitRepository" in candidate) || typeof candidate.createAndInitRepository !== "function") {
    throw new TypeError("Candidate is missing method 'createAndInitRepository'");
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
  [RequestType.UploadPack, "GET", /^\/?(.*?)\/info\/refs\?service=git-upload-pack$/, void 0],
  [RequestType.ReceivePack, "GET", /^\/?(.*?)\/info\/refs\?service=git-receive-pack$/, void 0],
  [RequestType.UploadPack, "POST", /^\/?(.*?)\/git-upload-pack$/, "application/x-git-upload-pack-request"],
  [RequestType.ReceivePack, "POST", /^\/?(.*?)\/git-receive-pack$/, "application/x-git-receive-pack-request"],
];
