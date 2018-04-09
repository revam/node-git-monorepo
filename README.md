# git-service

Serve git over http(s).

## Install

```sh
npm install --save git-service
```

## What is this?

This is a framework independent library for serving git over http(s). It exports an
abstract service which can either be used standalone or extended to your needs.

I am not a fan of events used in a middleware-driven workflow, as it breaks the pattern,
so I made this library which, in my eyes, is better suited for such uses. It's a side-project,
so expect irregular updates, if any, in case you want to use it. Below you can find some simular
projects which helped me greatly when creating this package. Also a great help was the technical
documentation for git, which can be found
[at github](https://github.com/git/git/blob/master/Documentation/technical).

## Why start at version 2?

Because this is actually a rewrite of another package. But since the main reason for the
package changed, so did the name. If you're interested, the other package can be found
[here](.).

## Features

- [x] simple high-level logic
- [x] support different backends (through drivers)
  - [x] serve from local file system
  - [x] forward to http(s) server
  - [ ] forward to ssh server (planned)
  - [ ] forward to git (protocol) server (planned)
- [x] support the http smart protocol
- [x] can inform client (inform client)
- [ ] check access per service per repository (planned)

## Related packages

- [git-service-driver](.)
- [git-service-http](.)
- [git-service-express](.)
- [git-service-koa](.)
- [git-packet-streams](.)

## Simular projects

- [pushover](https://github.com/substack/pushover) ([npm](.))
- [git-http-backend](https://github.com/substack/git-http-backend) ([npm](.))
- [git-server](.) ([npm](.))
- [grack](.) (ruby on rails)

## Usage

**Note:** It is recommended to use a function or class from a sub-package.

```js
"use strict";

import http from "http";
import HttpStatus from "http-status";
import { ServiceType, Service } from "git-service";
import { createDriver, createDriverCache } from "git-service-basic-drivers";

let counter = 0;
const { ORIGIN_ENV: origin = "./repos", PORT } = process.env;
const port = safeParseInt(PORT, 3000);
const cache = createDriverCache();
const driver = createDriver(origin, cache);
const server = http.createServer(async function(request, response) {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    return response.end();
  }

  const id = counter++;
  console.log(`${id} - REQUEST - ${request.method} - ${request.url}`);
  response.on("finish", () => console.log(`${id} - RESPONSE - ${response.statusCode}`));

  const service = new Service(driver, request.method, request.url, request.headers, request);

  service.onAccept.addOnce(function ({status, headers, body}) {
    headers.forEach(function (value, header) { response.setHeader(header, value); });
    response.statusCode = status;
    body.pipe(response, {end: true});
  });
  service.onReject.addOnce(function ({status, headers, reason}) {
    headers.forEach(function (value, header) { response.setHeader(header, value); });
    response.statusCode = status;
    response.end(reason || HttpStatus[status], "utf8");
  });
  service.onError.addOnce(function (err) {
    if (!response.headersSent) {
      response.statusCode = err.status || err.statusCode || 500;
      response.setHeader("Content-Type", "text/plain");
      response.end(HttpStatus[response.statusCode], "utf8");
    } else if (response.connection.writable) {
      response.end();
    }
  });
  service.onError.add(function (err) {
    console.error(err, id);
  });

  console.log(`${id} - SERVICE - ${ServiceType[service.type]} - ${service.repository}`)

  service.inform("Served from package 'git-service' found at npmjs.com");

  if (!await service.exists()) {
    await service.reject(404);
  } else if (!await service.access()) {
    await service.reject(403);
  } else {
    await service.accept();
  }
});

process.on("SIGTERM", () => server.close());
server.listen(port, () => console.log(`server is listening on port ${port}`));

function safeParseInt(source, default_value) {
  const value = parseInt(source);
  return Number.isNaN(value) ? default_value : value;
}
```

## Public API

**List of related apis** (grouped by type):

- `class`
  - [Header](.) ([node-fetch](https://www.npmjs.com/package/node-fetch))

**List of exports** (grouped by type):

- `class`
  - [Service](.)
  - [ServiceError](.)
- `function`
  - [checkIfValidServiceDriver](.)
- `enum`
  - [ServiceType](.)
  - [ServiceErrorCode](.)
  - [RequestStatus](.)
- `interface`
  - [IRequestPullData](.)
  - [IRequestPushData](.)
  - [IServiceDriver](.)
  - [IServiceAcceptData](.)
  - [IServiceRejectData](.)

### Flags

In the api reference you will find some arguments/properties/methods are marked with one or more flags. Below is a list explaining what those flags mean.

- *[optional]* - Any argument/property marked with this flag can be omitted.

- *[read-only]* - Any property marked with this flag can only be read, and not written to.

### **Service** (class)

High-level git service.

#### Constructor

Accepts 5 arguments and will throw if it is supplied the wrong type or to few
arguments.

- `driver`
  \<[IServiceDriver](.)>
  Service driver to use. See [createDriver](.) for how to create a driver.
- `method`
  \<[String](.)>
  Upper-cased HTTP method for request.
- `url_fragment`
  \<[String](.)>
  A fragement of or the full url. Will extract repository from here if possible.
- `headers`
  \<[Headers](.)
  | [Array](.)
  | [Object](.)>
  Request headers supplied as: 1) an instance of [Headers](.),
  2) a key-value array, or 3) a plain object with headers as keys.
- `input`
  \<[Readable](.)>
  Input (normally the request itself)

#### Properties

- `awaitReady`
  *[read-only]*
  \<[Promise](.)\<[void](.)>>
  Resolves when input is parsed.
- `capebilities`
  *[read-only]*
  \<[Map](.)\<[String](.), `true`
  | [String](.)>>
  Capebilities of client.
- `driver`
  *[read-only]*
  \<[IServiceDriver](.)>
  Service driver.
- `type`
  *[read-only]*
  \<[ServiceType](.)>
  Requested service. Defaults to [`ServiceType.Unknown`](.).
- `metadata`
  *[read-only]*
  \<[Array](.)\<[IRequestPullData](.)
  | [IRequestPushData](.)>>
  An array containing request pull/push data depending on `Service.type`.
- `ready`
  *[read-only]*
  \<[Boolean](.)>
  Indicates input is parsed.
- `status`
  *[read-only]*
  \<[RequestStatus](.)>
  Request status, incdicates if service was accepted, rejected or is still pending.
- `repository`
  \<[string](.)>
  Repository to use.

#### Methods

- `accept`
  \<[Promise](.)\<[void](.)>>
  Accept service. Result may be rejected if driver returns a status of `4xx` or `5xx`. Will only show results once.
- `reject`
  \<[Promise](.)\<[void](.)>>
  Reject service. Will only show results once.
  - `status`
    *[optional]*
    \<[Number](.)>
    Status code to reject with. Either a `4xx` or `5xx` code.
  - `reason`
    *[optional]*
    \<[String](.)>
    Reason for rejection. Defaults to status message.
- `empty`
  \<[Promise](.)\<[Boolean](.)>>
  Check if repository exists and is empty.
- `exists`
  \<[Promise](.)\<[Boolean](.)>>
  Check if repository exists.
- `access`
  \<[Promise](.)\<[Boolean](.)>>
  Check if current service is available for use. (Service may still be forced).
- `init`
  \<[Promise](.)\<[Boolean](.)>>
  Initialises repository, but only if non-existant.
- `inform`
  \<[Promise](.)\<[void](.)>>
  Informs client of messages.
  - `...messages`
  \<[Array](.)\<[String](.)>
    | [Buffer](.)>
    Messages to inform client.

#### Signals

- `onAccept`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)\<[ISignalAcceptData](.)>>
  Dispatched when request is accepted.

- `onReject`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)\<[ISignalRejectData](.)>>
  Dispatched when request is rejected.

