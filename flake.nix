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
              pkgs.makeWrapper
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
                hash = "sha256-YvyYJATCqkUkoJtcyDTnGH+2EU2vCggL/EPb8GXQuTs=";
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

              mkdir -p $out/{bin,lib}

              cp -r build $out/lib/server
              cp -r drizzle $out/lib/drizzle
              cp src/start-with-migrations.ts $out/lib/start.ts
              pnpm prune --prod
              cp -r node_modules $out/lib


              makeWrapper ${nodejs}/bin/node $out/bin/rekisteri \
                --chdir $out/lib \
                --add-flag $out/lib/start.ts \
                --set NODE_ENV production

              runHook postInstall
            '';
          });
        in
        {
          inherit default;
          docker = pkgs.dockerTools.buildLayeredImage {
            name = "rekisteri";
            tag = "latest";
            contents = [
              pkgs.cacert # Add CA certificates for HTTPS requests
            ];
            config = {
              Cmd = [
                "${default}/bin/rekisteri"
              ];
              ExposedPorts = {
                "3000/tcp" = {};
              };
              Env = [
                "SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
              ];
            };
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
