ALTER TABLE "app_customization" ALTER COLUMN "organization_rules_url" SET DATA TYPE jsonb USING jsonb_build_object(
    'fi', organization_rules_url,
    'en', organization_rules_url
);