import { DataSignal } from "./data-signal";
import { ServiceType, SignalPriority } from "./enums";
import { IGitDriver, IResponseData } from "./interfaces";
import { LogicController } from "./logic-controller";

/**
 * Maps vital request properties to vital service properties.
 * @param path Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 */
export function mapInputToRequest(
  path: string,
  method: string,
  content_type: string,
): [boolean, ServiceType, string] {
  for (const [requestType, expected_method, regex, expected_content_type] of Services) {
    const results = regex.exec(path);
    if (results) {
      const isAdvertisement = !expected_content_type;
      if (method !== expected_method) {
        break;
        // throw new TypeError(`Unexpected HTTP ${method} request, expected a HTTP ${expected_method}) request`);
      }
      // Only check content type for post requests
      if (expected_content_type && content_type !== expected_content_type) {
        break;
        // throw new TypeError(`Unexpected content-type "${content_type}", expected "${expected_content_type}"`);
      }
      return [isAdvertisement, requestType, results[1]];
    }
  }
}

/**
 * Maps request url to vaild services.
 */
const Services: Array<[ServiceType, "GET" | "POST", RegExp, string]> = [
  [ServiceType.UploadPack, "GET", /^\/?(.*?)\/info\/refs\?service=git-upload-pack$/, void 0],
  [ServiceType.ReceivePack, "GET", /^\/?(.*?)\/info\/refs\?service=git-receive-pack$/, void 0],
  [ServiceType.UploadPack, "POST", /^\/?(.*?)\/git-upload-pack$/, "application/x-git-upload-pack-request"],
  [ServiceType.ReceivePack, "POST", /^\/?(.*?)\/git-receive-pack$/, "application/x-git-receive-pack-request"],
];

/**
 * Inspects candidate for any missing or invalid methods from `IServiceDriver`,
 * and throws an error if found. Will only check the same candidate once if
 * no errors was found.
 * @param candidate Service driver candidate
 * @throws {TypeError}
 */
export function inspectDriver(candidate: any): candidate is IGitDriver {
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
