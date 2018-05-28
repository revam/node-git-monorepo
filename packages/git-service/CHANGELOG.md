# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](http://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/revam/koa-git-smart-proxy/compare/git-service-v1.0.1...HEAD
[1.0.1]: https://github.com/revam/koa-git-smart-proxy/compare/git-service-v1.0.0...git-service-v1.0.1
