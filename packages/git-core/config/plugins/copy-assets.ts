import { createReadStream, createWriteStream, readdir as READDIR, stat as STAT, Stats } from "fs";
import { dirname, join, relative, resolve } from "path";
import { Plugin } from "rollup";
import { promisify } from "util";
import { makeDirP } from "../util/make-dir-p";

const readDir = promisify(READDIR);
const readStat = promisify(STAT);

const stat = async (path: string): Promise<Stats | undefined> => readStat(path).catch(() => undefined);
const isDirectory = async (path: string): Promise<boolean> => readStat(path).then((s) => s.isDirectory()).catch(() => false);

export interface Options {
  /**
   * Files to copy to output folder.
   *
   * @remarks
   *
   * If supplied with an array, then the first element will be the path to the
   * input file, and the second will be the path relative to the output file,
   * including the filename.
   */
  files: Array<string | [string, string]>;
  /**
   * Be more verbose with messages when something unexpected happens.
   */
  verbose?: boolean;
  /**
   * Write output even if a file already exists at path.
   */
  force?: boolean;
  /**
   * Root directory for input files.
   *
   * @remarks
   *
   * Either an absolute path or a path relative to current working directory
   * (cwd). Defaults to current working directory if not supplied.
   */
  input?: string;
}

export default function copyAssets(opts: Options): Plugin {
  const files = opts.files || [];
  const verbose = opts.verbose || false;
  const force = opts.force || false;
  const inputFolder = opts.input ? resolve(opts.input) : resolve();
  const outputFolders = new Set<string>();
  let started = false;
  return {
    name: "copy-assets",
    generateBundle(outputOptions) {
      if (outputOptions.file) {
        outputFolders.add(resolve(dirname(outputOptions.file)));
      }
      else if (outputOptions.dir) {
        outputFolders.add(resolve(outputOptions.dir));
      }
    },
    async writeBundle() {
      if (started) {
        return;
      }
      started = true;
      for (const outputFolder of outputFolders) {
        if (await isDirectory(outputFolder)) {
          const promises: Array<Promise<any>> = [];
          await Promise.all(files.map(async (a) => {
            const input = join(inputFolder, a instanceof Array ? a[0] : a);
            const output = join(outputFolder, relative(inputFolder, a instanceof Array ? a[1] : a));
            for await (const result of iteratePath(input, output)) {
              // Create directory
              if (result.type === "directory") {
                const stats = await stat(result.output);
                if (stats) {
                  if (!stats.isDirectory()) {
                    return this.warn(`Cannot add sub-entries to entry "${result.output}" when not a directory.`);
                  }
                }
                else {
                  await makeDirP(result.output);
                }
              }
              // Copy file
              else if (result.type === "file") {
                const stats = await stat(result.output);
                if (stats) {
                  if (stats.isDirectory()) {
                    return this.warn(`Cannot write resource to a directory at path "${result.output}".`);
                  }
                  // Force if resource exist
                  else if (force && stats.isFile()) {
                    promises.push(copyFile(result.input, result.output));
                  }
                  else if (verbose) {
                    return this.warn(`Cannot write resource to path "${result.output}".`);
                  }
                }
                else {
                  promises.push(copyFile(result.input, result.output));
                }
              }
              else if (verbose) {
                return this.warn(`Unknown entry at path "${result.input}". (code: ${result.code})`);
              }
            }
          }));
          // Await extra promises if registered.
          if (promises.length) {
            await Promise.all(promises);
          }
        }
      }
      outputFolders.clear();
    },
  };
}

type PathInfo =
| { type: "file"; input: string; output: string }
| { type: "directory"; output: string }
| { type: "unknown"; input: string; code: ErrorCodes }
;

export const enum ErrorCodes {
  NotFound = "ERR_NOT_FOUND",
  Unsupported = "ERR_UNSUPPORTED",
}

/**
 * Iterate path and report findings.
 *
 * @param input - Input path to iterate.
 * @param output - Equivalent path for output.
 */
async function* iteratePath(input: string, output: string): AsyncIterableIterator<PathInfo> {
  const stats = await stat(input);
  if (stats) {
    if (stats.isFile()) {
      yield { type: "file", input, output };
    }
    else if (stats.isDirectory()) {
      yield { type: "directory", output };
      const entries = await readDir(input);
      for (const entry of entries) {
        yield* iteratePath(join(input, entry), join(output, entry));
      }
    }
    else {
      yield { type: "unknown", input, code: ErrorCodes.Unsupported };
    }
  }
  else {
    yield { type: "unknown", input, code: ErrorCodes.NotFound };
  }
}

async function copyFile(input: string, output: string): Promise<void> {
  return new Promise((onClose, onError) => {
    const read = createReadStream(input, { autoClose: true });
    const write = createWriteStream(output, { autoClose: true });
    write.on("close", onClose);
    write.on("error", onError);
    read.pipe(write);
  });
}
