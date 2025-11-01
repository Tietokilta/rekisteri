{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    systems.url = "github:nix-systems/default";
  };

  outputs =
    {
      self,
      nixpkgs,
      systems,
      ...
    }@inputs:
    let
      forEachSystem = nixpkgs.lib.genAttrs (import systems);
    in
    {
      packages = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm.override { inherit nodejs; };

          default = pkgs.stdenv.mkDerivation (finalAttrs: {
            pname = "rekisteri";
            version = self.rev or "dirty";

            src = ./.;

            nativeBuildInputs = [
              nodejs
              pnpm
              pnpm.configHook
            ];

            STRIPE_API_KEY = "sk_test_...";
            STRIPE_WEBHOOK_SECRET = "whsec_...";
            DATABASE_URL = "postgres://root:mysecretpassword@localhost:5432/local";

            pnpmDeps =
              (pnpm.fetchDeps {
                name = "${finalAttrs.pname}-${finalAttrs.version}-pnpm-deps";
                inherit (finalAttrs) pname version src;
                inherit nodejs;
                fetcherVersion = 2;
                hash = "sha256-nGATXci2zXbyIMUGIhECTIwc4GoP9WgT1iRep5xtWCM=";
              }).overrideAttrs
                (old: {
                  nativeBuildInputs = [
                    nodejs
                    pnpm
                  ]
                  ++ old.nativeBuildInputs;
                });

            installPhase = ''
              runHook preInstall
              pnpm build
              cp -r build $out
              pnpm prune --prod
              cp -r node_modules $out
              runHook postInstall
            '';
          });
        in
        {
          inherit default;
          docker = pkgs.dockerTools.buildLayeredImage {
            name = "rekisteri";
            tag = "latest";
            config.Cmd = [
              "${nodejs}/bin/node"
              "${default}/index.js"
            ];
          };
        }
      );

      devShells = forEachSystem (
        system:
        let
          pkgs = nixpkgs.legacyPackages.${system};
          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm.override { inherit nodejs; };
        in
        {
          default = pkgs.mkShell {
            buildInputs = [
              nodejs
              pnpm
            ];
          };
        }
      );
    };
}
