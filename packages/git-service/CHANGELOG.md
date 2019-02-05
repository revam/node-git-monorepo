# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Class `GenericDriver` now allows an empty origin, but will require every
  request to provide `request.path` as an absolute path or an url to the
  repository storage location. Also, no error will be thrown if `request.path`
  fails to meet the above criteria, and the driver will simply return a negative
  (or no) response. This is subject-to-change in a future version.

  Provided origin will now be resolved from the working directory if found to be
  a relative path.

## [2.5.0] - 27-01-2019

### Added

- Added two new methods `LogicController.await` and `LogicController#await` to
  wait till request body is fully inspected and request is ready for use.

- Added a new class `GenericDriver` implementing the `IDriver` interface for
  both file system access and forwarding to other http(s) servers. It is also
  now possible to pass a full URI to `GenericDriver#serve`, to serve from
  another remote origin regardless of driver-set origin.

  **Note**

  The input path is sanetized and prepended with "`/`" when a new request is
  created with `LogicController#create`.
  So no need to worry if any users supply a path starting with an uri protocol
  (e.g. `"https://example.org/https://foo.bar/baz"` -> request.path =
  `"/https://foo.bar/baz"`), as it will **always** be prepended.
  To forward to another origin you need to set the path manually, preferrably
  in a proxied `checkIfExists`, to a path starting with a http or https protocol
  (e.g. `"https://foo.bar/baz"`). See example below.

  ```js
  import { LogicController } from "git-service";

  /**
   * Some magical function to map input path to its corresponding origin.
   * @param {string} path
   * @return {string|undefined} Mirrored path or {@link undefined}.
   */
  function findMirrorForPath(path) { /* m a g i c */ }

  const controller = new LogicController({
    // Default mirror
    origin: "https://mirror1.git.local/r/",
    methods: {
      checkIfExists(request) {
        if (!request.service || !request.path) {
          return false;
        }
        const mirror = findMirrorForPath(request.path);
        if (mirror) {
          request.path = mirror;
        }
        // Let the base method handle the rest.
      }
    }
  });
  ```

### Changed

- Built javascript files no longer contain any comments, only code. Their
  corresponding declaration files still contain any relevant comments.

- `LogicController#create` is now a sync method, and will not return a promise.

  **Note:** Before using the request object manually it is recommended to call
  either `LogicController.await` or `LogicController#await`, to be sure all
  processing is done and the request is ready for use.
  If you use `LogicController#serve` to serve your request, then this is not
  necessary.

- Deprecated the following exports, to-be-removed in next mayor update:
  - `IGenericDriverOptions` & `ProxiedMethods`: Use new namespaced exports from
    `GenericDriver` export.
  - `createDriver`, `createFSDriver` & `createHttpDriver`: Replaced by class
    `GenericDriver`.
  - `LogicControllerMiddleware`: Use new namespaced exports from
    `LogicController` export.

## [2.4.1] - 2018-12-30

### Fixed

- Fixed potential security vulnerability in the merge dependency.

## [2.4.0] - 2018-10-20

### Changed

- Accepted method is now sanetized to upper-case, so `LogicController#create`
  and `LogicController#serve` now also accept methods in lower-case or a mix of
  lower- and upper-case.

- Update readme to reflect better what this package/library is, what you would
  need before using, and update the usage examples.

- Check if repository is enabled before client has access to it in the logic
  controller. Because this seems more sane to do.

### Fixed

- POST requests take waaay too long to prepare the request. Required an update
  of dependency git-packet-streams.

## [2.3.0] - 2018-09-23

### Added

- Added a new class `LogicControllerContext`, used as `this` in any middleware
  that registers with `LogicController#use`. Has almost the same methods as
  controller, but you don't need to add the request object for every call.
  See usage examples for how to use.

### Changed

- Updated snippets in readme.

### Fixed

- Fixed compiler errors in tests after upgrading jest.

## [2.2.0] - 2018-09-23

### Added

- Added two new (readonly) properties, `url` and `method`, on `IRequestData`,
  for logging/analystics purposes, but how they are used is up to the
  application.

### Changed

- Production builds no longer contain source maps at all.

- Development builds now contain source maps for code and declaration files.

- Moved functionality from "src/request.ts" into "src/logic-controller.ts", as
  non-exports. Since the exports from "src/request.ts" was only used by
  "src/logic-controller.ts".

- Tweaked linting rules and npm scripts

### Fixed

- Not all properties in request- and response object had the `enumerable` property
  in their descriptor object.

- Fixed incorrect error code for errors thrown from `onUsable`/`onComplete`
  signals.

- Fixed interface `IRequestData` not reflecting all possible states for
  properties `service` and `path`.

- Linting warnings/errors for source/test code.

## [2.1.0] - 2018-09-21

### Added

- Added a new method `use(...middleware)` to controller as a simpler way of
  adding middleware (listeners on onUsable).

## [2.0.0] - 2018-09-20

### Added

- `IResponseData` now has a property `state` shared with its corresponding
  `IRequestData`.

### Changed

- Moved from TypeScript 2.x to 3.x, and enabled stricter options for compiler.
  Making it somewhat easier to spot errors at design-time. Also corrected
  existing code where the IDE complained.

- Updated package description.

- Updated multiple sections in read-me file. Added some more install options,
  changed/updated examples and clarified there are no documentation (on the web
  as of yet).

