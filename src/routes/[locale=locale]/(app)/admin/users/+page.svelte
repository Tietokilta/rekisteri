<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";
	import * as Table from "$lib/components/ui/table";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Badge } from "$lib/components/ui/badge";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";
	import * as Card from "$lib/components/ui/card";
	import * as Alert from "$lib/components/ui/alert";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import Merge from "@lucide/svelte/icons/merge";
	import X from "@lucide/svelte/icons/x";
	import AlertCircle from "@lucide/svelte/icons/alert-circle";
	import CheckCircle from "@lucide/svelte/icons/check-circle-2";
	import { promoteToAdmin, demoteFromAdmin, mergeUsers } from "./data.remote";
	import { promoteToAdminSchema, demoteFromAdminSchema } from "./schema";
	import { toast } from "svelte-sonner";
	import { invalidateAll } from "$app/navigation";

	const { data }: PageProps = $props();

	let searchQuery = $state("");
	let adminPage = $state(0);
	let userPage = $state(0);
	const pageSize = 50;

	// Merge users state
	type MergeStep = 1 | 2 | 3;
	let mergeModalOpen = $state(false);
	let mergeStep = $state<MergeStep>(1);
	let primaryUser = $state<(typeof data.users)[number] | null>(null);
	let secondaryUser = $state<(typeof data.users)[number] | null>(null);
	let secondarySearchQuery = $state("");
	let confirmPrimaryEmail = $state("");
	let confirmSecondaryEmail = $state("");
	let mergeInProgress = $state(false);

	function openMergeModal(user: (typeof data.users)[number]) {
		primaryUser = user;
		secondaryUser = null;
		secondarySearchQuery = "";
		confirmPrimaryEmail = "";
		confirmSecondaryEmail = "";
		mergeStep = 1;
		mergeModalOpen = true;
	}

	function closeMergeModal() {
		mergeModalOpen = false;
		primaryUser = null;
		secondaryUser = null;
		secondarySearchQuery = "";
		confirmPrimaryEmail = "";
		confirmSecondaryEmail = "";
		mergeStep = 1;
	}

	function nextStep() {
		if (mergeStep < 3) {
			mergeStep = (mergeStep + 1) as MergeStep;
		}
	}

	function previousStep() {
		if (mergeStep > 1) {
			mergeStep = (mergeStep - 1) as MergeStep;
		}
	}

	const availableSecondaryUsers = $derived(
		data.users.filter(
			(u) =>
				u.id !== primaryUser?.id &&
				(secondarySearchQuery === "" ||
					u.email.toLowerCase().includes(secondarySearchQuery.toLowerCase()) ||
					u.firstNames?.toLowerCase().includes(secondarySearchQuery.toLowerCase()) ||
					u.lastName?.toLowerCase().includes(secondarySearchQuery.toLowerCase())),
		),
	);

	async function handleMerge() {
		if (!primaryUser || !secondaryUser) return;

		mergeInProgress = true;

		try {
			const result = await mergeUsers({
				primaryUserId: primaryUser.id,
				secondaryUserId: secondaryUser.id,
				confirmPrimaryEmail,
				confirmSecondaryEmail,
			});

			if (result.success) {
				toast.success($LL.admin.users.merge.success());
				closeMergeModal();
				// Refresh data to reflect changes
				await invalidateAll();
			}
		} catch (err) {
			// Handle SvelteKit error responses
			let errorMessage = "Unknown error";
			if (err && typeof err === "object" && "error" in err) {
				const errorObj = err.error as { message?: string };
				errorMessage = errorObj.message ?? "Unknown error";
			} else if (err instanceof Error) {
				errorMessage = err.message;
			}
			toast.error(errorMessage);
		} finally {
			mergeInProgress = false;
		}
	}

	// Split users into admins and non-admins
	const admins = $derived(data.users.filter((u) => u.isAdmin));
	const regularUsers = $derived(data.users.filter((u) => !u.isAdmin));

	// Filter function
	function matchesSearch(user: (typeof data.users)[number]) {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			user.email.toLowerCase().includes(query) ||
			user.firstNames?.toLowerCase().includes(query) ||
			user.lastName?.toLowerCase().includes(query) ||
			user.id.toLowerCase().includes(query)
		);
	}

	const filteredAdmins = $derived(admins.filter(matchesSearch));
	const filteredRegularUsers = $derived(regularUsers.filter(matchesSearch));

	// Pagination
	const paginatedAdmins = $derived(filteredAdmins.slice(adminPage * pageSize, (adminPage + 1) * pageSize));
	const paginatedRegularUsers = $derived(filteredRegularUsers.slice(userPage * pageSize, (userPage + 1) * pageSize));

	const totalAdminPages = $derived(Math.ceil(filteredAdmins.length / pageSize));
	const totalUserPages = $derived(Math.ceil(filteredRegularUsers.length / pageSize));

	// Reset pagination when search changes
	$effect(() => {
		void searchQuery;
		adminPage = 0;
		userPage = 0;
	});

	// Format last active date
	function formatLastActive(lastActiveAt: Date | null) {
		if (!lastActiveAt) return $LL.admin.users.table.never();
		return lastActiveAt.toLocaleString();
	}

	// Check if user is the last admin (use total admins, not filtered)
	const isLastAdmin = $derived(admins.length === 1);
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
	<AdminPageHeader title={$LL.admin.users.title()} description={$LL.admin.users.description()} />

	<!-- Merge Users Modal/Card -->
	{#if mergeModalOpen && primaryUser}
		<Card.Root class="mb-6 border-2 border-primary" data-testid="merge-wizard">
			<Card.Header>
				<div class="flex items-start justify-between">
					<div>
						<Card.Title>{$LL.admin.users.merge.title()}</Card.Title>
						<Card.Description>{$LL.admin.users.merge.description()}</Card.Description>
					</div>
					<Button variant="ghost" size="icon" onclick={closeMergeModal} data-testid="merge-wizard-close">
						<X class="size-4" />
					</Button>
				</div>
			</Card.Header>
			<Card.Content>
				<!-- Step 1: Select secondary user -->
				{#if mergeStep === 1}
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">{$LL.admin.users.merge.step1Title()}</h3>

						<div>
							<p class="mb-2 text-sm font-medium">{$LL.admin.users.merge.primaryUser()}</p>
							<div class="rounded-md border bg-muted p-3">
								<p class="font-mono text-sm">{primaryUser.email}</p>
								{#if primaryUser.firstNames || primaryUser.lastName}
									<p class="text-sm text-muted-foreground">
										{primaryUser.firstNames ?? ""}
										{primaryUser.lastName ?? ""}
									</p>
								{/if}
							</div>
						</div>

						<div>
							<p class="mb-2 text-sm font-medium">{$LL.admin.users.merge.selectSecondary()}</p>
							<Input
								placeholder={$LL.admin.users.merge.selectSecondaryPlaceholder()}
								type="search"
								bind:value={secondarySearchQuery}
							/>
						</div>

						{#if secondarySearchQuery}
							<div class="max-h-64 space-y-2 overflow-y-auto rounded-md border p-2">
								{#each availableSecondaryUsers.slice(0, 10) as user (user.id)}
									<button
										onclick={() => {
											secondaryUser = user;
											nextStep();
										}}
										class="flex w-full items-start justify-between rounded-md p-3 text-left hover:bg-muted"
									>
										<div>
											<p class="font-mono text-sm">{user.email}</p>
											{#if user.firstNames || user.lastName}
												<p class="text-sm text-muted-foreground">
													{user.firstNames ?? ""}
													{user.lastName ?? ""}
												</p>
											{/if}
										</div>
										<Badge variant={user.isAdmin ? "default" : "secondary"}>
											{user.isAdmin ? "ADMIN" : "USER"}
										</Badge>
									</button>
								{/each}
								{#if availableSecondaryUsers.length === 0}
									<p class="py-4 text-center text-sm text-muted-foreground">
										{$LL.admin.users.table.noResults()}
									</p>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Step 2: Review merge data -->
				{#if mergeStep === 2 && secondaryUser}
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">{$LL.admin.users.merge.step2Title()}</h3>

						<div class="grid gap-4 md:grid-cols-2">
							<div>
								<p class="mb-2 text-sm font-medium text-primary">
									{$LL.admin.users.merge.primaryUser()}
								</p>
								<div class="rounded-md border border-primary/20 bg-primary/5 p-3">
									<p class="font-mono text-sm">{primaryUser.email}</p>
									{#if primaryUser.firstNames || primaryUser.lastName}
										<p class="text-sm text-muted-foreground">
											{primaryUser.firstNames ?? ""}
											{primaryUser.lastName ?? ""}
										</p>
									{/if}
									{#if primaryUser.isAdmin}
										<Badge variant="default" class="mt-2">ADMIN</Badge>
									{/if}
								</div>
							</div>

							<div>
								<p class="mb-2 text-sm font-medium text-destructive">
									{$LL.admin.users.merge.secondaryUser()}
								</p>
								<div class="rounded-md border border-destructive/20 bg-destructive/5 p-3">
									<p class="font-mono text-sm">{secondaryUser.email}</p>
									{#if secondaryUser.firstNames || secondaryUser.lastName}
										<p class="text-sm text-muted-foreground">
											{secondaryUser.firstNames ?? ""}
											{secondaryUser.lastName ?? ""}
										</p>
									{/if}
									{#if secondaryUser.isAdmin}
										<Badge variant="default" class="mt-2">ADMIN</Badge>
									{/if}
								</div>
							</div>
						</div>

						<Alert.Root>
							<CheckCircle class="size-4" />
							<Alert.Title>{$LL.admin.users.merge.willBeMerged()}</Alert.Title>
							<Alert.Description>
								<ul class="mt-2 list-inside list-disc space-y-1 text-sm">
									<li>{$LL.admin.users.merge.primaryEmailWillBecome()}</li>
									<li>{$LL.admin.users.merge.memberships()}</li>
									<li>{$LL.admin.users.merge.secondaryEmails()}</li>
									<li>{$LL.admin.users.merge.passkeys()}</li>
									<li>{$LL.admin.users.merge.sessions()}</li>
								</ul>
							</Alert.Description>
						</Alert.Root>

						<div class="flex gap-2">
							<Button variant="outline" onclick={previousStep}>{$LL.admin.users.merge.previous()}</Button>
							<Button onclick={nextStep}>{$LL.admin.users.merge.next()}</Button>
						</div>
					</div>
				{/if}

				<!-- Step 3: Confirm merge -->
				{#if mergeStep === 3 && secondaryUser}
					<div class="space-y-4">
						<h3 class="text-lg font-semibold">{$LL.admin.users.merge.step3Title()}</h3>

						<Alert.Root variant="destructive">
							<AlertCircle class="size-4" />
							<Alert.Title>{$LL.admin.users.merge.confirmByTyping()}</Alert.Title>
							<Alert.Description>
								{$LL.admin.users.merge.irreversibleWarning()}
							</Alert.Description>
						</Alert.Root>

						<div class="space-y-4">
							<div>
								<label for="confirmPrimaryEmail" class="mb-1 block text-sm font-medium">
									{$LL.admin.users.merge.typePrimaryEmail()}
								</label>
								<p class="mb-2 font-mono text-sm text-primary">{primaryUser.email}</p>
								<Input id="confirmPrimaryEmail" type="email" bind:value={confirmPrimaryEmail} />
							</div>

							<div>
								<label for="confirmSecondaryEmail" class="mb-1 block text-sm font-medium">
									{$LL.admin.users.merge.typeSecondaryEmail()}
								</label>
								<p class="mb-2 font-mono text-sm text-destructive">{secondaryUser.email}</p>
								<Input id="confirmSecondaryEmail" type="email" bind:value={confirmSecondaryEmail} />
							</div>
						</div>

						<div class="flex gap-2">
							<Button variant="outline" onclick={previousStep} disabled={mergeInProgress}>
								{$LL.admin.users.merge.previous()}
							</Button>
							<Button
								variant="destructive"
								onclick={handleMerge}
								disabled={mergeInProgress ||
									confirmPrimaryEmail.toLowerCase() !== primaryUser.email.toLowerCase() ||
									confirmSecondaryEmail.toLowerCase() !== secondaryUser.email.toLowerCase()}
								data-testid="merge-submit-button"
							>
								{mergeInProgress ? $LL.admin.users.merge.merging() : $LL.admin.users.merge.mergeUsers()}
							</Button>
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/if}

	<div class="mb-4">
		<Input placeholder={$LL.admin.users.table.search()} type="search" class="max-w-sm" bind:value={searchQuery} />
	</div>

	<!-- Admins Section -->
	{#if filteredAdmins.length > 0}
		<div class="mb-8">
			<h2 class="mb-4 text-xl font-semibold">{$LL.admin.users.adminsSection()}</h2>
			<div class="rounded-md border">
				<Table.Root>
					<Table.Header>
						<Table.Row>
							<Table.Head class="w-[150px]">{$LL.admin.users.table.id()}</Table.Head>
							<Table.Head class="w-[200px]">{$LL.admin.users.table.email()}</Table.Head>
							<Table.Head class="w-[150px]">{$LL.admin.users.table.name()}</Table.Head>
							<Table.Head class="w-[80px]">{$LL.admin.users.table.role()}</Table.Head>
							<Table.Head class="w-[200px]">{$LL.admin.users.table.lastActive()}</Table.Head>
							<Table.Head class="w-[220px] text-right">{$LL.admin.users.table.actions()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each paginatedAdmins as user (user.id)}
							<Table.Row>
								<Table.Cell class="w-[200px] font-mono text-xs">{user.id}</Table.Cell>
								<Table.Cell class="w-[250px]">{user.email}</Table.Cell>
								<Table.Cell class="w-[200px]">
									{#if user.firstNames || user.lastName}
										{user.firstNames ?? ""} {user.lastName ?? ""}
									{:else}
										-
									{/if}
								</Table.Cell>
								<Table.Cell class="w-[100px]">
									<Badge variant="default">ADMIN</Badge>
								</Table.Cell>
								<Table.Cell class="w-[250px]">
									<span class="text-sm text-muted-foreground">
										{formatLastActive(user.lastActiveAt)}
									</span>
								</Table.Cell>
								<Table.Cell class="w-[220px] text-right">
									<div class="flex justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => openMergeModal(user)}
											title={$LL.admin.users.table.merge()}
											aria-label={$LL.admin.users.table.merge()}
										>
											<Merge class="size-4" />
										</Button>
										<form {...demoteFromAdmin.for(user.id).preflight(demoteFromAdminSchema)}>
											<input {...demoteFromAdmin.for(user.id).fields.userId.as("hidden", user.id)} />
											<Button type="submit" size="sm" variant="outline" disabled={isLastAdmin}>
												<ChevronDown class="mr-2 size-4" />
												{$LL.admin.users.table.demote()}
											</Button>
										</form>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					</Table.Body>
				</Table.Root>
			</div>

			<!-- Admin Pagination -->
			{#if totalAdminPages > 1}
				<div class="mt-4 flex items-center justify-between">
					<div class="text-sm text-muted-foreground">
						{$LL.admin.users.table.showing({
							current: paginatedAdmins.length,
							total: filteredAdmins.length,
						})}
					</div>
					<div class="flex gap-2">
						<Button variant="outline" size="sm" onclick={() => adminPage--} disabled={adminPage === 0}>
							{$LL.admin.members.table.previous()}
						</Button>
						<Button variant="outline" size="sm" onclick={() => adminPage++} disabled={adminPage >= totalAdminPages - 1}>
							{$LL.admin.members.table.next()}
						</Button>
					</div>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Regular Users Section -->
	<div>
		<h2 class="mb-4 text-xl font-semibold">{$LL.admin.users.usersSection()}</h2>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head class="w-[150px]">{$LL.admin.users.table.id()}</Table.Head>
						<Table.Head class="w-[200px]">{$LL.admin.users.table.email()}</Table.Head>
						<Table.Head class="w-[150px]">{$LL.admin.users.table.name()}</Table.Head>
						<Table.Head class="w-[80px]">{$LL.admin.users.table.role()}</Table.Head>
						<Table.Head class="w-[200px]">{$LL.admin.users.table.lastActive()}</Table.Head>
						<Table.Head class="w-[220px] text-right">{$LL.admin.users.table.actions()}</Table.Head>
					</Table.Row>
				</Table.Header>
				<Table.Body>
					{#if filteredRegularUsers.length === 0}
						<Table.Row>
							<Table.Cell colspan={6} class="text-center text-muted-foreground">
								{searchQuery ? $LL.admin.users.table.noResults() : $LL.admin.users.table.noUsers()}
							</Table.Cell>
						</Table.Row>
					{:else}
						{#each paginatedRegularUsers as user (user.id)}
							<Table.Row>
								<Table.Cell class="w-[200px] font-mono text-xs">{user.id}</Table.Cell>
								<Table.Cell class="w-[250px]">{user.email}</Table.Cell>
								<Table.Cell class="w-[200px]">
									{#if user.firstNames || user.lastName}
										{user.firstNames ?? ""} {user.lastName ?? ""}
									{:else}
										-
									{/if}
								</Table.Cell>
								<Table.Cell class="w-[100px]">-</Table.Cell>
								<Table.Cell class="w-[250px]">
									<span class="text-sm text-muted-foreground">
										{formatLastActive(user.lastActiveAt)}
									</span>
								</Table.Cell>
								<Table.Cell class="w-[220px] text-right">
									<div class="flex justify-end gap-2">
										<Button
											size="sm"
											variant="ghost"
											onclick={() => openMergeModal(user)}
											title={$LL.admin.users.table.merge()}
											aria-label={$LL.admin.users.table.merge()}
										>
											<Merge class="size-4" />
										</Button>
										<form {...promoteToAdmin.for(user.id).preflight(promoteToAdminSchema)}>
											<input {...promoteToAdmin.for(user.id).fields.userId.as("hidden", user.id)} />
											<Button type="submit" size="sm" variant="default">
												<ChevronUp class="mr-2 size-4" />
												{$LL.admin.users.table.promote()}
											</Button>
										</form>
									</div>
								</Table.Cell>
							</Table.Row>
						{/each}
					{/if}
				</Table.Body>
			</Table.Root>
		</div>

		<!-- User Pagination -->
		{#if totalUserPages > 1}
			<div class="mt-4 flex items-center justify-between">
				<div class="text-sm text-muted-foreground">
					{$LL.admin.users.table.showing({
						current: paginatedRegularUsers.length,
						total: filteredRegularUsers.length,
					})}
				</div>
				<div class="flex gap-2">
					<Button variant="outline" size="sm" onclick={() => userPage--} disabled={userPage === 0}>
						{$LL.admin.members.table.previous()}
					</Button>
					<Button variant="outline" size="sm" onclick={() => userPage++} disabled={userPage >= totalUserPages - 1}>
						{$LL.admin.members.table.next()}
					</Button>
				</div>
			</div>
		{/if}
	</div>
</main>
