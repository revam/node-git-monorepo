/// <reference types="node" />
import { Readable } from "stream";
import { ServiceType } from './enums';
import { Headers } from "./headers";
import { IRequestData } from "./interfaces";
export declare function createRequest(body: Readable, headers: Headers, isAdvertisement?: boolean, service?: ServiceType, path?: string): Promise<IRequestData>;
/**
 * Maps vital request properties to vital service properties.
 * @param fragment Tailing url path fragment with querystring.
 * @param method HTTP method used with incoming request.
 * @param content_type Incoming content-type header.
 */
export declare function mapInputToRequest(fragment: string, method: string, content_type: string): [boolean, ServiceType, string];