- `onError`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)\<[Error](.)>>
  Dispatched when anything internal goes wrong with thrown error.

### **ServiceError** (class)

Dispatched on service if any abnormaltis araise. Extends inbuilt [Error](.).

#### Additional properties

- `errorCode`
  \<[ServiceErrorCode](.)>
  Error code

### **ServiceType** (enum)

#### Values

- `Unknown` = 0
- `Advertise` = 1
- `Pull` = 2
- `Push` = 3

### **RequestStatus** (enum)

#### Values

- `Pending` = 0
- `Accepted` = 1
- `Rejected` = 2
- `AcceptedButRejected` = 3

### **ServiceErrorCode** (enum)

#### Values

- `InvalidContentType`
- `InvalidMethod`
- `InvalidServiceName`
- `RepositoryCannotBeEmpty`
- `UnknownError`

### **IRequestPullData** (interface)

Contains data of what client wants from this pull request.

#### Properties

- `commits`
  \<[Array](.)\<[String](.)>>
  Commit. In plural form for compatibility with IRequestPushData.
- `type`
  \<`"have"`
  | `"want"`>
  Pull type, can be either have or want.

### **IRequestPushData** (interface)

Contains data of what client want to do in this push request.

#### Properties

- `commits`
  \<[Array](.)\<[String](.)>>
  Commits. In order of old commit, new commit.
