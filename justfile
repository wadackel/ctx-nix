# Recipes are run inside `nix develop` so they pick up the dev shell tools.

default:
    @just --list

# Refresh sources.json against the latest stable ctxrs/ctx release.
update:
    @deno run --allow-read --allow-write --allow-run --allow-env --allow-net scripts/update-sources.ts

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
