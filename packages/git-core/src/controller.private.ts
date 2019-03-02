
import { ChildProcess } from "child_process";
import { stat as STAT } from "fs";
import { Readable } from "stream";
import { promisify } from "util";

const stat = promisify(STAT);

export async function fsStatusCode(path?: string): Promise<200 | 404 | 403> {
  return !path ? 404 : stat(path).then((s) => s.isDirectory() ? 200 : 404).catch((e) => e && e.code === "EACCES" ? 403 : 404);
}

export function hasHttpsProtocol(uriOrPath?: string): boolean {
  return Boolean(uriOrPath && /^https:\/\//.test(uriOrPath));
}

export function hasHttpOrHttpsProtocol(uriOrPath?: string): boolean {
  return Boolean(uriOrPath && /^https?:\/\//.test(uriOrPath));
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
export async function waitForChild(child: ChildProcess): Promise<{ exitCode: number; stdout: Buffer; stderr: string }> {
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
