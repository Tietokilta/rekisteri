CREATE TYPE "oidc_grant_type" AS ENUM('authorization_code');--> statement-breakpoint
CREATE TABLE "oidc_client" (
	"client_id" text PRIMARY KEY,
	"client_secret" text NOT NULL,
	"type" "oidc_grant_type" DEFAULT 'authorization_code'::"oidc_grant_type" NOT NULL,
	"name" text NOT NULL,
	"allowed_origins" jsonb DEFAULT '[]' NOT NULL,
	"redirect_uris" jsonb DEFAULT '[]' NOT NULL,
	"scopes" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_consent" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oidc_entity" (
	"jti" text PRIMARY KEY,
	"payload" jsonb NOT NULL,
	"consent_id" text,
	"client_id" text,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "unique_user_client_consent" ON "oidc_consent" ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_consent_user_id" ON "oidc_consent" ("user_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_consent_client_id" ON "oidc_consent" ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_entity_consent_id" ON "oidc_entity" ("consent_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_entity_client_id" ON "oidc_entity" ("client_id");--> statement-breakpoint
CREATE INDEX "idx_oidc_entity_expires_at" ON "oidc_entity" ("expires_at");--> statement-breakpoint
ALTER TABLE "oidc_consent" ADD CONSTRAINT "oidc_consent_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oidc_consent" ADD CONSTRAINT "oidc_consent_client_id_oidc_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oidc_client"("client_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oidc_entity" ADD CONSTRAINT "oidc_entity_consent_id_oidc_consent_id_fkey" FOREIGN KEY ("consent_id") REFERENCES "oidc_consent"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "oidc_entity" ADD CONSTRAINT "oidc_entity_client_id_oidc_client_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "oidc_client"("client_id") ON DELETE CASCADE;