- A sane http server should accept HEAD where it accepts GET. So HEAD will now
  be recognised the same as GET, and no body will be sent from middleware
  created by `createMiddleware` if the request method is HEAD.

  **Example**

  When running a server at localhost:3000. (Below code works with current
  version and previous version).

  ```js
  import { createServer } from "http";
  import { createController, createMiddleware } from "git-service";

  const controller = createController(process.env.ORIGIN_ENV);
  const middleware = createMiddlware(controller);
  const server = createServer(middleware);
  server.listen(3000, (err) =>
    err ? console.error(err) : console.log("listening on port 3000"));
  ```

  Before:

  ```sh
  $ curl --verbose --head http://localhost:3000/$REPO/info/refs?service=git-upload-pack
  *   Trying 127.0.0.1...
  * TCP_NODELAY set
  * Connected to localhost (127.0.0.1) port 3000 (#0)
  > HEAD /$REPO/info/refs?service=git-upload-pack HTTP/1.1
  > Host: localhost:3000
  > User-Agent: curl/7.52.1
  > Accept: */*
  >
  < HTTP/1.1 500 Internal Server Error
  < Content-Type: text/plain
  < Content-Length: 21
  < Date: $DATE
  < Connection: keep-alive
  <
  * Curl_http_done: called premature == 0
  * Connection #0 to host localhost left intact
  ```

  Now:

  ```sh
  $ curl --verbose --head http://localhost:3000/$REPO/info/refs?service=git-upload-pack
  *   Trying 127.0.0.1...
  * TCP_NODELAY set
  * Connected to localhost (127.0.0.1) port 3000 (#0)
  > HEAD /$REPO/info/refs?service=git-upload-pack HTTP/1.1
  > Host: localhost:3000
  > User-Agent: curl/7.52.1
  > Accept: */*
  >
  < HTTP/1.1 200 OK
  < content-type: application/x-git-upload-pack-advertisement
  < content-length: $CONTENT_LENGTH
  < Date: $DATE
  < Connection: keep-alive
  <
  * Curl_http_done: called premature == 0
  * Connection #0 to host localhost left intact
  ```

- Requests and responses are now linked together, and their property `state` is
  shared.

- New requests are created from the controller, either when `controller.serve`
  is called or explicitly through `controller.create`. Both accept the same
  arguments, but `controller.serve` also accepts a request object as an
  argument.

  **Example**

  Before:

  ```js
  import { createController, createService } from "git-service";
  import { PassThrough } from "stream";

  const controller = createController(process.env.ORIGIN_ENV);
  const instance = createService(
    controller,
    "https://git.example.org/example.git/info/refs?service=git-upload-pack",
    "GET",
    {},
    new PassThrough(),
  );
  const response = await instance.serve();
  ```

  Now:

  ```js
  import { createController } from "git-service";
  import { PassThrough } from "stream";

  const controller = createController(process.env.ORIGIN_ENV);
  const request = controller.create(
    new PassThrough(),
    {},
    "GET",
    "https://git.example.org/example.git/info/refs?service=git-upload-pack",
  );
  const response = await controller.serve(request);
  // or from request
  const response = request.response;
  ```

  Or:

  ```js
  import { createController } from "git-service";
  import { PassThrough } from "stream";

  const controller = createController(process.env.ORIGIN_ENV);
  const response = await controller.serve(
    new PassThrough(),
    {},
    "GET",
    "https://git.example.org/example.git/info/refs?service=git-upload-pack",
  );
  ```

- Changed signals used. Instead of a signal for when the request is created
  (`onRequest`) and when the response is created (`onResponse`), we now have a
  signal for when a request is usable (`onUsable`) and a signal for when
  processing of a request is complete (`onComplete`). Also, since the `IService`
  interface is removed, the signals are moved onto the controller, which means
  signals now operate on multiple requests.

- Sideband messages are now unique to each instance, and are not shared across
  instances. To send a message you must use the `sendMessage` method on the
  response object.

- All methods of `IDriver` now requires the request and response as arguments.

- The `createResponse` method of `IDriver` has been replaced by `serve`, to
  better accumulate its functionality. The serve function should not return any
  response data, but directly set the data onto the provided response object.

- Replaced the `IProxiedMethods` interface with the `ProxiedMethods` type.

### Fixed

- `header.set` and `header.append` did not handle `undefined` values. Which it
  should.

- Some properties on `IResponseData` was readonly when they should be
  read/write.

### Removed

- Removed `IService` interface, moving its functionality into `LogicController`.

- Removed method `signature` from `IRequestData` and `IResponseData`. Its better
  for the application to determine how a signature (for an e-tag) should be
  made.

- Removed the `IDriverResponseData` interface, as it no longer has any use.

## [1.0.1] - 2018-05-28

### Added

- Added property `state` to `IRequestData`. For use with applications.

### Changed

- Updated multiple sections in read-me file:
  - Removed a lot of extra text from installation
  - Replaced placeholders with real links
  - Updated related packages, as some does not exist (as of yet)
  - Changed package description (section `What is this?`)
  - Updated/clearified examples (section `Usage`)
- Updated previous entries in changelog.

### Fixed

- Fixed return types of methods in `IProxyMethods`.
- Fixed optional argument `options` being requeired in `createController`.
- Simplified one part of `createRequest`.

## 1.0.0 - 2018-05-27

### Added

- Initial public release

[Unreleased]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.5.0...HEAD
[2.5.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.4.1...git-service/v2.5.0
[2.4.1]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.4.0...git-service/v2.4.1
[2.4.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.3.0...git-service/v2.4.0
[2.3.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.2.0...git-service/v2.3.0
[2.2.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.1.0...git-service/v2.2.0
[2.1.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v2.0.0...git-service/v2.1.0
[2.0.0]: https://github.com/revam/node-git-monorepo/compare/git-service/v1.0.1...git-service/v2.0.0
[1.0.1]: https://github.com/revam/node-git-monorepo/compare/git-service/v1.0.0...git-service/v1.0.1
