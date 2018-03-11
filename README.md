# git-service

Serve git over http(s).

## Install

```sh
npm install --save git-service
```

## What is this?

This is a framework independent library for serving git over http(s). It exports an
abstract service which can either be used standalone or extended to your needs.

I am not a fan of event emitters used in a middleware-driven workflow, as it tends to
break the pattern, so I made this library which, in my eyes, is better suited for such
uses. It's a side-project, so expect irregular updates, if any, in case you want to use
it. Below you can find some simular projects which helped me greatly when creating this
package. Also a great help was the technical documentation for git, which can be found
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
- [x] support http smart protocol (git-upload-pack & git-receive-pack)
- [x] can push sideband messages to client (inform client)
- [ ] check access per service per repository (lookup in config)

## Framework spesific packages

- [git-service-http](.)
- [git-service-koa](.)
- [git-service-express-middleware](.)

## Simular projects

- [pushover](https://github.com/substack/pushover) ([npm](.))
- [git-http-backend](https://github.com/substack/git-http-backend) ([npm](.))
- [git-server](.) ([npm](.))
- [grack](.) (ruby on rails)

## Usage

**Note:** It is recommended to use a service or middleware from a sub-package.

```js
import http from "http";
import HttpStatus from "http-status";
import { Service, ServiceType, createDriver } from "git-service";

const { ORIGIN_ENV: origin = "/data/repos" } = process.env;
const driver = createDriver(origin);
const server = http.createServer(async function(request, response) {
  if (request.url === "/favicon.ico") {
    response.statusCode = 404;
    return resonse.end();
  }

  console.log(`REQUEST - ${request.method} - ${request.url}`);

  const service = new Service(driver, request.method, request.url, request.headers, request);

  service.onAccept.addOnce(function ({status, headers, stream}) {
    headers.forEach(function (value, header) { response.setHeader(header, value) });
    response.statusCode = status;
    stream.pipe(response, {end: true});
  });
  service.onReject.addOnce(function ({status, headers, reason}) {
    headers.forEach(function (value, header) { response.setHeader(header, value) });
    response.statusCode = status;
    response.end(reason || HttpStatus[status], "utf8");
  });
  service.onError.addOnce(function(err) {
    console.error(err);
    if (!response.headersSent) {
      response.statusCode = err.status || err.statusCode || 500;
      response.setHeader("Content-Type", "text/plain");
      response.end(HttpStatus[response.statusCode], "utf8");
    }
  });

  console.log(`SERVICE - ${ServiceType[service.type]} - ${service.repository}`);

  // Only needed if you want to check request capebilities or metadata.
  // await service.awaitReady;

  if (!await service.exists()) {
    await service.reject(404);
  } else if (!await service.access()) {
    await service.reject(403);
  } else {
    await service.accept();
  }

  console.log(`RESPONSE - ${request.method} - ${request.url} - ${response.statusCode}\n`);
});

process.on("SIGTERM", async function() {
  server.close();
});

server.listen(3000, () => console.log("server is listening on port 3000"));
```

## Public API

### Flags explained

In the api you will find that some arguments/properties/methods are marked with one or more flags. Below is a list explaining what does flags mean.

#### Property modifiers

- *[optional]* - Any argument/property marked with this flag can be omitted.

- *[read-only]* - Any property marked with this flag can only be read, and not written to.

#### Value modifiers

- *[async]* - Any property/method marked with this flag has the value wrapped in a `Promise` resolving to it.

- *[array]* - Any argument/property/method marked with this flag has the value shown wrapped in an `Array` instance containing only typeof value.

- *[set]* - Any argument/property/method marked with this flag has the value shown wrapped in an `Set` instance containing only typeof value.

### Index

API grouped by relevance

- `Service`
  - [Service](.)
  - [ServiceType](.)
  - [RequestStatus](.)
  - [IServiceAcceptData](.)
  - [IServiceRejectData](.)
  - [IRequestPullData](.)
  - [IRequestPushData](.)
- `IServiceDriver`
  - [IServiceDriver](.)
  - [createDriver](.)
  - [createLocalDriver](.)
  - [createHttpDriver](.)
  - [isValidDriver](.)
- `ServiceError`
  - [ServiceError](.)
  - [ServiceErrorCode](.)

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
  The full URL or tail of the url. Will extract repository from here if possible.
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
  *[async]*
  \<[void](.)>
  Resolves when input is parsed.
- `capebilities`
  *[read-only]*
  *[set]*
  \<[String](.)>
  Capebilities client is able to use. Each capebility is expressed as a string.
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
  *[array]*
  \<[IRequestPullData](.)
  | [IRequestPushData](.)>
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
  *[async]*
  \<[void](.)>
  Accept service. Result may be rejected if driver returns a status of `4xx` or `5xx`. Will only show results once.
- `reject`
  *[async]*
  \<[void](.)>
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
  *[async]*
  \<[Boolean](.)>
  Check if repository exists and is empty.
- `exists`
  *[async]*
  \<[Boolean](.)>
  Check if repository exists.
- `access`
  *[async]*
  \<[Boolean](.)>
  Check if current service is available for use. (Service may still be forced).
- `init`
  *[async]*
  \<[Boolean](.)>
  Initialises repository, but only if non-existant.
- `inform`
  *[async]*
  \<[void](.)>
  Informs client of messages.
  - `...messages`
    *[array]*
    \<[String](.)
    | [Buffer](.)>
    Messages to inform client.

#### Signals

- `onAccept`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)>
  Dispatched when request is accepted with payload of type [`IServiceAcceptData`](.).

- `onReject`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)>
  Dispatched when request is rejected with payload of type [`IServiceRejectData`](.).

