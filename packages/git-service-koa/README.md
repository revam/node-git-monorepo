# git-service-koa

Git service middleware for koa

## Install

### From npm

```sh
$ npm install --save git-service-koa
```

### From GitHub

### Spesific release:

```sh
$ npm install --save https://github.com/revam/node-git-monorepo/releases/download/git-service-koa/v$VERSION/package.tgz
```

### From git.lan

Internet people can ignore this.

#### Latest release:

```sh
$ npm install --save http://git.lan/mist@node/git@git-service-koa/latest/npm-pack.tgz
```

#### Spesific release:

```sh
$ npm install --save http://git.lan/mist@node/git@git-service-koa/v$VERSION/npm-pack.tgz
```

## What is this?

This package contains a middleware for using
[git-service](https://npmjs.com/package/git-service) with
[koa](https://npmjs.com/package/koa).

## Usage

Bare server.

```js
import createKoaMiddleware from "git-service-koa";
import koa from "koa";
import { resolve } from "path";

// Load variables from environment
const origin = resolve(process.env.REPOSITORY_ROOT || "./repositories");
const port = parseInt(process.env.NODE_PORT || "", 10) || 3000;

// Create application and attach middleware
const app = new koa();
app.use(createKoaMiddleware(ORIGIN_ENV));

// Start server
app.listen(port, (err)
  => err ? console.error(err) ? console.log("Listening on port %s", port));
```

## Documentation

The documentation is not available as of yet, but if you use TypeScript, the
definitions are available with some (short) descriptions. There are also some
examples below for how you could use this library.

## Typescript

This module includes a [TypeScript](https://www.typescriptlang.org/)
declaration file to enable auto complete in compatible editors and type
information for TypeScript projects. This module depends on the Node.js
types, so install `@types/node`:

```sh
npm install --save-dev @types/node
```

## Changelog and versioning

All notable changes to this project will be documented in [CHANGELOG.md](./CHANGELOG.md).

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## License

This project is licensed under the MIT license. See [LICENSE](./LICENSE) for the full terms.
