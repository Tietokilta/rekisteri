<script lang="ts">
	import type { PageProps } from "./$types";
	import { LL } from "$lib/i18n/i18n-svelte";
	import * as Table from "$lib/components/ui/table";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Badge } from "$lib/components/ui/badge";
	import { enhance } from "$app/forms";
	import ChevronUp from "@lucide/svelte/icons/chevron-up";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";

	const { data }: PageProps = $props();

	let searchQuery = $state("");

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
</script>

<main class="container mx-auto py-6">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">{$LL.admin.users.title()}</h1>
		<p class="text-muted-foreground">{$LL.admin.users.description()}</p>
	</div>

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
							<Table.Head>{$LL.admin.users.table.id()}</Table.Head>
							<Table.Head>{$LL.admin.users.table.email()}</Table.Head>
							<Table.Head>{$LL.admin.users.table.name()}</Table.Head>
							<Table.Head>{$LL.admin.users.table.role()}</Table.Head>
							<Table.Head>{$LL.admin.users.table.lastSession()}</Table.Head>
							<Table.Head class="text-right">{$LL.admin.users.table.actions()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#each filteredAdmins as user (user.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{user.id}</Table.Cell>
								<Table.Cell>{user.email}</Table.Cell>
								<Table.Cell>
									{#if user.firstNames || user.lastName}
										{user.firstNames ?? ""} {user.lastName ?? ""}
									{:else}
										-
									{/if}
								</Table.Cell>
								<Table.Cell>
									<Badge variant="default">ADMIN</Badge>
								</Table.Cell>
								<Table.Cell>
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
								<Table.Cell class="text-right">
									<form method="POST" action="?/demoteFromAdmin" use:enhance>
										<input type="hidden" name="userId" value={user.id} />
										<Button type="submit" size="sm" variant="outline">
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
		</div>
	{/if}

	<!-- Regular Users Section -->
	<div>
		<h2 class="mb-4 text-xl font-semibold">{$LL.admin.users.usersSection()}</h2>
		<div class="rounded-md border">
			<Table.Root>
				<Table.Header>
					<Table.Row>
						<Table.Head>{$LL.admin.users.table.id()}</Table.Head>
						<Table.Head>{$LL.admin.users.table.email()}</Table.Head>
						<Table.Head>{$LL.admin.users.table.name()}</Table.Head>
						<Table.Head>{$LL.admin.users.table.role()}</Table.Head>
						<Table.Head>{$LL.admin.users.table.lastSession()}</Table.Head>
						<Table.Head class="text-right">{$LL.admin.users.table.actions()}</Table.Head>
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
						{#each filteredRegularUsers as user (user.id)}
							<Table.Row>
								<Table.Cell class="font-mono text-xs">{user.id}</Table.Cell>
								<Table.Cell>{user.email}</Table.Cell>
								<Table.Cell>
									{#if user.firstNames || user.lastName}
										{user.firstNames ?? ""} {user.lastName ?? ""}
									{:else}
										-
									{/if}
								</Table.Cell>
								<Table.Cell>-</Table.Cell>
								<Table.Cell>
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
								<Table.Cell class="text-right">
									<form method="POST" action="?/promoteToAdmin" use:enhance>
										<input type="hidden" name="userId" value={user.id} />
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
	</div>
</main>