- `onError`
  \<[Signal](https://www.npmjs.com/package/micro-signals#signal)>
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
  *[array]*
  \<[String](.)>
  Commit. In plural form for compatibility with IRequestPushData.
- `type`
  \<`"have"`
  | `"want"`>
  Pull type, can be either have or want.

### **IRequestPushData** (interface)

Contains data of what client want to do in this push request.

#### Properties

- `commits`
  *[array]*
  \<[String](.)>
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
  *[async]*
  \<[Boolean](.)>
  Checks access to service indicated by hint for repository at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
  - `hint`
    \<[String](.)>
    Hint indicating service to check.
- `empty`
  *[async]*
  \<[Promise](.)>
  Check if repository exists and is empty at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
  *[async]*
- `exists`
  *[async]*
  \<[Promise](.)>
  Check if repository exists at origin.
  - `repository`
    \<[String](.)>
    Repository to check.
- `get`
  *[async]*
  \<[IServiceAcceptData](.)>
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
    *[array]*
    \<[Buffer](.)>
    Buffered messages to client.
- `hint`
  \<[String](.)>
  Get hint used by driver to determine service. Return value must be chosen hint.
  - `...hints`
    *[array]*
    \<[String](.)>
    An array contaings hints to choose from. Currently only 2 hints available.
- `init`
  *[async]*
  \<[Boolean](.)>
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

### **createDriver** (function)

Creates and returns a driver fit for origin. Also see [IServiceDriver](.).

#### Arguments

- `origin`
  \<[String](.)>
  Either an url or a path.

### **createLocalDriver** (function)

Creates a service driver for the filesystem.

#### Arguments

- `origin`
  \<[String](.)>
  A relative or absolute path. Path will be resolved from current working directory if
  relative.

### **createHttpDriver** (function)

Creates a service driver forwarding to a http(s) server.

#### Arguments

- `origin`
  \<[String](.)>
  An url using the http(s) protocol.

## Typescript

This module includes a [TypeScript](https://www.typescriptlang.org/)
declaration file to enable auto complete in compatible editors and type
information for TypeScript projects. This module depends on the Node.js
types, so install `@types/node`:

```sh
npm install --save-dev @types/node
```

## License

MIT. See [LICENSE](./license)
