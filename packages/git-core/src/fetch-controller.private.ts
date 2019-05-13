
import { ChildProcessWithoutNullStreams } from "child_process";
import { stat as STAT } from "fs";
import { join } from "path";
import { Readable } from "stream";
import { promisify } from "util";
import { Service } from "./enum";

const stat = promisify(STAT);

export const CheckHTTPRegex = /^https?:\/\/[^\/]+(?=\/|$)/;
export const CheckHTTPSRegex = /^https:\/\/[^\/]+(?=\/|$)/;

export const RelativePathRegex = /(?<=^|[\/\\])\.{1,}[\/\\]|(?<=^|[^:])[\/\\]{2,}|(?<=:)\/{2}(?!.)/;

/**
 * `path` must a string not containing any of the following segments: "//",
 * "./", "../".
 *
 * @param target - Path to verify.
 */
export function pathIsValid(target: unknown): target is string {
  return typeof target === "string" && !RelativePathRegex.test(target);
}

/**
 * Default tail function. See {@link FetchControllerOptions.remoteTail} for more
 * info.
 *
 * @param service - Service to request use of.
 * @param advertise - If we should request for only advertisement.
 */
export function defaultTail(service: Service, advertise: boolean) {
  return advertise ? `/info/refs?service=git-${service}` : `/git-${service}`;
}

export async function fsStatusCode(path?: string): Promise<200 | 404 | 403> {
  return !path ? 404 : stat(join(path, "HEAD")).then((s) => s.isFile() ? 200 : 404, (e) => e && e.code === "EACCES" ? 403 : 404);
}

export function hasHttpsProtocol(uriOrPath?: string | undefined | null): boolean {
  return Boolean(uriOrPath && CheckHTTPSRegex.test(uriOrPath));
}

export function hasHttpOrHttpsProtocol(uriOrPath?: string | undefined | null): boolean {
  return Boolean(uriOrPath && CheckHTTPRegex.test(uriOrPath));
}

export async function waitForBuffer(readable: Readable): Promise<Buffer> {
  return new Promise<Buffer>((ok, error) => {
    const buffers: Buffer[] = [];
    readable.once("error", error);
    readable.on("data", (b: Buffer) => buffers.push(b));
    readable.once("close", () => ok(Buffer.concat(buffers)));
  });
}

// Based on function exec() from
// https://github.com/Microsoft/vscode/blob/2288e7cecd10bfaa491f6e04faf0f45ffa6adfc3/extensions/git/src/git.ts
// Copyright (c) 2017-2018 Microsoft Corporation. MIT License
export async function waitForChild(child: ChildProcessWithoutNullStreams): Promise<{ exitCode: number; stdout: Buffer; stderr: string }> {
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      new Promise<number>((_, r) => child.once("error", r).once("exit", _)),
      waitForBuffer(child.stdout),
      waitForBuffer(child.stderr).then((buffer) => buffer.toString("utf8")),
    ]);
    return { exitCode, stdout, stderr };
  } catch (error) {
    return { exitCode: -1, stdout: Buffer.alloc(0), stderr: error && error.message || "Unkonwn error" };
  }
}
