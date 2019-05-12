# @revam/git-core

[![NPM version][npm-image]][npm-url]

Framework-independent core-components for creating a git http(s) server with
javascript/typescript.

⚠ **Warning:** This package is still under rapid development and is not ready
for production environments. Untill coverage reaches 100% it is not
recommended to use this for any serious projects.

⚠ **Warning:** This package depends on some functionallity marked stable in node
version 11.14, but _should_ work with the earlier 10.x versions. You **will**
see a warning in the console if using a version older than 11.14.

## Install

From npm:

```sh
$ npm install --save-prod --save-exact @revam/git-core@latest
```

From GitHub:

```sh
$ npm install --save https://github.com/revam/node-git-monorepo/releases/download/git-core/v$VERSION/package.tgz
```

## Documentation

The documentation is not available yet, but if you use TypeScript, the declarations are available. There are also some
examples below for how you _could use_ this library.

## Usage

See examples [directory](./examples).

## Build instructions

### Prerequirements

You need to have git installed and globally available on your system.

If you don't know how to install git, search for "How to install git on `OS`" where `OS` is your operation system of choise.

### Build

Install dependencies:

```sh
$ npm ci
```

Build package:

```sh
$ npm run build
```

Done.

### NPM Scripts

NPM scripts are only available in the repository, and not in the packed
packages.

#### Common

- `build` - Review and build package.

  <!-- NOTE: And later also build documentation. -->

  **Depends on**:
  - `cleanup`
  - `review`
  - `package`

- `cleanup` - Clean-up distrubution and coverage directories.

- `lint` - Lint source files.

- `package` - Create tarball of package.

  **Depends on**:
  - `api-extractor:rollup`
  - `rollup`

- `review` - Review changes to exported api-surface. Also lint files and run
             tests.

  **Depends on**:
  - `lint`
  - `test`
  - `tsc:d.ts`

- `review:local` - Review changes and update the review file.

  <!-- NOTE: For manual use only. -->

  **Depends on**:
  - `tsc:d.ts`

- `rollup` - Roll-up source files and copy assets to package output directory
  (`dist/package`).

  **Depends on**:
  - `tsc:config`
  - `tsc:js`

- `test` - Run tests.

#### API-Extractor

- `api-extractor` - Review changes, generate documentation model, and roll-up
  declarations.

  <!-- NOTE: For manual use only. -->

  **Depends on**:
  - `tsc:d.ts`

- `api-extractor:doc` - Generate documentation model for project.

  <!-- NOTE: To-be-used by documentation generator -->

  **Depends on**:
  - `tsc:d.ts`

- `api-extractor:rollup` - Roll-up declaration files and add
  `tsdoc-metadata.json` to package output directory (`dist/package`).

  **Depends on**:
  - `tsc:d.ts`

#### Typescript

- `tsc` - Transpile declaration and source files with source-maps.

  <!-- NOTE: For manual use only. -->

- `tsc:config` - Transpile configuration files.

- `tsc:d.js` - Transpile declaration files only.

- `tsc:js` - Transpile source files only.

#### Example

- `example:basic-fs-server` - Basic file-system server with only core-components
  and the built-in node http library.

- `example:github-proxy-server` - Proxy server for GitHub, again with only
   core-components and the built-in node http library.

  **Disclamer**: This example is not meant to be used actively, and is
  only meant to show how you _could_ proxy to a remote server using only the
  core components and no framework.

## Typescript

This module includes a [TypeScript](https://www.typescriptlang.org/)
declaration file to enable auto complete in compatible editors and type
information for TypeScript projects.

## Changelog and versioning

All notable changes to this project will be documented in [changelog.md](./changelog.md).

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## License

This project is licensed under the ISC license. See [license.txt](./license.txt)
for the full terms.

[npm-image]: https://img.shields.io/npm/v/@revam/git-core.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/@revam/git-core
