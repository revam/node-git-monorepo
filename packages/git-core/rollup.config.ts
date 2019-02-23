import { readFile as READ, stat as STAT, writeFile as WRITE } from "fs";
import { dirname, join, relative, resolve } from "path";
import readPkg from "read-pkg";
import { OutputAsset, OutputBundle, OutputChunk, OutputOptions, Plugin, RollupOptions } from "rollup";
import { promisify } from "util";
import writePkg from "write-pkg";

const stat = promisify(STAT);
const readFile = promisify(READ);
const writeFile = promisify(WRITE);

const isDirectory = async (path: string): Promise<boolean> => stat(path).then((s) => s.isDirectory()).catch(() => false);
const isFile = async (path: string): Promise<boolean> => stat(path).then((s) => s.isFile()).catch(() => false);

const pkg = readPackageJson(".");
const name: string = pkg && pkg.name || "<unknown>";
const description: string = pkg && pkg.description || "";
const version: string = pkg && pkg.version || "0.0.0";
const author: string = pkg && (typeof pkg.author === "object" ? `${pkg.author.name} <${pkg.author.email}>` : pkg.author) || "<unknown>";

const output: OutputOptions[] = [
  {
    file: "dist/package/index.js",
    format: "cjs",
    preferConst: true,
  },
  {
    file: "dist/package/index.mjs",
    format: "esm",
    preferConst: true,
  },
];

const options: RollupOptions = {
  external: ["database-query"],
  input: "dist/build/main.js",
  output: output as any,
  plugins: [
    generatePackageJson({
      pick: [
        "name",
        "version",
        "description",
        "license",
        "main",
        "module",
        "types",
        "author",
        "keywords",
        "contributors",
        "repository",
        "homepage",
        "bugs",
      ],
    }),
    generateBanner(),
    copyAssets({
      files: [
        "changelog.md",
        "license.txt",
        "readme.md",
        ["dist/tsdoc-metadata.json", "tsdoc-metadata.json"],
      ],
    }),
  ],
};

export default options;

function readPackageJson<T extends object = Record<string, any>>(folder: string): T | never;
function readPackageJson(cwd: string): Record<string, any> | never {
  try {
    return readPkg.sync({normalize: false, ...(cwd && { cwd }) });
  } catch (e) {
    throw new Error('Input package.json file does not exist or has bad format, check "inputFolder" option');
  }
}

function generatePackageJson(opts: {
  // pick from package.json
  pick?: string[];
  input?: string;
  contents?: Record<string, any>;
  dependencies?: string[];
} = {}): Plugin {
  const pkgIn = readPackageJson(opts.input);
  const pkgPick = opts.pick && pick(pkgIn, opts.pick) || undefined;
  const pkgExtra = opts.contents || undefined;
  const depExtra = opts.dependencies instanceof Array ? opts.dependencies : undefined;

  return {
    name: "generate-package.json+",
    generateBundle(outputOptions, bundle) {
      const outputFolder = dirname(outputOptions.file);
      const depName = new Set<string>(depExtra);
      // Read all dependencies
      for (const chunk of chunksOfBundle(bundle)) {
        chunk.imports.forEach((d) => depName.add(d));
        chunk.dynamicImports.forEach((d) => depName.add(d));
      }
      const depObj: Partial<Record<"dependencies" | "peerDependencies" | "optionalDependencies", Record<string, string>>> = {};
      // Loop through each type of dependency defined in the array below
      for (const depType of ["dependencies", "peerDependencies", "optionalDependencies"]) {
        if (depType in pkgIn) {
          const objIn: Record<string, string> = pkgIn[depType];
          const objOut: Record<string, string> = depObj[depType] = {};
          for (const dep of depName) {
            if (dep in objIn) {
              objOut[dep] = objIn[dep];
            }
          }
        }
      }
      // tslint:disable:object-literal-sort-keys
      const pkgOut = { ...pkgExtra, ...pkgPick, ...depObj };
      writePackageJson(outputFolder, pkgOut);
    },
  };

  function writePackageJson(folder: string, contents: Record<string, any>) {
    try {
      return writePkg.sync(folder, contents, { indent: 2 });
    } catch (e) {
      throw new Error('Unable to save generated package.json file, check "outputFolder" option');
    }
  }

  function pick<T extends object, TKey extends keyof T & string>(source: T, keys: TKey[]): Pick<T, TKey>;
  function pick(source: Record<PropertyKey, any>, keys: string[]): Record<PropertyKey, any>;
  function pick(source: object, keys: string[]): object {
    const set = new Set(keys);
    const result = {};
    for (const key of set) {
      if (key in source) {
        result[key] = source[key];
      }
    }
    return result;
  }

  function *chunksOfBundle(bundle: OutputBundle): IterableIterator<OutputChunk> {
    for (const chunckOrAsset of (Object as any).values(bundle) as Array<OutputAsset & OutputChunk>) {
      if (!chunckOrAsset.isAsset) {
        yield chunckOrAsset;
      }
    }
  }
}

function generateBanner(): Plugin {
  return {
    name: "generate-banner",
    intro() {
      return `/**
 * ${description}.
 *
 * @package ${name}
 * @version ${version}
 * @author ${author}
 * @license ${pkg.license || "none"}
 */`;
    },
  };
}

function copyAssets(opts: { files: Array<string | [string, string]> }): Plugin {
  const files = opts.files || [];
  const inputFolder = resolve();
  const outputFolders = new Set<string>();
  return {
    name: "copy-assets",
    generateBundle(outputOptions, bundle, isWrite) {
      outputFolders.add(resolve(dirname(outputOptions.file)));
    },
    async writeBundle() {
      for (const outputFolder of outputFolders) {
        if (await isDirectory(outputFolder)) {
          await Promise.all(files.map(async (a) => {
            const i = join(inputFolder, relative(inputFolder, a instanceof Array ? a[0] : a));
            const o = join(outputFolder, relative(inputFolder, a instanceof Array ? a[1] : a));
            if (!(await isFile(o))) {
              await writeFile(o, await readFile(i));
            }
          }));
        }
      }
    },
  };
}
