# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New exports: `Service`, `IRequestPullData`, `IRequestPushData`, `IServiceAcceptData`,
  `IServiceRejectData`, `IServiceDriver`, `IServiceDriverCache`
- Made all enums ParscalCase. (ServiceType.PULL -> ServiceType.Pull)
- All exports have sane names.
- New sections in README.md

### Changed

- New package name
- Reworked README.md
- Reworked package exports

### Removed

- Removed exports: `GitBasePack`, `UploadPack`, `ReceivePack`, `match`, `exists`

## [1.0.1] - 2018-01-16

## Changed

- Exclude `.vscode` folder from package

## 1.0.0 - 2018-01-16

### Added

- Created a seperate package for core functionality.

[Unreleased]: https://github.com/revam/koa-git-smart-proxy/compare/v1.0.1...HEAD
[1.0.1]: https://github.com/revam/koa-git-smart-proxy/compare/v1.0.0...v1.0.1
