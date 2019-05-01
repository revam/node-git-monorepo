import { spawn } from "child_process";
import { STATUS_CODES } from "http";
import fetch, { RequestInit, Response } from "node-fetch";
import { isAbsolute, join, resolve } from "path";
import { Readable } from "stream";
import { Context } from "./context";
import { Service } from "./enum";
import { defaultTail, fsStatusCode, hasHttpOrHttpsProtocol, hasHttpsProtocol, pathIsValid, waitForChild } from "./fetch-controller.private";
import { ServiceController } from "./main";
import { encode } from "./util/buffer";

const GlobalHeaders = {
  "User-Agent": "<% user_agent %>",
};

/**
 * A basic implementation of the {@link ServiceController} interface for
 * the file-system and/or forwarding to other remote servers over http(s).
 *
 * @privateRemarks
 *
 * Should not contain any extra 'suger', only the most basic and generic
 * implementation, so extending classes can build upon.
 *
 * @public
 */
export class FetchController implements ServiceController {
  /**
   * Default values for {@link (FetchController:class).checkFSIfEnabled}.
   *
   * @remarks
   *
   * When no default is set for {@link Service | service} in the repository
   * configuration, the corresponding value from this object is used.
   */
  private readonly enabledDefaults: Readonly<Record<Service, boolean>>;

  /**
   * Default storage location for repositories.
   *
   * @remarks
   *
   * Is either an absolute path, an URL leading to a remote repository
   * server, or `undefined`.
   *
   * If value is `undefined`, then each request should be rewritten for a remote
   * server location, or else it will silently fail.
   */
  protected readonly origin?: string;

  /**
   * Indicates that {@link (FetchController:class).origin | origin} is a remote
   * location.
   *
   * @privateRemarks
   *
   * Is `true` if {@link (FetchController:class).origin | origin} is defined and
   * {@link (FetchController:class).originIsRemote} evaluates to `true`, otherwise
   * `false`.
   */
  private readonly originIsRemote: boolean;

  /**
   * Check if `input` has either http- or https-protocol, or only
   * https-protocol.
   *
   * @remarks
   *
   * It is determined if it only checks for https protocol by setting
   * {@link FetchControllerOptions.httpsOnly} to true. If it is
   * otherwise false or undefined then this function will check for http- or
   * https-protocols.
   */
  private readonly isRemote: (input: string) => boolean;

  /**
   * Create the tailing part of the remote URL.
   *
   * @remarks
   *
   * Output of this function will be directly appended to the the base URL.
   *
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   * @returns Tail of remote URL.
   */
  private readonly remoteTail: (service: Service, advertise: boolean) => string;

  /**
   *
   */
  private readonly allowEmptyPath: boolean;

  /**
   * Creates a new instance of {@link (FetchController:class)}.
   *
   * @param options - {@link FetchControllerOptions | Optional options}.
   */
  public constructor(options: FetchControllerOptions | undefined | null = {}) {
    if (!(options === undefined || typeof options === "object" && options !== null)) {
      throw new TypeError("argument `options` must be of type 'object'.");
    }
    this.allowEmptyPath = Boolean(options.allowEmptyPath);
    let origin = options.origin;
    this.isRemote = options.httpsOnly ? hasHttpsProtocol : hasHttpOrHttpsProtocol;
    this.remoteTail = options.remoteTail ? options.remoteTail.bind(undefined) : defaultTail;
    if (typeof origin === "string" && origin.length > 0) {
      const isRemote = this.isRemote(origin);
      // Resolve path if it is not an url and not absolute.
      if (!isRemote && !isAbsolute(origin)) {
        origin = resolve(origin);
      }
      // Strip trailing slash if found
      if (origin.length > 1 && origin.endsWith("/")) {
        origin = origin.substring(0, origin.length - 1);
      }
      this.origin = origin;
      this.originIsRemote = isRemote;
    }
    else {
      this.origin = undefined;
      this.originIsRemote = false;
    }
    this.enabledDefaults = {
      "receive-pack": true,
      "upload-pack": true,
    };
    if (options.enabledDefaults) {
      const enabledDefaults = options.enabledDefaults;
      if (typeof enabledDefaults === "boolean") {
        for (const service of Object.keys(this.enabledDefaults)) {
          if (this.enabledDefaults.hasOwnProperty(service)) {
            this.enabledDefaults[service] = enabledDefaults;
          }
        }
      }
      else if (typeof enabledDefaults === "object") {
        for (const [service, state] of Object.entries(enabledDefaults)) {
          if (this.enabledDefaults.hasOwnProperty(service)) {
            this.enabledDefaults[service] = state;
          }
        }
      }
    }
  }

