import { concatPacketBuffers } from 'git-packet-streams';
import * as encode from 'git-side-band-message';
import { STATUS_CODES } from 'http';
import { RequestStatus, ServiceType } from './enums';
import { Headers } from './headers';
import { inspectDriver } from './helpers';
import { IGitDriver, IGitDriverData, IReadableSignal, IRequestData, IResponseData } from './interfaces';
import { Signal } from "./signal";

/**
 * Controls service logic, such as
 */
export class LogicController {
  /**
   * Service driver - doing the heavy-lifting for us.
   */
  public readonly driver: IGitDriver;
  /**
   * Dispatched when any error ocurr.
   */
  public readonly onError: Signal<any>;

  private __request: Promise<IRequestData>;
  private __response: IReadableSignal<IResponseData>;
  private __messages: Buffer[] = [];

  constructor(driver: IGitDriver, requestData: Promise<IRequestData>, responseSignal: IReadableSignal<IResponseData>) {
    this.__request = requestData;
    this.__response = responseSignal;
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
  public async serve(): Promise<IResponseData> {
    if (! await this.checkIfExists()) {
      return this.reject(404); // 404 Not Found
    } else if (! await this.checkForAccess()) {
      return this.reject(401); // 401 Unauthorized
    } else if (! await this.checkIfEnabled()) {
      return this.reject(403); // 403 Forbidden
    }
    return this.accept(); // 200 Ok / 304 Not Modified
  }

  /**
   * Accepts request and asks the underlying driver for an appropriate response.
   */
  public async accept(): Promise<IResponseData> {
    const requestData = await this.__request;
    if (!requestData || requestData.status !== RequestStatus.Pending) {
      return;
    }
    requestData.status = RequestStatus.Accepted;
    if (!requestData.service) {
      return;
    }
    const output = await this.driver.createResponse(requestData, this.__response);
    if (output.statusCode >= 400) {
      requestData.status = RequestStatus.Failure;
      return this.createRejectedResponse(output);
    }
    return this.createAcceptedResponse(requestData, output);
  }

  /**
   * Rejects request with status code and an optional status message.
   * Only works with http status error codes.
   * @param statusCode 4xx or 5xx http status code for rejection.
   *                   Default is `500`.
   * @param statusMessage Optional reason for rejection.
   *                      Default is status message for status code.
   */
  public async reject(statusCode?: number, statusMessage?: string): Promise<IResponseData> {
    const requestData = await this.__request;
    if (!requestData || requestData.status !== RequestStatus.Pending) {
      return;
    }
    requestData.status = RequestStatus.Rejected;
    if (!requestData.service) {
      return;
    }
    if (!(statusCode < 600 && statusCode >= 400)) {
      statusCode = 403;
    }
    if (!(statusMessage && typeof statusMessage === "string")) {
      statusMessage = STATUS_CODES[statusCode] || "Unknown status";
    }
    return this.createRejectedResponse({statusCode, statusMessage});
  }

  /**
   * Checks if repository exists.
   */
  public async checkIfExists(): Promise<boolean> {
    try {
      const requestData = await this.__request;
      if (requestData) {
        return this.driver.checkIfExists(requestData, this.__response);
      }
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Checks if service is enabled.
   * We can still *atempt* a forcefull use of service.
   */
  public async checkIfEnabled(): Promise<boolean> {
    try {
      const requestData = await this.__request;
      if (requestData) {
        return this.driver.checkIfEnabled(requestData, this.__response);
      }
    } catch (error) {
      this.dispatchError(error);
    }
    return false;
  }

  /**
   * Checks access rights to service.
   * Depends on driver implementation.
   */
  public async checkForAccess(): Promise<boolean> {
    try {
      const requestData = await this.__request;
      if (requestData) {
        return this.driver.checkForAccess(requestData, this.__response);
      }
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

  private createAcceptedResponse(
    requestData: IRequestData,
    driverData: IGitDriverData,
  ): IResponseData {
    const packets: Buffer[] = [];
    const headers = new Headers();
    if (driverData.body) {
      packets.push(driverData.body);
      if (requestData.isAdvertisement) {
        const header = AdHeaders[requestData.service];
        if (!driverData.body.slice(0, header.length).equals(header)) {
          packets.splice(0, 1, header);
        }
        headers.set("Content-Type", `application/x-git-${requestData.service}-advertisement`);
      } else {
        packets.push(...this.__messages);
        headers.set("Content-Type", `application/x-git-${requestData.service}-result`);
      }
      headers.set("Content-Length", packets.reduce((p, c) => p + c.length, 0).toString());
    }
    const body = concatPacketBuffers(packets, !requestData.isAdvertisement && this.__messages.length ? 0 : undefined);
    return {
      body,
      headers,
      statusCode: driverData.statusCode,
      statusMessage: driverData.statusMessage,
    };
  }

  private createRejectedResponse(payload: IGitDriverData): IResponseData {
    const headers = new Headers();
    let body: Buffer;
    if (payload.body) {
      body = payload.body;
    } else {
      body = Buffer.from(payload.statusMessage);
      headers.set("Content-Type", "text/plain; charset=utf-8");
      headers.set("Content-Length", body.length);
    }
    return {
      body,
      headers,
      statusCode: payload.statusCode,
      statusMessage: payload.statusMessage,
    };
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