- `type`
  \<`"create"`
  | `"delete"`
  | `"update"`>
  Push type, can be one of create, delete or update.
- `refname`
  \<[String](.)>
  Reference to work with.

### **IServiceDriver** (interface)

Abstract driver to work with git.

#### Properties

- `origin`
  *[read-only]*
  \<[String](.)>
  Either an URL or absolute path leading to repositories.

#### Methods

- `access`
  \<[Promise](.)\<[Boolean](.)>>
  Checks access to service indicated by hint for repository at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
  - `hint`
    \<[String](.)>
    Hint indicating service to check.
- `empty`
  \<[Promise](.)\<[Promise](.)>>
  Check if repository exists and is empty at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
- `exists`
  \<[Promise](.)\<[Promise](.)>>
  Check if repository exists at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
- `get`
  \<[Promise](.)\<[IServiceAcceptData](.)>>
  Process service indicated by hint, and return data from git.
  - `repository`
    \<[String](.)>
    Repository to work with.
  - `hint`
    \<[String](.)>
    Hint indicating service to check.
  - `headers`
    \<[Headers](.)>
    Http headers to append if sent over http(s).
  - `input`
    *[optional]*
    \<[Readable](.)>
    Input (processed request body)
  - `messages`
    *[optional]*
  \<[Array](.)\<[Buffer](.)>>
    Buffered messages to client.
- `hint`
  \<[String](.)>
  Get hint used by driver to determine service. Return value must be chosen hint.
  - `...hints`
  \<[Array](.)\<[String](.)>>
    An array contaings hints to choose from. Currently only 2 hints available.
- `init`
  \<[Promise](.)\<[Boolean](.)>>
  Initialise a bare repository at origin, but only if repository does not exist.
  - `repository`
    \<[String](.)>
    Repository to init.

### **IServiceAcceptData** (interface)

Contains data needed to fufill request.

#### Properties

- `status`
  \<[Number](.)>
  Status code for response. Either a `2xx` or `3xx` code.
- `headers`
  \<[Headers](.)>
  Headers for response.
- `body`
  \<[Readable](.)>
  Body for response.

### **IServiceRejectData** (interface)

Contains data needed to reject request.

#### Properties

- `status`
  \<[Number](.)>
  Status code for response. Either a `4xx` or `5xx` code.
- `headers`
  \<[Headers](.)>
  Headers for response.
- `reason`
  *[optional]*
  \<[String](.)>
  Optional reason for rejection.

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
