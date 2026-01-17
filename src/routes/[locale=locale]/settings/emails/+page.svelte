<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Item from "$lib/components/ui/item/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import { Badge } from "$lib/components/ui/badge/index.js";
	import Mail from "@lucide/svelte/icons/mail";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Clock from "@lucide/svelte/icons/clock";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Star from "@lucide/svelte/icons/star";

	import {
		deleteSecondaryEmailForm,
		reverifySecondaryEmailForm,
		changePrimaryEmailForm,
	} from "$lib/api/secondary-emails.remote";
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

<Card.Root>
	<Card.Header>
		<Card.Title>{$LL.settings.emails.title()}</Card.Title>
		<Card.Description>{$LL.secondaryEmail.manageDescription()}</Card.Description>
		<Card.Action>
			<Button
				href={route("/[locale=locale]/settings/emails/add", { locale: $locale })}
				data-testid="add-secondary-email"
			>
				+ {$LL.secondaryEmail.addEmail()}
			</Button>
		</Card.Action>
	</Card.Header>
	<Card.Content class="space-y-4">
		<!-- Primary Email -->
		<Item.Root variant="outline">
			<Item.Media variant="icon">
				<Mail />
			</Item.Media>
			<Item.Content>
				<Item.Title>
					<span>{data.primaryEmail}</span>
					<Badge variant="default" class="gap-1">
						<Star class="h-3 w-3 fill-current" />
						{$LL.secondaryEmail.primary()}
					</Badge>
				</Item.Title>
				<Item.Description>
					<span class="text-muted-foreground">{$LL.secondaryEmail.primaryDescription()}</span>
				</Item.Description>
			</Item.Content>
		</Item.Root>

		<!-- Secondary Emails -->
		{#if data.emails.length > 0}
			{#each data.emails as email (email.id)}
				{@const deleteForm = deleteSecondaryEmailForm.for(email.id)}
				{@const reverifyForm = reverifySecondaryEmailForm.for(email.id)}
				{@const changePrimaryForm = changePrimaryEmailForm.for(email.id)}
				{@const status = getEmailStatus(email)}

				<Item.Root variant="outline">
					<Item.Media variant="icon">
						<Mail />
					</Item.Media>
					<Item.Content>
						<Item.Title class="flex-wrap">
							<span class="break-all">{email.email}</span>
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
						<Item.Description class="flex flex-col gap-1 sm:flex-row sm:gap-4">
							{#if email.verifiedAt}
								<span>{$LL.secondaryEmail.verifiedAt()}: {formatDate(email.verifiedAt)}</span>
							{/if}
							{#if email.expiresAt}
								<span>{$LL.secondaryEmail.expiresAt()}: {formatDate(email.expiresAt)}</span>
							{/if}
						</Item.Description>
					</Item.Content>
					<Item.Actions class="flex-col sm:flex-row">
						{#if status === "verified"}
							<form
								class="contents"
								{...changePrimaryForm.enhance(async ({ submit }) => {
									if (!confirm($LL.secondaryEmail.makePrimaryConfirm({ email: email.email }))) {
										return;
									}
									await submit();
									await invalidateAll();
								})}
							>
								<input type="hidden" name="emailId" value={email.id} />
								<Button
									type="submit"
									variant="default"
									size="sm"
									disabled={!!changePrimaryForm.pending}
									data-testid="make-primary-email"
								>
									<Star />
									<span>{$LL.secondaryEmail.makePrimary()}</span>
								</Button>
							</form>
						{/if}

						{#if status === "expired" || status === "unverified"}
							<form class="contents" {...reverifyForm}>
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
		{/if}
	</Card.Content>
</Card.Root>
