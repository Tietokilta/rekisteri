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
          lib = pkgs.lib;
          nodejs = pkgs.nodejs_24;
          pnpm = pkgs.pnpm.override { inherit nodejs; };

          pname = "rekisteri";
          version = self.rev or "dirty";

          # IFD: convert pnpm-lock.yaml to JSON for Nix evaluation
          lockfileJson = builtins.fromJSON (
            builtins.readFile (
              pkgs.runCommand "pnpm-lock-json" { } ''
                ${pkgs.remarshal}/bin/yaml2json ${./pnpm-lock.yaml} $out
              ''
            )
          );

          # Parse "@scope/name@version" or "name@version" package keys
          parsePkgKey =
            key:
            let
              clean = builtins.head (lib.splitString "(" key);
              m = builtins.match "(.+)@([^@]+)" clean;
            in
            {
              name = builtins.elemAt m 0;
              version = builtins.elemAt m 1;
            };

          findTarball =
            name: value:
            let
              parsed = parsePkgKey name;
              baseName = lib.last (lib.splitString "/" parsed.name);
              url =
                value.resolution.tarball
                  or "https://registry.npmjs.org/${parsed.name}/-/${baseName}-${parsed.version}.tgz";
            in
            pkgs.fetchurl {
              inherit url;
              hash = value.resolution.integrity;
            };

          # Pre-compute tarballs once, reused by patchedLockfile and configurePhase
          tarballs = builtins.mapAttrs findTarball lockfileJson.packages;

          # Rewrite each package's resolution to point at the pre-fetched Nix store tarball
          patchedLockfile = lockfileJson // {
            packages = builtins.mapAttrs (
              name: value:
              value
              // {
                resolution = value.resolution // {
                  tarball = "file:${tarballs.${name}}";
                };
              }
            ) lockfileJson.packages;
          };

          patchedLockfileFile = pkgs.writeText "pnpm-lock.yaml" (builtins.toJSON patchedLockfile);

          tarballList = builtins.concatStringsSep " " (lib.unique (builtins.attrValues tarballs));

          default = pkgs.stdenv.mkDerivation {
            inherit pname version;

            src = ./.;

            nativeBuildInputs = [
              nodejs
              pnpm
              pkgs.makeWrapper
            ];

            STRIPE_API_KEY = "sk_test_...";
            STRIPE_WEBHOOK_SECRET = "whsec_...";
            DATABASE_URL = "postgres://root:mysecretpassword@localhost:5432/local";
            PUBLIC_URL = "http://localhost:3000";
            PUBLIC_GIT_COMMIT_SHA = self.rev or "development";
            RP_NAME = "Tietokilta Rekisteri";
            RP_ID = "localhost";
            RP_ORIGIN = "http://localhost:3000";
            MAILGUN_API_KEY = "key-...";
            MAILGUN_DOMAIN = "sandbox...";
            MAILGUN_SENDER = "Rekisteri <noreply@...>";
            MAILGUN_URL = "https://api.eu.mailgun.net/v3/sandbox...";

            configurePhase = ''
              export HOME=$NIX_BUILD_TOP
              export npm_config_nodedir=${nodejs}

              runHook preConfigure

              # pnpm rejects mismatched packageManager versions unless told otherwise;
              # must be set from outside the project directory
              (cd .. && pnpm config set manage-package-manager-versions false)

              cp -f ${patchedLockfileFile} pnpm-lock.yaml

              store=$(pnpm store path)
              mkdir -p $(dirname $store)
              pnpm store add ${tarballList}

              pnpm install \
                --ignore-scripts \
                --force \
                --frozen-lockfile

              patchShebangs node_modules/{*,.*}

              runHook postConfigure
            '';

            installPhase = ''
              runHook preInstall
              pnpm build

              mkdir -p $out/{bin,lib}

              cp -r build $out/lib/server
              cp -r drizzle $out/lib/drizzle
              cp src/start-with-migrations.ts $out/lib/start.ts
              pnpm prune --prod
              # Remove pnpm's internal lockfile which contains file:/nix/store/...
              # tarball references that would pull ~300MiB of tarballs into the closure
              rm -f node_modules/.pnpm/lock.yaml
              cp -r node_modules $out/lib
              find $out/lib/node_modules -xtype l -delete

              makeWrapper ${nodejs}/bin/node $out/bin/rekisteri \
                --chdir $out/lib \
                --add-flag $out/lib/start.ts \
                --set NODE_ENV production

              runHook postInstall
            '';
          };
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
                "3000/tcp" = { };
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