  /**
   * Fetch or advertise {@link Service | service} from a remote location
   * (`url`), optionally with initial request options (`options`) set.
   *
   * @param url - Remote repository location as a URL without trailing slash.
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   * @param options - {@link node-fetch#RequestInit | Options} to initiaise
   *                  request with.
   */
  private async remoteFetch(url: string, service: Service, advertise: boolean, options?: RequestInit): Promise<Response> {
    return fetch(url + this.remoteTail(service, advertise), options);
  }

  /**
   * Check if `path` is valid to use and if it points to a remote location.
   * Returns a path valid for use.
   *
   * @param path - Path or URL leading to a local or remote repository.
   */
  private preparePath(path?: string): {
    /**
     * Path was found to be valid for use with controller.
     */
    isValid: boolean;
    /**
     * Path was found to be a remote location.
     */
    isRemote: boolean;
    /**
     * The prepared path.
     */
    path: string;
  } {
    let isValid = false;
    let isRemote = false;
    if (pathIsValid(path)) {
      // Check if path have a protocol and is a valid base URL.
      if (this.isRemote(path)) {
        isValid = isRemote = true;
      }
      // Then check for origin
      else if (this.origin && (path || this.allowEmptyPath)) {
        if (this.originIsRemote) {
          if (path.length) {
            // Append preceding slash if not found
            if (path[0] !== "/") {
              path = `/${path}`;
            }
            const lastChar = path.length - 1;
            // Remove trailing slash if found
            if (lastChar > 0 && path[lastChar] === "/") {
              path = path.substring(0, lastChar);
            }
          }
          isRemote = true;
          path = this.origin + path;
        }
        else {
          path = join(this.origin, path);
        }
        isValid = true;
      }
      // And last, check if path is absolute
      else if (isAbsolute(path)) {
        isValid = true;
      }
    }
    return { isRemote, isValid, path: path || "" };
  }

  /**
   * {@inheritdoc ServiceController.checkIfEnabled}
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    if (context.service) {
      const { isValid, isRemote, path } = this.preparePath(context.path);
      if (isValid) {
        return isRemote ? this.checkHTTPIfEnabled(path, context.service) : this.checkFSIfEnabled(path, context.service);
      }
    }
    return false;
  }

  /**
   * Check a remote location if `service` is enabled for repository.
   *
   * @param url - URL leading to remote repository.
   * @param service - {@link Service} to check.
   */
  private async checkHTTPIfEnabled(url: string, service: Service): Promise<boolean> {
    const response = await this.remoteFetch(url, service, true, { method: "HEAD", headers: GlobalHeaders });
    return response.status === 200;
  }

  /**
   * Check the local file-system if `service` is enabled for repository.
   *
   * @param path - Path leading to local repository.
   * @param service - {@link Service} to check.
   */
  private async checkFSIfEnabled(path: string, service: Service): Promise<boolean> {
    const status = await fsStatusCode(path);
    if (status === 200) {
      const command = service.replace("-", "");
      const child = spawn("git", ["-C", path, "config", "--bool", `deamon.${command}`]);
      const { exitCode, stdout } = await waitForChild(child);
      if (exitCode === 0) {
        const output = stdout.toString("utf8");
        return command === "uploadpack" ? output !== "false" : output === "true";
      }
    }
    // Return default value for setting when not found in configuration
    return this.enabledDefaults[service];
  }

  /**
   * {@inheritdoc ServiceController.checkIfExists}
   */
  public async checkIfExists(context: Context): Promise<boolean> {
    const { isValid, isRemote, path } = this.preparePath(context.path);
    if (isValid) {
      return isRemote ? this.checkHTTPIfExists(path) : this.checkFSIfExists(path);
    }
    return false;
  }

