# ctx-nix

[![CI](https://github.com/wadackel/ctx-nix/actions/workflows/ci.yaml/badge.svg)](https://github.com/wadackel/ctx-nix/actions/workflows/ci.yaml)

A Nix flake that packages [ctx](https://github.com/ctxrs/ctx) as a prebuilt
binary. It is intended for users who want a Nix-managed `ctx` package while
`ctx` is not available in nixpkgs.

## Why this flake

- Provide a Nix package and overlay for the upstream `ctx` release binaries.
- Track the newest Nix-compatible upstream release through a small
  `sources.json` pin file.
- Verify refreshed release assets against upstream `SHA256SUMS` before writing
  new Nix SRI hashes.

## Supported systems

- `aarch64-darwin`
- `x86_64-darwin`
- `aarch64-linux`
- `x86_64-linux`

Windows and FreeBSD release assets are published by upstream, but they are
intentionally outside this flake's initial Nix output scope.

## Install

### Run ad-hoc

```sh
nix run github:wadackel/ctx-nix -- --version
```

### Use as a flake input

```nix
{
  inputs.ctx-nix.url = "github:wadackel/ctx-nix";
  inputs.ctx-nix.inputs.nixpkgs.follows = "nixpkgs";

  outputs =
    { nixpkgs, ctx-nix, ... }:
    {
      packages.x86_64-linux.ctx = ctx-nix.packages.x86_64-linux.ctx;

      nixpkgs.overlays = [ ctx-nix.overlays.default ];
    };
}
```

The package installs the selected upstream release asset as `$out/bin/ctx`.

## Unmanaged install behavior

This flake is an unmanaged `ctx` install. It does not run the official
installer, install bundled integrations, run initial setup, or write the
installer marker used by `ctx upgrade` and background self-upgrade.

After installing through Nix, run the upstream setup steps that matter for your
environment:

```sh
ctx integrations install skills
ctx setup
```

Use Nix to upgrade this package. `ctx upgrade` is not expected to manage a
binary installed by this flake.

## How updates work

The scheduled GitHub Actions workflow:

1. Lists stable `ctxrs/ctx` GitHub releases.
2. Accepts only stable tags matching `^vX.Y.Z$`.
3. Skips Linux assets that require a newer glibc than this flake's pinned
   Nixpkgs provides.
4. Downloads upstream `SHA256SUMS`.
5. Downloads each selected Linux/macOS asset and checks its SHA-256 digest
   against `SHA256SUMS`.
6. Computes the Nix SRI hash from the verified bytes and atomically rewrites
   `sources.json`.
7. Re-runs the flake checks before committing and pushing the refreshed pin.

This is a checksum-verified update-time trust model. Builds are pinned by the
SRI hashes in `sources.json`; update verification checks that those hashes were
computed from assets matching upstream `SHA256SUMS`. Upstream does not publish
Sigstore bundles for these assets today, so this flake does not claim Sigstore
verification.

## Development

```sh
nix develop
just check
just build
just test
just update
```

`just update` prints `changed` when `sources.json` is rewritten and `unchanged`
when the repository already tracks the selected compatible upstream release.

## License

This repository is licensed under the MIT License. See `LICENSE`.

The `ctx` binaries redistributed through this flake are produced by
`ctxrs/ctx` under the Apache License 2.0. See `LICENSE-CTX`.
