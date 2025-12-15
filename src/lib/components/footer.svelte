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
	<div class="container mx-auto max-w-[1400px] px-4 py-8">
		<div class="grid gap-8 md:grid-cols-3">
			<!-- Organization Info -->
			<div>
				<h3 class="mb-2 font-semibold">{$LL.documents.footer.organization()}</h3>
				<p class="text-sm text-muted-foreground">
					{$LL.documents.footer.businessId()}
				</p>
			</div>

			<!-- Contact -->
			<div>
				<h3 class="mb-2 font-semibold">{$LL.documents.footer.contact()}</h3>
				<div class="space-y-1 text-sm text-muted-foreground">
					<p>
						<a href="mailto:hallitus@tietokilta.fi" class="hover:underline">{$LL.documents.footer.email()}</a>
					</p>
					<p>{$LL.documents.footer.address()}</p>
				</div>
			</div>

			<!-- Legal Links -->
			<div>
				<h3 class="mb-2 font-semibold">Legal</h3>
				<div class="space-y-1 text-sm">
					<p>
						<a
							href={route(`/[locale=locale]/privacy-policy`, { locale: $locale })}
							class="text-muted-foreground hover:text-foreground hover:underline"
						>
							{$LL.documents.footer.privacyPolicy()}
						</a>
					</p>
				</div>
			</div>
		</div>

		<div class="mt-8 border-t border-border/40 pt-4 text-center text-xs text-muted-foreground">
			<span>&copy; {new Date().getFullYear()} Tietokilta ry</span>
			{#if showVersionSha}
				<span> | </span>
				<a class="hover:underline" href={shaLinkUrl} target="_blank" rel="noopener noreferrer">
					<span class="sr-only">{$LL.documents.footer.version()}</span>
					<span>{versionSha.slice(0, 7)}</span>
				</a>
			{/if}
		</div>
	</div>
</footer>
