<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";
	import * as Table from "$lib/components/ui/table";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Badge } from "$lib/components/ui/badge";
	import AdminPageHeader from "$lib/components/admin-page-header.svelte";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import { promoteToAdmin, demoteFromAdmin } from "./data.remote";
	import { promoteToAdminSchema, demoteFromAdminSchema } from "./schema";

	const { data }: PageProps = $props();

	let searchQuery = $state("");
	let adminPage = $state(0);
	let userPage = $state(0);
	const pageSize = 50;

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

	// Format last sign-in
	function formatLastSignIn(expiresAt: Date | null) {
		if (!expiresAt) return "-";
		const now = new Date();
		if (expiresAt < now) return $LL.admin.users.table.sessionExpired();
		return expiresAt.toLocaleString();
	}

	// Check if session is active
	function hasActiveSession(expiresAt: Date | null) {
		if (!expiresAt) return false;
		return expiresAt > new Date();
	}

	// Check if user is the last admin (use total admins, not filtered)
	const isLastAdmin = $derived(admins.length === 1);
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
	<AdminPageHeader title={$LL.admin.users.title()} description={$LL.admin.users.description()} />

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
							<Table.Head class="w-[200px]">{$LL.admin.users.table.id()}</Table.Head>
							<Table.Head class="w-[250px]">{$LL.admin.users.table.email()}</Table.Head>
							<Table.Head class="w-[200px]">{$LL.admin.users.table.name()}</Table.Head>
							<Table.Head class="w-[100px]">{$LL.admin.users.table.role()}</Table.Head>
							<Table.Head class="w-[250px]">{$LL.admin.users.table.lastSession()}</Table.Head>
							<Table.Head class="w-[180px] text-right">{$LL.admin.users.table.actions()}</Table.Head>
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
									{#if hasActiveSession(user.lastSessionExpiresAt)}
										<Badge variant="secondary">{$LL.admin.users.table.active()}</Badge>
										<span class="ml-2 text-sm text-muted-foreground">
											{formatLastSignIn(user.lastSessionExpiresAt)}
										</span>
									{:else}
										<span class="text-sm text-muted-foreground">
											{formatLastSignIn(user.lastSessionExpiresAt)}
										</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="w-[180px] text-right">
									<form {...demoteFromAdmin.for(user.id).preflight(demoteFromAdminSchema)}>
										<input {...demoteFromAdmin.for(user.id).fields.userId.as("hidden", user.id)} />
										<Button type="submit" size="sm" variant="outline" disabled={isLastAdmin}>
											<ChevronDown class="mr-2 size-4" />
											{$LL.admin.users.table.demote()}
										</Button>
									</form>
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
						<Table.Head class="w-[200px]">{$LL.admin.users.table.id()}</Table.Head>
						<Table.Head class="w-[250px]">{$LL.admin.users.table.email()}</Table.Head>
						<Table.Head class="w-[200px]">{$LL.admin.users.table.name()}</Table.Head>
						<Table.Head class="w-[100px]">{$LL.admin.users.table.role()}</Table.Head>
						<Table.Head class="w-[250px]">{$LL.admin.users.table.lastSession()}</Table.Head>
						<Table.Head class="w-[180px] text-right">{$LL.admin.users.table.actions()}</Table.Head>
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
									{#if hasActiveSession(user.lastSessionExpiresAt)}
										<Badge variant="secondary">{$LL.admin.users.table.active()}</Badge>
										<span class="ml-2 text-sm text-muted-foreground">
											{formatLastSignIn(user.lastSessionExpiresAt)}
										</span>
									{:else}
										<span class="text-sm text-muted-foreground">
											{formatLastSignIn(user.lastSessionExpiresAt)}
										</span>
									{/if}
								</Table.Cell>
								<Table.Cell class="w-[180px] text-right">
									<form {...promoteToAdmin.for(user.id).preflight(promoteToAdminSchema)}>
										<input {...promoteToAdmin.for(user.id).fields.userId.as("hidden", user.id)} />
										<Button type="submit" size="sm" variant="default">
											<ChevronUp class="mr-2 size-4" />
											{$LL.admin.users.table.promote()}
										</Button>
									</form>
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
