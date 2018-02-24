# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

## Changed

- Forward to a seperate git daemon instead of spawning a git sub-process (More proxy-like behaviour)
- Renamed exported interfaces.
- Renamed exported function `exists` to `repositoryExists` and changed call signature.
- Renamed exported function `match` to `getProxy`, and changed call signature and return value.
- Combined `GitBasePack`, `ReceivePack` and `UploadPack` into `GitProxyCore`,
  and also moved some more properties into core.
- Renamed `accept` to `forward` on core class to better describe what it (now) does.
- `GitProxyCore.forward` and `repositoryExists` now throw on empty uri/repository.
- `getProxy` now throw `ProxyError`s on invalid input.

## Added

- Export a new error type, `ProxyError`.

## [1.0.1] - 2018-01-16

## Changed

- Exclude `.vscode` folder from package

## 1.0.0 - 2018-01-16

### Added

- Created a seperate package for core functionality.

[Unreleased]: https://github.com/revam/koa-git-smart-proxy/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/revam/koa-git-smart-proxy/compare/v1.0.0...v1.0.1
