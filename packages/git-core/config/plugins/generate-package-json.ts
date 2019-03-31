import { dirname, resolve } from "path";
import { OutputAsset, OutputBundle, OutputChunk, Plugin } from "rollup";
import { read, write } from "../util/package";

export interface Options {
  /**
   * Additional fields to include in the generated `package.json`.
   *
   * Fields added here will be overridden if also included in
   * {@link Options.pick | pick}, and the field exists in the original
   * `package.json`.
   */
  contents?: Record<string, any>;
  /**
   * Additional dependencies to **always** include from the original
   * `package.json` in the generated `package.json`. Will only be included if
   * the depencendy is included in the original `package.json` and is not an
   * exclusive development dependency.
   */
  dependencies?: string[];
  /**
   * Choose the order in which fields from {@link Options.pick | "pick"} and
   * {@link Options.contents | "contents"}, in addition to generated
   * dependencies, appear in. All fields not included here wil not be sorted,
   * and appear in their natural order.
   */
  order?: string[];
  /**
   * Pick fields from the original `package.json` to be included in the
   * generated `package.json`.
   */
  pick?: string[];
  /**
   * Path leading to a folder containing, or directly to, the `package.json` to
   * use.
   */
  input?: string;
}

export default function generatePackageJson(opts: Options = {}): Plugin {
  const pkgIn = read(opts.input);
  let depTypes = ["dependencies", "peerDependencies", "optionalDependencies"];
  // Seperate dependency types from opts.pick if found
  if (opts.pick) {
    const picked = opts.pick;
    if (picked.some((p) => depTypes.includes(p))) {
      const origDepNames = depTypes;
      depTypes = depTypes.filter((d) => picked.includes(d));
      opts.pick = picked.filter((d) => !origDepNames.includes(d));
    }
  }
  // Filter to only iterate dependency types which exist in package
  // configuration.
  depTypes = depTypes.filter((d) => d in pkgIn);
  const pkgPick = opts.pick && pick(pkgIn, opts.pick);
  const pkgExtra = opts.contents;
  const depExtra = opts.dependencies instanceof Array ? opts.dependencies : undefined;
  const pkgOrder = opts.order && order(
    opts.order,
    // Include keys from opts.pick, opts.contents and depTypes
    new Set([...opts.pick || [], ...depTypes, ...(pkgExtra ? Object.keys(pkgExtra) : [])]),
  ) || undefined;
  const outputFolders = new Set();
  return {
    name: "generate-package.json+",
    generateBundle(outputOptions) {
      if (outputOptions.file) {
        outputFolders.add(resolve(dirname(outputOptions.file)));
      }
      else if (outputOptions.dir) {
        outputFolders.add(resolve(outputOptions.dir));
      }
    },
    writeBundle(bundle) {
      for (const outputFolder of outputFolders) {
        const depName = new Set<string>(depExtra);
        // Read all dependencies
        for (const chunk of chunksOfBundle(bundle)) {
          chunk.imports.forEach((d) => depName.add(d));
          chunk.dynamicImports.forEach((d) => depName.add(d));
        }
        const depObj: Partial<Record<"dependencies" | "peerDependencies" | "optionalDependencies", Record<string, string>>> = {};
        // Loop through each type of dependency defined in the array below
        for (const depType of depTypes) {
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
        const pkgOut = { ...pkgOrder, ...pkgExtra, ...pkgPick, ...depObj };
        write(outputFolder, pkgOut);
      }
    },
  };
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

function order(fields: string[], sort: ReadonlySet<string>): object {
  return fields.reduce((p, c) => sort.has(c) && (p[c] = undefined) || p, {});
}

function *chunksOfBundle(bundle: OutputBundle): IterableIterator<OutputChunk> {
  for (const chunckOrAsset of (Object as any).values(bundle) as Array<OutputAsset & OutputChunk>) {
    if (!chunckOrAsset.isAsset) {
      yield chunckOrAsset;
    }
  }
}
