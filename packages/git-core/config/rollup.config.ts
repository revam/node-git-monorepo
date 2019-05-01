import common, { readPackage } from "@revam/rollup-plugin-common";
import { OutputOptions, RollupOptions } from "rollup";
import replace from "rollup-plugin-re";

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

const options: RollupOptions = {
  external: ["database-query"],
  input: "dist/build/main.js",
  output: output as any,
  plugins: [
    replace({
      patterns: [
        {
          replace: `'${pkg.name}'/${pkg.version} (+${pkg.homepage})`,
          test: /<% user_agent %>/g,
        },
      ],
    }),
    replace({
      patterns: [{
        replace: "const $1 = Object.create(null);\n$2",
        test: /var (\w+);\n\(function \(\1\) {\n([^}]+)\n}\)\(\1 \|\| \(\1 = {}\)\);/g,
      }],
    }),
    replace({
      patterns: [{
        replace: "$1.$2 = $3;",
        test: /[ \t]+(\w+)\["([^"]+)"\] = ("[^"]+");/g,
      }],
    }),
    common({
      copyFiles: {
        files: [
          "changelog.md",
          "license.txt",
          "readme.md",
          ["dist/tsdoc-metadata.json", "tsdoc-metadata.json"],
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
      useBanner: true,
      verbose: true,
    }),
  ],
};

export default options;
