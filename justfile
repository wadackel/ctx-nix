# Recipes are run inside `nix develop` so they pick up the dev shell tools.

default:
    @just --list

# Refresh sources.json against the latest stable ctxrs/ctx release.
# update-sources.ts finishes its write by renaming a UUID-suffixed temp file,
# Deno.rename requires read on the source, and --allow-read takes no globs — so
# no per-file list can ever name that path. Every path the script touches lives
# under the repository root, so the directory is the tight scope.
update:
    @deno run --allow-read=. --allow-write=. --allow-run=gh,nix --allow-env=HOME,GH_TOKEN --allow-net=api.github.com,github.com,release-assets.githubusercontent.com,objects.githubusercontent.com scripts/update-sources.ts

# Run the full flake check.
check:
    @nix flake check

# Smoke-build the ctx package for the current system.
build:
    @nix build .#ctx

# Format flake.nix with nixfmt.
fmt:
    @nixfmt flake.nix

# Run the Deno unit tests.
test:
    @deno test scripts/