  /**
   * Check a remote location if repository exists.
   *
   * @param url - URL leading to remote repository.
   */
  private async checkHTTPIfExists(url: string): Promise<boolean> {
    const response = await this.remoteFetch(url, Service.UploadPack, true, { method: "HEAD", headers: GlobalHeaders });
    return response.status === 200;
  }

  /**
   * Check the local file-system if repository exists.
   *
   * @privateRemarks
   *
   * We _assume_ the repository exists if we get an access forbidden.
   *
   * @param path - Path leading to local repository.
   */
  private async checkFSIfExists(path: string): Promise<boolean> {
    const status = await fsStatusCode(path);
    return status !== 404;
  }

  /**
   * {@inheritdoc ServiceController.serve}
   */
  public async serve(context: Context): Promise<void> {
    if (context.service) {
      const { isValid, isRemote, path } = this.preparePath(context.path);
      if (isValid) {
        return isRemote ? this.serveHTTP(context, path) : this.serveFS(context, path);
      }
    }
    // Set response to `400 Bad Request`, no need for hiding failure here.
    // Such logic should be handled by the `LogicController`.
    context.status = 400;
    const body = context.body = encode("Bad Request");
    context.type = "text/plain; charset=utf-8";
    context.length = body.length;
  }

  /**
   * Serve `context` from a remote location.
   *
   * @param context - {@link Context} to serve.
   * @param url - URL leading to remote repository.
   */
  private async serveHTTP(context: Context, url: string): Promise<void> {
    const response = await this.remoteFetch(url, context.service!, context.advertisement, {
      body: context.readable.request(),
      headers: context.request.headers,
      method: context.advertisement ? "GET" : "POST",
    });
    context.status = response.status;
    context.body = (response.body as Readable);
    for (const [header, value] of response.headers) {
      context.setHeader(header, value);
    }
  }

  /**
   * Serve `context` from local file-system.
   *
   * @param context - {@link Context} to serve.
   * @param path - Path leading to local repository.
   */
  private async serveFS(context: Context, path: string): Promise<void> {
    const statusCode = context.status = await fsStatusCode(path);
    if (statusCode === 200) {
      const option = context.advertisement ? "--advertise-refs" : "--stateless-rpc";
      const child = spawn("git", ["-C", path, context.service!, option, "."]);
      if (!context.advertisement) {
        context.readable.request().pipe(child.stdin);
      }
      context.body = child.stdout;
      context.type = `application/x-git-${context.service}-${context.advertisement ? "advertisement" : "result"}`;
      context.length = undefined;
    }
    else {
      const body = context.body = encode(STATUS_CODES[statusCode]!);
      context.type = "text/plain; charset=utf-8";
      context.length = body.length;
    }
  }
}

/**
 * Options for {@link (FetchController:class)}.
 *
 * @public
 */
export interface FetchControllerOptions {
  /**
   * Default values for file-system checks for {@link ServiceController.checkIfEnabled}.
   *
   * @remarks
   *
   * If provided with a boolean, then all services will use the value provided,
   * if provided with an object, then services mentioned will be set, while the
   * rest will use the global defaults.
   *
   * **Global defaults**:
   *
   * - UploadPack → true
   * - ReceivePack → true
   *
   */
  enabledDefaults?: boolean | Partial<Record<Service, boolean>>;
  /**
   * Only check for https protocol.
   */
  httpsOnly?: boolean;
  /**
   * Default repository storage location.
   *
   * @remarks
   *
   * Should be one of 1) a relative path, 2) an absolute path, 3) an URL leading
   * to a remote repository server, or 4) `undefined`.
   *
   * Relative paths are resolved from working directory.
   */
  origin?: string;
  /**
   * Create the tailing part of the remote URL.
   *
   * @remarks
   *
   * For use with custom endpoints on remote servers.
   *
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   */
  remoteTail?(service: Service, advertise: boolean): string;
  /**
   * Validates {@link Context.path | path} successfully when it is an empty
   * string while {@link FetchControllerOptions.origin | origin} is also set.
   *
   * @defaultValue false
   */
  allowEmptyPath?: boolean;
}
