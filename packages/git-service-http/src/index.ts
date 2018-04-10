import {
  checkIfValidServiceDriver,
  IServiceDriver,
  ISignalAcceptData,
  ISignalRejectData,
  RequestStatus,
  RequestType,
  Service,
} from "git-service";
import {
  IncomingMessage,
  ServerResponse,
} from "http";

export function createService(driver: IServiceDriver, request: IncomingMessage, response: ServerResponse) {
  const service = new Service(driver, request.method, request.url, request.headers as any, request);
  service.onAccept.addOnce(({status, headers, body}) => {
    response.statusCode = status;
    headers.forEach((v, h) => response.setHeader(h, v));
    body.pipe(response);
  });
  service.onReject.addOnce(({status, headers, reason}) => {
    response.statusCode = status;
    headers.forEach((v, h) => response.setHeader(h, v));
    response.end(reason);
  });
  service.onError.addOnce((error) => {
    if (response.headersSent && response.writable) {
      response.end();
    } else {
      response.statusCode = error && error.status || 500;
      response.end();
    }
  });
  return service;
}

export function createEndpoint(driver: IServiceDriver, verbose: boolean = false) {
  if (! checkIfValidServiceDriver(driver)) {
    throw new TypeError('argument `driver` must be a valid service driver interface');
  }
  let count = 0;
  return async(request: IncomingMessage, response: ServerResponse) => {
    const id = count++;
    // reset counter on every 100k requests
    if (count > 99999) {
      count = 0;
    }
    if (verbose) {
      console.log(`${id} - HTTP ${request.method} - ${request.url}`);
      response.on("finish", () => console.log(`${id} - Response sent`));
    }
    try {
      const service = createService(driver, request, response);
      const promise = new Promise<ISignalAcceptData | ISignalRejectData>((resolve, reject) => {
        service.onError.addOnce(reject);
        service.onAccept.addOnce(resolve);
        service.onReject.addOnce(resolve);
      });
      if (verbose) {
        console.log(`${id} - New ${RequestType[service.type].toLocaleLowerCase()} service`);
        service.onError.add((error) => console.error(`${id} - ${error && error.message || ""}`, error && error.stack));
      }
      if (! await service.exists()) {
        await service.reject(404);
      } else if (! await service.access()) {
        await service.reject(403);
      } else {
        await service.accept();
      }
      await promise;
      if (verbose) {
        console.log(`${id} - Service ${RequestStatus[service.status].toLocaleLowerCase()}`);
      }
    } catch (error) {
      if (verbose) {
        console.log(`${id} - One or more errors occurred`);
      }
    }
  };
}

export function createMiddleware(driver: IServiceDriver, key: string | symbol = "service") {
  if (! checkIfValidServiceDriver(driver)) {
    throw new TypeError('argument `driver` must be a valid service driver interface');
  }
  return async(request: IncomingMessage, response: ServerResponse, next: (err?: any) => any) => {
    let error;
    try {
      const service = request[key] = createService(driver, request, response);
      await service.awaitReady;
    } catch (err) {
      error = err;
    } finally {
      next(error);
    }
  };
}
