# git-service-koa

Git service middleware for koa

## Install

```sh
npm install --save git-service-koa
```

## What is this?

This package contains a middleware for using
[git-service](https://npmjs.com/package/git-service) with
[koa](https://npmjs.com/package/koa).

## Usage

```js
import { createServer } from "http";
import { createController, createKoaMiddleware } from "git-service-koa";
import koa from "koa";

// Load variables from environment
const { ORIGIN_ENV, PORT } = process.env;

// Create controller, app and server
const controller = createController(ORIGIN_ENV);
const app = new koa();
const server = createServer(app.callback());

// Add middleware to application
app.use(createKoaMiddleware(controller));

// Start server and serve git.
server.listen(parseInt(PORT, 10) || 3000, (err)
  => err ? console.error(err) ? console.log("Listening on port %s", PORT || 3000));
```

## Documentation

The documentation is not yet available.

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
