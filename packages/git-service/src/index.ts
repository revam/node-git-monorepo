/**
 * git-service package
 * Copyright (c) 2018 Mikal Stordal <mikalstordal@gmail.com>
 */

import { IResponseData, IService } from "./interfaces";

export * from "./enums";
export * from "./interfaces";
export * from "./service";
export { Service as default } from "./service";
export * from "./signal";
export * from "./headers";

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
