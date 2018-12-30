# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2018-12-31

### Changed

- Remade middleware for 2.x versions of base package.

- Comments are now only emitted in declarations.

### Fixed

- Fixed potential security vulnerability in the merge dependency.

- Corrected example in readme.

## [1.0.1] - 2018-05-28

### Added

- Added usage example in read-me file.
- All exports from base package are now also exported from this package
- Linked koa context state with service request state.

### Changed

- Renamed `createMiddleware` to `createKoaMiddleware`, so the name does not
  conflict with export from base package.
- Also renamed `IMiddlewareOptions` to `IKoaMiddlewareOptions` for the same
  reason.

### Fixed

- Fixed wrong package name/description in read-me file.

## 1.0.0 - 2018-05-27

### Added

- Initial public release

[Unreleased]: https://github.com/revam/koa-git-smart-proxy/compare/git-service-koa-v2.0.0...HEAD
[2.0.0]: https://github.com/revam/koa-git-smart-proxy/compare/git-service-koa-v1.0.1...git-service-koa-v2.0.0
[1.0.1]: https://github.com/revam/koa-git-smart-proxy/compare/git-service-koa-v1.0.0...git-service-koa-v1.0.1
