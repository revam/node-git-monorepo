import readPkg from "read-pkg";
import writePkg from "write-pkg";

export function read<T extends object = Record<string, any>>(folder?: string): T | never;
export function read(cwd?: string): Record<string, any> | never {
  return readPkg.sync({normalize: false, ...(cwd && { cwd } || undefined) });
}

export function write(folder: string, contents: Record<string, any>): void | never {
  writePkg.sync(folder, contents, { indent: 2 });
}
