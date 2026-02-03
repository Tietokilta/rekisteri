<script lang="ts">
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { env } from "$lib/env";
  import { dev } from "$app/environment";
  import { route } from "$lib/ROUTES";

  const versionSha = env.PUBLIC_GIT_COMMIT_SHA ?? "development";
  const showVersionSha = versionSha !== "development" || dev;
  const shaLinkUrl =
    versionSha === "development"
      ? "https://youtu.be/dQw4w9WgXcQ"
      : `https://github.com/Tietokilta/rekisteri/tree/${versionSha}`;
</script>

<footer class="mt-auto border-t border-border/40 bg-muted/50">
  <div class="container mx-auto max-w-[1400px] px-4 py-4">
    <!-- Compact inline layout -->
    <div class="flex flex-wrap items-start justify-between gap-4 text-xs text-muted-foreground">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span class="font-medium text-foreground">{$LL.documents.footer.organization()}</span>
        <span>{$LL.documents.footer.businessId()}</span>
        <a href="mailto:hallitus@tietokilta.fi" class="underline underline-offset-2 hover:text-foreground"
          >{$LL.documents.footer.email()}</a
        >
        <span class="hidden sm:inline">{$LL.documents.footer.address()}</span>
      </div>
      <div class="flex items-center gap-4">
        <a
          href={route(`/[locale=locale]/privacy-policy`, { locale: $locale })}
          class="underline underline-offset-2 hover:text-foreground"
        >
          {$LL.documents.footer.privacyPolicy()}
        </a>
        <span>
          &copy; {new Date().getFullYear()} Tietokilta ry
          {#if showVersionSha}
            |
            <a
              class="underline underline-offset-2 hover:text-foreground"
              href={shaLinkUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {versionSha.slice(0, 7)}
            </a>
          {/if}
        </span>
      </div>
    </div>
  </div>
</footer>
