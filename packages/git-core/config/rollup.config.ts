import { OutputOptions, RollupOptions } from "rollup";
import replace from "rollup-plugin-re";
import copyAssets from "./plugins/copy-assets";
import generateBanner from "./plugins/generate-banner";
import generatePackageJson from "./plugins/generate-package-json";

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
    generatePackageJson({
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
        "main",
        "module",
        "name",
        "types",
        "repository",
        "version",
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
      verbose: true,
    }),
  ],
};

export default options;
