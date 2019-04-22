import { spawn } from "child_process";
import { STATUS_CODES } from "http";
import fetch from "node-fetch";
import { isAbsolute, join, resolve } from "path";
import { Readable } from "stream";
import { Context } from "./context";
import { defaultTail, fsStatusCode, hasHttpOrHttpsProtocol, hasHttpsProtocol, pathIsValid, waitForChild } from "./controller.private";
import { Service } from "./enum";
import { ServiceController } from "./main";
import { encode } from "./util/buffer";

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
export class Controller implements ServiceController {
  /**
   * Default values for {@link Controller.checkFSIfEnabled}.
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
   * Indicates that {@link Controller.origin | origin} is a remote
   * location.
   *
   * @privateRemarks
   *
   * Is `true` if {@link Controller.origin | origin} is defined and
   * {@link Controller.originIsRemote} evaluates to `true`, otherwise
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
   * {@link ControllerOptions.httpsOnly} to true. If it is
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
  private readonly getRemoteTail: (service: Service, advertise: boolean) => string;

  /**
   * Creates a new instance of {@link Controller}.
   *
   * @param options - {@link ControllerOptions | Optional options}.
   */
  public constructor(options: ControllerOptions | undefined | null = {}) {
    if (!(options === undefined || typeof options === "object" && options !== null)) {
      throw new TypeError("argument `options` must be of type 'object'.");
    }
    let origin = options.origin;
    this.isRemote = options.httpsOnly ? hasHttpsProtocol : hasHttpOrHttpsProtocol;
    this.getRemoteTail = options.remoteTail ? options.remoteTail.bind(undefined) : defaultTail;
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
   * Combine `baseURL` with the result of {@link Controller.getRemoteTail}.
   *
   * @param baseURL - Remote repository location as a URL without trailing slash.
   * @param service - {@link Service | service} to use.
   * @param advertise - Should look for advertisement.
   * @returns The full URL-string.
   */
  protected remoteURL(baseURL: string, service: Service, advertise: boolean): string {
    return baseURL + this.getRemoteTail(service, advertise);
  }

  /**
   * Prepare {@link Context.path | path} and report findings.
   *
   * @remarks
   *
   * Checks {@link Context.path | path} and validate if it is valid to use and
   * if it points to a remote location.
   *
   * {@link Context.path | Path} may have been adjusted if found valid for use,
   * and will otherwise not be modified.
   *
   * @param context - {@link Context} to prepare {@link Context.path | path}
   *                  for.
   */
  protected preparePath(context: Context): {
    /**
     * {@link Context.path | Path} was found to be valid for use with
     * controller.
     */
    isValid: boolean;
    /**
     * {@link Context.path | Path} was found to be a remote location.
     */
    isRemote: boolean;
  } {
    let path = context.path;
    let isValid = false;
    let isRemote = false;
    if (pathIsValid(path)) {
      // Sanetise input
      if (!path.length) {
        path = "/";
      }
      else if (!path.endsWith("/")) {
        path += "/";
      }
      // Check if path is a **valid** URL-string.
      if (this.isRemote(path)) {
        isValid = isRemote = true;
      }
      // Then check for origin
      else if (this.origin) {
        if (this.originIsRemote) {
          if (path[0] !== "/") {
            path = `/${path}`;
          }
          const lastChar = path.length - 1;
          if (lastChar > 0 && path[lastChar] === "/") {
            path = path.substring(0, lastChar);
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
      // Set path, but only if it is valid.
      if (isValid) {
        context.path = path;
      }
    }
    return { isRemote, isValid };
  }

  /**
   * {@inheritdoc ServiceController.checkIfEnabled}
   */
  public async checkIfEnabled(context: Context): Promise<boolean> {
    if (context.service) {
      const { isValid, isRemote } = this.preparePath(context);
      if (isValid) {
        return isRemote ? this.checkHTTPIfEnabled(context) : this.checkFSIfEnabled(context);
      }
    }
    return false;
  }

  private async checkHTTPIfEnabled(context: Context): Promise<boolean> {
    const url = this.remoteURL(context.path!, context.service!, true);
    const response = await fetch(url, { method: "HEAD" });
    return Boolean(response.status < 300 && response.status >= 200);
  }

  private async checkFSIfEnabled(context: Context): Promise<boolean> {
    const command = context.service!.replace("-", "");
    const child = spawn("git", ["-C", context.path!, "config", "--bool", `deamon.${command}`]);
    const { exitCode, stdout } = await waitForChild(child);
    if (exitCode === 0) {
      const output = stdout.toString("utf8");
      return command === "uploadpack" ? output !== "false" : output === "true";
    }
    // Return default value for setting when not found in configuration
    return this.enabledDefaults[context.service!];
  }

  public async checkIfExists(context: Context): Promise<boolean> {
    const { isValid, isRemote } = this.preparePath(context);
    if (isValid) {
      return isRemote ? this.checkHTTPIfExists(context) : this.checkFSIfExists(context);
    }
    return false;
  }

  private async checkHTTPIfExists(context: Context): Promise<boolean> {
    const url = this.remoteURL(context.path!, Service.UploadPack, true);
    const response = await fetch(url, { method: "HEAD" });
    return Boolean(response.status >= 200 && response.status < 300);
  }

  private async checkFSIfExists(context: Context): Promise<boolean> {
    // Check if repository exists on disk AND is
    if (!context.path || (await fsStatusCode(context.path)) === 404) {
      return false;
    }
    // Check if context.path is a git repository
    const child = spawn("git", ["ls-remote", context.path, "HEAD"], { stdio: ["ignore", null, null] });
    const { exitCode } = await waitForChild(child);
    return exitCode === 0;
  }

  /**
   * {@inheritdoc ServiceController.serve}
   */
  public async serve(context: Context): Promise<void> {
    if (context.service) {
      const { isValid, isRemote } = this.preparePath(context);
      if (isValid) {
        return isRemote ? this.serveHTTP(context) : this.serveFS(context);
      }
    }
  }

  private async serveHTTP(context: Context): Promise<void> {
    const url = this.remoteURL(context.path!, context.service!, context.advertisement);
    const response = await fetch(url, {
      body: context.readable.request(),
      headers: context.request.headers,
      method: context.advertisement ? "GET" : "POST",
    });
    context.status = response.status;
    context.body = (response.body as Readable)[Symbol.asyncIterator]();
    for (const [header, value] of response.headers) {
      context.setHeader(header, value);
    }
  }

  private async serveFS(context: Context): Promise<void> {
    const statusCode = context.status = await fsStatusCode(context.path);
    if (statusCode === 200) {
      const option = context.advertisement ? "--advertise-refs" : "--stateless-rpc";
      const child = spawn("git", ["-C", context.path!, context.service!, option, "."]);
      if (!context.advertisement) {
        context.readable.request().pipe(child.stdin);
      }
      context.body = child.stdout[Symbol.asyncIterator]();
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
 * Options for {@link Controller}.
 *
 * @public
 */
export interface ControllerOptions {
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
}
