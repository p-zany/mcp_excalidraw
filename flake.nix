{
  description = "Powerful Drawing API for LLM Integration";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-parts.url = "github:hercules-ci/flake-parts";
    devenv.url = "github:cachix/devenv";
  };

  outputs = inputs@{ nixpkgs, flake-parts, devenv, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.devenv.flakeModule
      ];
      systems = nixpkgs.lib.systems.flakeExposed;

      perSystem = { config, self', inputs', pkgs, system, ... }: {
        packages = rec {
          default = mcp-excalidraw;
          mcp-excalidraw = pkgs.callPackage ./package.nix {};
        };

        devenv.shells.default = {
          languages.javascript = {
            enable = true;
            npm.enable = true;
          };
        };
      };
    };
}
