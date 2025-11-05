<script lang="ts">
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { localizePathname } from "$lib/i18n/routing";
	import { route } from "$lib/ROUTES";
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
						<a href="mailto:hallitus@tietokilta.fi" class="hover:underline"
							>{$LL.documents.footer.email()}</a
						>
					</p>
					<p>{$LL.documents.footer.phone()}</p>
					<p>{$LL.documents.footer.address()}</p>
				</div>
			</div>

			<!-- Legal Links -->
			<div>
				<h3 class="mb-2 font-semibold">Legal</h3>
				<div class="space-y-1 text-sm">
					<p>
						<a
							href={localizePathname(route("/privacy-policy"), $locale)}
							class="text-muted-foreground hover:text-foreground hover:underline"
						>
							{$LL.documents.footer.privacyPolicy()}
						</a>
					</p>
					<p>
						<a
							href={localizePathname(route("/registry-disclosure"), $locale)}
							class="text-muted-foreground hover:text-foreground hover:underline"
						>
							{$LL.documents.footer.registryDisclosure()}
						</a>
					</p>
				</div>
			</div>
		</div>

		<div class="mt-8 border-t border-border/40 pt-4 text-center text-xs text-muted-foreground">
			<p>&copy; {new Date().getFullYear()} Tietokilta ry. All rights reserved.</p>
		</div>
	</div>
</footer>
