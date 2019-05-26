import common, { readPackage } from "@revam/rollup-plugin-common";
import { OutputOptions, RollupOptions } from "rollup";

interface SimplePackageJson {
  name: string;
  version: string;
  homepage: string;
}

const pkg = readPackage<SimplePackageJson>();

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

const Variables = {
  user_agent: `'${pkg.name}'/${pkg.version} (+${pkg.homepage})`,
};

const options: RollupOptions = {
  external: ["database-query"],
  input: "dist/build/main.js",
  output: output as any,
  plugins: [
    common({
      copyFiles: {
        files: [
          "changelog.md",
          "license.txt",
          "readme.md",
        ],
      },
      package: {
        content: {
          main: "index.js",
          module: "index.mjs",
          types: "index.d.ts",
        },
        dependencies: [
          "@types/node-fetch",
        ],
        order: [
          "name",
          "version",
          "description",
          "license",
          "main",
          "module",
          "types",
          "files",
          "keywords",
          "author",
          "contributors",
          "repository",
          "homepage",
          "bugs",
          "dependencies",
          "optionalDependencies",
          "peerDependencies",
        ],
        pick: [
          "author",
          "bugs",
          "contributors",
          "description",
          "homepage",
          "keywords",
          "license",
          "name",
          "repository",
          "version",
        ],
      },
      replace: {
        patterns: [
          // Remove templating of const enumerables (const enum)
          {
            regex: /\${(?:"([^"]*)"|(\d+))}/,
            replace: "$1$2",
          },
          // Load variables from environment variables or default values.
          {
            regex: /<% (\b\w+(?:(?:\b\.(\w+|"[^\"]+"))+)?\b) %>/g,
            replace(match) {
              const target = match[1];
              if (target) {
                if (target in process.env) {
                  return process.env[target]!;
                }
                // FIXME: split and tranverse keys
                if (target in Variables) {
                  return Variables[target];
                }
              }
              // NOTE: Maybe throw instead?
              return "";
            },
          },
          {
            regex: /var (\w+);\n\(function \(\1\) {\n([^}]+)\n}\)\(\1 \|\| \(\1 = {}\)\);/g,
            replace: "const $1 = Object.create(null);\n$2",
          },
        ],
      },
      useBanner: true,
    }),
    common({
      replace: {
        patterns: [
          {
            regex: /[ \t]+(\w+)\["([^"]+)"\] = ("[^"]+");/g,
            replace: "$1.$2 = $3;",
          },
        ],
      },
    }),
  ],
};

export default options;
