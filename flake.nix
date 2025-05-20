{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.05";
    systems.url = "github:nix-systems/default";
    devenv.url = "github:cachix/devenv";
    devenv.inputs.nixpkgs.follows = "nixpkgs";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = {
    self,
    nixpkgs,
    devenv,
    systems,
    ...
  } @ inputs: let
    forEachSystem = nixpkgs.lib.genAttrs (import systems);
  in {
    packages = forEachSystem (system: let
      pkgs = nixpkgs.legacyPackages.${system};
      pnpm = pkgs.pnpm.override {nodejs = pkgs.nodejs_24;};

      default = pkgs.stdenv.mkDerivation (finalAttrs: {
        pname = "rekisteri";
        version = self.rev or "dirty";

        src = ./.;

        nativeBuildInputs = with pkgs; [
          nodejs_24
          pnpm.configHook
        ];

        STRIPE_API_KEY = "sk_test_...";
        STRIPE_WEBHOOK_SECRET = "whsec_...";
        DATABASE_URL = "postgres://root:mysecretpassword@localhost:5432/local";

        pnpmDeps = pnpm.fetchDeps {
          inherit (finalAttrs) pname version src;
          # hash = "sha256-hHptEVSkXA2oJhCbmPrbCcE1p7p8erEqOD+m9TpqXKw=";
        };

        installPhase = ''
          runHook preInstall
          pnpm build
          cp -r build $out
          pnpm prune --prod
          cp -r node_modules $out
          runHook postInstall
        '';
      });
    in {
      inherit default;
      docker = pkgs.dockerTools.buildLayeredImage {
        name = "rekisteri";
        tag = "latest";
        config.Cmd = ["${pkgs.nodejs-slim_24}/bin/node" "${default}/index.js"];
      };
      devenv-up = self.devShells.${system}.default.config.procfileScript;
      devenv-test = self.devShells.${system}.default.config.test;
    });

    devShells =
      forEachSystem
      (system: let
        pkgs = nixpkgs.legacyPackages.${system};
        pnpm = pkgs.pnpm.override {nodejs = pkgs.nodejs_24;};
      in {
        default = devenv.lib.mkShell {
          inherit inputs pkgs;
          modules = [
            {
              languages.javascript = {
                enable = true;
                pnpm.enable = true;
                pnpm.package = pnpm;
              };
            }
          ];
        };
      });
  };
}
