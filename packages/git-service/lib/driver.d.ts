import { ServiceType } from "./enums";
import { IDriver, IGenericDriverOptions, IProxiedMethods } from "./interfaces";
/**
 * Creates an IGitDriver compatible object.
 * @param origin Origin location (URI or rel./abs. path)
 * @param options Extra options
 */
export declare function createDriver(origin: string, options?: IGenericDriverOptions): IDriver;
/**
 * Creates an IDriver compatible object with some proxied methods.
 * @param driver Original driver object
 * @param methods Proxy methods
 */
export declare function createProxiedDriver(driver: IDriver, methods: IProxiedMethods): IDriver;
/**
 * Creates an IDriver compatible object for use on the file system.
 * @param origin Repositories root folder
 * @param enabledDefaults Service usage defaults
 */
export declare function createFileSystemDriver(origin: string, enabledDefaults?: boolean | {
    [K in ServiceType]?: boolean;
}): IDriver;
/**
 * Creates an IDriver compatible object for use over http(s).
 * @param origin Origin location URL
 */
export declare function createWebDriver(origin: string): IDriver;
