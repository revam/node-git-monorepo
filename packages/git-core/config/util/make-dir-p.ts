/**
 * MIT Licensed
 *
 * Copyright (c) 2011-2017 JP Richardson
 * Copyright (c) 2019 Mikal Stordal
 *
 * Based upon https://github.com/jprichardson/node-fs-extra/blob/20c82ab4dd98b2873ad5cb200b5fa87657dee379/lib/mkdirs/mkdirs-sync.js,
 * modified for async promises with typescript.
 */

import { mkdir as MAKEDIR, stat as STAT, Stats } from "fs";
import { dirname, normalize, resolve, sep } from "path";
import { promisify } from "util";

const o777 = parseInt("0777", 8);

const makeDir = promisify(MAKEDIR);
const stat = promisify(STAT);

export async function makeDirP (path: string, mode?: number, made?: string): Promise<string | undefined> {
  if (process.platform === "win32" && invalidWin32Path(path)) {
    const errInval: Error & { code?: string } = new Error(`${path} contains invalid WIN32 path characters.`);
    errInval.code = "EINVAL";
    throw errInval;
  }

  if (mode === undefined) {
    mode = o777 & (~process.umask()); // tslint:disable-line:no-bitwise
  }

  path = resolve(path);

  try {
    await makeDir(path, mode);
    made = made || path;
  } catch (err0) {
    if (err0.code === "ENOENT") {
      if (dirname(path) === path) {
        throw err0;
      }
      made = await makeDirP(dirname(path), mode, made);
      await makeDirP(path, mode, made);
    } else {
      // In the case of any other error, just see if there's a dir there
      // already. If so, then hooray!  If not, then something is borked.
      let stats: Stats;
      try {
        stats = await stat(path);
      } catch (err1) {
        throw err0;
      }
      if (!stats.isDirectory()) {
        throw err0;
      }
    }
  }
  return made;
}

// http://stackoverflow.com/a/62888/10333 contains a more accurate map of invalid characters and combinations
// TODO: expand to include the rest
const INVALID_PATH_CHARS = /[\u0000-\u0031<>:"|?*]/;

// get drive on windows
function getRootPath (path: string): string | undefined {
  const paths = normalize(resolve(path)).split(sep);
  return paths.length > 0 ? paths[0] : undefined;
}

function invalidWin32Path (path: string): boolean {
  const rp = getRootPath(path);
  if (rp) {
    path = path.replace(rp, "");
  }
  return INVALID_PATH_CHARS.test(path);
}
