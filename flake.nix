{
  description = "Nix flake for ctxrs/ctx (prebuilt binary mirror with SHA256SUMS-verified auto-updates)";

  inputs = {
    # nixpkgs 26.11 dropped x86_64-darwin; keep the four-system support
    # surface aligned with codex-nix by pinning the supported Darwin branch.
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-26.05-darwin";
  };

  outputs =
    { self, nixpkgs }:
    let
      supportedSystems = [
        "aarch64-darwin"
        "x86_64-darwin"
        "aarch64-linux"
        "x86_64-linux"
      ];
      forAllSystems = nixpkgs.lib.genAttrs supportedSystems;

      sources = builtins.fromJSON (builtins.readFile ./sources.json);

      mkCtx =
        pkgs:
        let
          lib = pkgs.lib;
          system = pkgs.stdenv.hostPlatform.system;
          source =
            sources.systems.${system}
              or (throw "ctx-nix: unsupported system ${system}. Supported: ${lib.concatStringsSep ", " (lib.attrNames sources.systems)}");
        in
        pkgs.stdenv.mkDerivation {
          pname = "ctx";
          version = sources.version;
          src = pkgs.fetchurl { inherit (source) url hash; };

          nativeBuildInputs = lib.optionals pkgs.stdenv.hostPlatform.isLinux [
            pkgs.autoPatchelfHook
          ];

          buildInputs = lib.optionals pkgs.stdenv.hostPlatform.isLinux [
            pkgs.stdenv.cc.cc.lib
          ];

          dontUnpack = true;
          dontConfigure = true;
          dontBuild = true;

          installPhase = ''
            runHook preInstall
            install -Dm755 $src $out/bin/ctx
            runHook postInstall
          '';

          meta = with lib; {
            description = "Local CLI for indexing and searching agent session history";
            homepage = "https://github.com/ctxrs/ctx";
            license = licenses.asl20;
            platforms = builtins.attrNames sources.systems;
            mainProgram = "ctx";
            sourceProvenance = with sourceTypes; [ binaryNativeCode ];
          };
        };
    in
    {
      packages = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          ctx = mkCtx pkgs;
        in
        {
          inherit ctx;
          default = ctx;
        }
      );

      overlays.default = final: _prev: {
        ctx = mkCtx final;
      };

      devShells = forAllSystems (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
        in
        {
          default = pkgs.mkShell {
            packages = with pkgs; [
              deno
              gh
              just
              jq
              nixfmt
            ];
          };
        }
      );

      checks = forAllSystems (system: {
        build = self.packages.${system}.ctx;
      });

      formatter = forAllSystems (system: nixpkgs.legacyPackages.${system}.nixfmt);
    };
}
