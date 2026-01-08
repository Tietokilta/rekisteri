<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Item from "$lib/components/ui/item/index.js";
	import * as Empty from "$lib/components/ui/empty/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import Mail from "@lucide/svelte/icons/mail";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Clock from "@lucide/svelte/icons/clock";
	import Trash2 from "@lucide/svelte/icons/trash-2";

	import { deleteSecondaryEmailForm, reverifySecondaryEmailForm } from "$lib/api/secondary-emails.remote";
	import type { PageData } from "./$types";
	import type { SecondaryEmail } from "$lib/server/db/schema";

	let { data }: { data: PageData } = $props();

	function getEmailStatus(email: SecondaryEmail): "unverified" | "expired" | "verified" {
		if (!email.verifiedAt) return "unverified";
		if (email.expiresAt && email.expiresAt < new Date()) return "expired";
		return "verified";
	}

	function formatDate(date: Date | null): string {
		if (!date) return $LL.secondaryEmail.neverExpires();
		return new Date(date).toLocaleDateString();
	}
</script>

<main class="container mx-auto my-8 max-w-4xl p-4">
	<div class="mb-8 flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-bold">{$LL.secondaryEmail.title()}</h1>
			<p class="mt-1 text-muted-foreground">{$LL.secondaryEmail.manageDescription()}</p>
		</div>
		<Button
			href={route("/[locale=locale]/secondary-emails/add", { locale: $locale })}
			data-testid="add-secondary-email"
		>
			+ {$LL.secondaryEmail.addEmail()}
		</Button>
	</div>

	{#if data.emails.length === 0}
		<Empty.Root class="border">
			<Empty.Header>
				<Empty.Media variant="icon">
					<Mail />
				</Empty.Media>
			</Empty.Header>
			<Empty.Title>{$LL.secondaryEmail.noEmails()}</Empty.Title>
			<Empty.Content>
				<p class="text-muted-foreground">{$LL.secondaryEmail.noEmailsDescription()}</p>
				<Button
					href={route("/[locale=locale]/secondary-emails/add", { locale: $locale })}
					class="mt-4"
					data-testid="add-secondary-email-empty"
				>
					{$LL.secondaryEmail.addEmail()}
				</Button>
			</Empty.Content>
		</Empty.Root>
	{:else}
		<div class="space-y-4">
			{#each data.emails as email (email.id)}
				{@const deleteForm = deleteSecondaryEmailForm.for(email.id)}
				{@const reverifyForm = reverifySecondaryEmailForm.for(email.id)}
				{@const status = getEmailStatus(email)}

				<Item.Root variant="outline">
					<Item.Media variant="icon">
						<Mail />
					</Item.Media>
					<Item.Content>
						<Item.Title>
							<span>{email.email}</span>
							<Badge variant="secondary">{email.domain}</Badge>

							{#if status === "verified"}
								<Badge variant="default" class="gap-1">
									<CircleCheck class="h-3 w-3" />
									{$LL.secondaryEmail.status.verified()}
								</Badge>
							{:else if status === "expired"}
								<Badge variant="destructive" class="gap-1">
									<CircleAlert class="h-3 w-3" />
									{$LL.secondaryEmail.status.expired()}
								</Badge>
							{:else}
								<Badge variant="outline" class="gap-1">
									<Clock class="h-3 w-3" />
									{$LL.secondaryEmail.status.unverified()}
								</Badge>
							{/if}
						</Item.Title>
						<Item.Description>
							{#if email.verifiedAt}
								<span>{$LL.secondaryEmail.verifiedAt()}: {formatDate(email.verifiedAt)}</span>
							{/if}
							{#if email.expiresAt}
								<span class="ml-4">{$LL.secondaryEmail.expiresAt()}: {formatDate(email.expiresAt)}</span>
							{/if}
						</Item.Description>
					</Item.Content>
					<Item.Actions>
						{#if status === "expired" || status === "unverified"}
							<form
								class="contents"
								{...reverifyForm.enhance(async ({ submit }) => {
									await submit();
									// Redirect to verify page
									globalThis.location.href = route("/[locale=locale]/secondary-emails/verify", {
										locale: $locale,
									});
								})}
							>
								<input type="hidden" name="emailId" value={email.id} />
								<Button
									type="submit"
									variant="default"
									size="sm"
									disabled={!!reverifyForm.pending}
									data-testid="reverify-email"
								>
									{$LL.secondaryEmail.reverify()}
								</Button>
							</form>
						{/if}

						<form
							class="contents"
							{...deleteForm.enhance(async ({ submit }) => {
								await submit();
								await invalidateAll();
							})}
						>
							<input type="hidden" name="emailId" value={email.id} />
							<Button
								type="submit"
								variant="destructive"
								size="sm"
								disabled={!!deleteForm.pending}
								onclick={(e) => {
									if (!confirm($LL.secondaryEmail.deleteConfirm())) {
										e.preventDefault();
									}
								}}
							>
								<Trash2 />
								<span>{$LL.secondaryEmail.delete()}</span>
							</Button>
						</form>
					</Item.Actions>
				</Item.Root>
			{/each}
		</div>
	{/if}
</main>
