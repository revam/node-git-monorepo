# git-service-http

Express- and connect-style git service helpers

## Install

```sh
npm install --save git-service-http
```

## What is this?

This package contains helper functions for easily using git-service with express- and connect-style servers.
It can also be used standalone, without any framework.

## Related packages

- [git-packet-streams](.)
- [git-service](.)
- [git-service-driver](.)
- [git-service-koa](.)

## Usage

**Note:** See git-service for a more complete usage example.

```js
import { createServer } from "http";
import express from "express";
import { createEndpoint, createMiddleware, createService } from "git-service-http";
import { createDriver } from "git-service-drivers";

const driver = createDriver("/data/repos");
const server1 = createServer(async(request, response) => {
  const service = createService(driver, request, response);
  if (await service.exists() && await service.access()) {
    await service.accept();
  } else {
    await service.reject();
  }
});

const server2 = createServer(createEndpoint(driver));

const app1 = express();
const middleware = [createMiddleware(driver), async function(req, res) {
  const service = req.service;
  if (await service.exists() && await service.access()) {
    await service.accept();
  } else {
    await service.reject();
  }
}];

app1.use('/git1/:path(.*)', createEndpoint(driver));
app1.get('/git2/:path(.*)', ...middleware);
app1.post('/git2/:path(.*)', ...middleware);
```

## Public API

**List of exports** (grouped by type):

- `function`
  - [createEndpoint](.)
  - [createMiddleware](.)
  - [createService](.)

### Flags

In the api reference you will find some arguments/properties/methods are marked with one or more flags. Below is a list explaining what those flags mean.

- *[optional]* - Any argument/property marked with this flag can be omitted.

### **createEndpoint** (function)

Creates an express-style endpoint for serving git directly.

#### Arguments

- `driver`
  \<[IServiceDriver](.)>
  Service driver to use.

- `verbose`
  *[optional]*
  \<[Boolean](.)>
  Print to console. Defaults to `false`.

### **createMiddleware** (function)

Creates an express-style middleware attaching service to request.

#### Arguments

- `driver`
  \<[IServiceDriver](.)>
  Service driver to use.

- `key`
  *[optional]*
  \<[String](.)
  | [Symbol](.)>
  Where to attach service on request. Defaults to `"service"`.

### **createService** (function)

Creates a new configured service.

#### Arguments

- `driver`
  \<[IServiceDriver](.)>
  Service driver to use.

- `request`
  \<[IncomingMessage](.)>
  Incoming http message object.

- `response`
  \<[ServerResponse](.)>
  Http server response object.

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
