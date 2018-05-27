import { createHash } from 'crypto';
import { concatPacketBuffers } from "git-packet-streams";
import * as encode from "git-side-band-message";
import { STATUS_CODES } from "http";
import { ReadableSignal, Signal } from "micro-signals";
import { RequestStatus, ServiceType } from "./enums";
import { Headers } from "./headers";
import { IDriver, IDriverResponseData, IRequestData, IResponseData } from "./interfaces";

/**
 * Controls service logic, such as
 */
export class LogicController {
  /**
   * Service driver - doing the heavy-lifting for us.
   */
  public readonly driver: IDriver;
  /**
   * Dispatched when any error ocurr.
   */
  public readonly onError: Signal<any>;

  private __messages: Buffer[] = [];

  constructor(driver: IDriver) {
    Object.defineProperties(this, {
      driver: {
        value: driver,
        writable: false,
      },
      onError: {
        value: new Signal(),
        writable: false,
      },
    });
  }

  /**
   * Serves request with default behavior and rules.
   */
  public async serve(
    request: IRequestData,
    onResponse: ReadableSignal<IResponseData>,
  ): Promise<IResponseData> {
    if (! await this.checkIfExists(request, onResponse)) {
      return this.reject(request, 404); // 404 Not Found
    }
    else if (! await this.checkForAccess(request, onResponse)) {
      return this.reject(request, 401); // 401 Unauthorized
    }
    else if (! await this.checkIfEnabled(request, onResponse)) {
      return this.reject(request, 403); // 403 Forbidden
    }
    return this.accept(request, onResponse); // 2xx-5xx HTTP status code
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   * If driver returns a 4xx or 5xx, then the request is rejected and marked as
   * a failure.
   */
  public async accept(
    request: IRequestData,
    onResponse: ReadableSignal<IResponseData>,
  ): Promise<IResponseData> {
    if (request.status !== RequestStatus.Pending) {
      return;
    }
    request.status = RequestStatus.Accepted;
    if (!request.service) {
      return;
    }
    let output: IDriverResponseData;
    try {
      output = await this.driver.createResponse(request, onResponse);
    } catch (error) {
      this.dispatchError(error);
      output = {
        statusCode: 500,
        statusMessage: error && error.message || STATUS_CODES[500],
      };
    }
    if (output.statusCode >= 400) {
      request.status = RequestStatus.Failure;
      return this.createRejectedResponse(output);
    }
    const packets: Buffer[] = [];
    const headers = new Headers();
    if (output.body) {
      packets.push(output.body);
      if (request.isAdvertisement) {
        const header = AdHeaders[request.service];
        if (!output.body.slice(0, header.length).equals(header)) {
          packets.splice(0, 0, header);
        }
        headers.set("Content-Type", `application/x-git-${request.service}-advertisement`);
      }
      else {
        packets.push(...this.__messages);
        headers.set("Content-Type", `application/x-git-${request.service}-result`);
      }
      headers.set("Content-Length", packets.reduce((p, c) => p + c.length, 0).toString());
    }
    const body = concatPacketBuffers(packets, !request.isAdvertisement && this.__messages.length ? 0 : undefined);
    return createResponse({
      body,
      headers,
      statusCode: output.statusCode,
      statusMessage: output.statusMessage || STATUS_CODES[output.statusCode],
    });
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   * @param statusCode 4xx or 5xx http status code for rejection.
   *                   Default is `500`.
   * @param statusMessage Optional reason for rejection.
   *                      Default is status message for status code.
   */
  public async reject(
    request: IRequestData,
    statusCode?: number,
    statusMessage?: string,
  ): Promise<IResponseData> {
    if (request.status !== RequestStatus.Pending) {
      return;
    }
    request.status = RequestStatus.Rejected;
    if (!request.service) {
      return;
    }
    if (!(statusCode < 600 && statusCode >= 400)) {
      statusCode = 500;
    }
    if (!(statusMessage && typeof statusMessage === "string")) {
      statusMessage = STATUS_CODES[statusCode] || "Unknown status";
    }
    return this.createRejectedResponse({statusCode, statusMessage});
  }

  /**
   * Checks if repository exists.
   */
  public async checkIfExists(
    request: IRequestData,
    onResponse: ReadableSignal<IResponseData>,
  ): Promise<boolean> {
    try {
      return this.driver.checkIfExists(request, onResponse);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Checks if service is enabled.
   * We can still *atempt* a forcefull use of service.
   */
  public async checkIfEnabled(
    request: IRequestData,
    onResponse: ReadableSignal<IResponseData>,
  ): Promise<boolean> {
    try {
      return this.driver.checkIfEnabled(request, onResponse);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Checks access rights to service.
   * Depends on driver implementation.
   */
  public async checkForAccess(
    request: IRequestData,
    onResponse: ReadableSignal<IResponseData>,
  ): Promise<boolean> {
    try {
      return this.driver.checkForAccess(request, onResponse);
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Inform client of message, but only if service is accepted and not a
   * failure.
   * @param message Message to inform client
   */
  public sidebandMessage(message: string | Buffer) {
    this.__messages.push(encode(message));
    return this;
  }

  private createRejectedResponse(payload: IDriverResponseData): IResponseData {
    const headers = new Headers();
    let body: Buffer;
    if (payload.body) {
      body = payload.body;
    }
    else {
      body = Buffer.from(payload.statusMessage);
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Length", body.length);
    }
    return createResponse({
      body,
      headers,
      statusCode: payload.statusCode,
      statusMessage: payload.statusMessage,
    });
  }

  private dispatchError(error: any) {
    setImmediate(() => this.onError.dispatch(error));
  }
}

/**
 * Advertisement Headers for response
 */
const AdHeaders = {
  [ServiceType.ReceivePack]: Buffer.from("001f# service=git-receive-pack\n0000"),
  [ServiceType.UploadPack]: Buffer.from("001e# service=git-upload-pack\n0000"),
};

/**
 * Creates a response data holder with signature.
 * @param data Response data
 */
function createResponse(data: Partial<IResponseData>) {
  return Object.create(null, {
    __signature: {
      enumerable: false,
      value: undefined,
    },
    body: {
      value: data.body,
    },
    headers: {
      value: data.headers,
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
    statusCode: {
      value: data.statusCode,
    },
    statusMessage: {
      value: data.statusMessage,
    },
  });
}
