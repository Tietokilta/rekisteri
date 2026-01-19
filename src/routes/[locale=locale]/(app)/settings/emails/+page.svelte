<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Item from "$lib/components/ui/item/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu/index.js";
	import Mail from "@lucide/svelte/icons/mail";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Clock from "@lucide/svelte/icons/clock";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import Star from "@lucide/svelte/icons/star";
	import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
	import RefreshCw from "@lucide/svelte/icons/refresh-cw";

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
		if (!date) return "";
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
	<Card.Content class="space-y-3">
		<!-- Primary Email -->
		<Item.Root variant="muted" size="sm">
			<Item.Media variant="icon">
				<Mail class="text-muted-foreground" />
			</Item.Media>
			<Item.Content>
				<Item.Title class="font-normal">
					{data.primaryEmail}
				</Item.Title>
				<Item.Description class="flex items-center gap-1">
					<Star class="size-3 fill-current text-amber-500" />
					<span>{$LL.secondaryEmail.primaryDescription()}</span>
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

				<Item.Root variant="outline" size="sm">
					<Item.Media variant="icon">
						<Mail class="text-muted-foreground" />
					</Item.Media>
					<Item.Content>
						<Item.Title class="font-normal">
							<span class="break-all">{email.email}</span>
						</Item.Title>
						<Item.Description>
							<span class="flex flex-wrap items-center gap-x-3 gap-y-1">
								<!-- Status indicator -->
								{#if status === "verified"}
									<span class="flex items-center gap-1 text-green-600 dark:text-green-500">
										<CircleCheck class="size-3" />
										{$LL.secondaryEmail.status.verified()}
									</span>
								{:else if status === "expired"}
									<span class="flex items-center gap-1 text-destructive">
										<CircleAlert class="size-3" />
										{$LL.secondaryEmail.status.expired()}
									</span>
								{:else}
									<span class="flex items-center gap-1 text-muted-foreground">
										<Clock class="size-3" />
										{$LL.secondaryEmail.status.unverified()}
									</span>
								{/if}

								<!-- Domain -->
								<span class="text-muted-foreground">{email.domain}</span>

								<!-- Expiration date (only show if expiring/expired) -->
								{#if email.expiresAt}
									<span class="text-muted-foreground">
										{$LL.secondaryEmail.expiresAt()}: {formatDate(email.expiresAt)}
									</span>
								{/if}
							</span>
						</Item.Description>
					</Item.Content>
					<Item.Actions>
						<!-- Make Primary button (only for verified) -->
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
									variant="outline"
									size="sm"
									disabled={!!changePrimaryForm.pending}
									data-testid="make-primary-email"
								>
									<Star class="size-4" />
									<span class="hidden sm:inline">{$LL.secondaryEmail.makePrimary()}</span>
								</Button>
							</form>
						{/if}

						<!-- Actions dropdown -->
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="ghost" size="sm" class="size-8 p-0">
										<EllipsisVertical class="size-4" />
										<span class="sr-only">{$LL.common.actions()}</span>
									</Button>
								{/snippet}
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="end">
								{#if status === "expired" || status === "unverified"}
									<form class="contents" {...reverifyForm}>
										<input type="hidden" name="emailId" value={email.id} />
										<DropdownMenu.Item
											disabled={!!reverifyForm.pending}
											data-testid="reverify-email"
											onclick={(e) => {
												e.preventDefault();
												const form = e.currentTarget.closest("form");
												if (form) form.requestSubmit();
											}}
										>
											<RefreshCw class="size-4" />
											{$LL.secondaryEmail.reverify()}
										</DropdownMenu.Item>
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
									<DropdownMenu.Item
										variant="destructive"
										disabled={!!deleteForm.pending}
										onclick={(e) => {
											e.preventDefault();
											if (confirm($LL.secondaryEmail.deleteConfirm())) {
												const form = e.currentTarget.closest("form");
												if (form) form.requestSubmit();
											}
										}}
									>
										<Trash2 class="size-4" />
										{$LL.secondaryEmail.delete()}
									</DropdownMenu.Item>
								</form>
							</DropdownMenu.Content>
						</DropdownMenu.Root>
					</Item.Actions>
				</Item.Root>
			{/each}
		{/if}
	</Card.Content>
</Card.Root>
