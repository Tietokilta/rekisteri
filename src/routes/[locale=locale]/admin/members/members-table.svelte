<script lang="ts">
	import { createSvelteTable, FlexRender } from "$lib/components/ui/data-table";
	import * as Table from "$lib/components/ui/table";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import {
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type ColumnDef,
		type SortingState,
		type ColumnFiltersState,
		type Row as TanStackRow,
	} from "@tanstack/table-core";
	import ChevronDown from "@lucide/svelte/icons/chevron-down";
	import ChevronRight from "@lucide/svelte/icons/chevron-right";
	import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
	import Copy from "@lucide/svelte/icons/copy";
	import Check from "@lucide/svelte/icons/check";
	import Download from "@lucide/svelte/icons/download";
	import { enhance } from "$app/forms";
	import { goto } from "$app/navigation";
	import { page } from "$app/state";
	import { SvelteURLSearchParams } from "svelte/reactivity";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { isNonEmpty } from "$lib/utils";

	type MemberRow = {
		id: string;
		userId: string;
		membershipId: string;
		status: "awaiting_payment" | "awaiting_approval" | "active" | "expired" | "cancelled";
		stripeSessionId: string | null;
		createdAt: Date;
		updatedAt: Date;
		email: string | null;
		firstNames: string | null;
		lastName: string | null;
		homeMunicipality: string | null;
		preferredLanguage: "unspecified" | "finnish" | "english" | null;
		isAllowedEmails: boolean | null;
		membershipType: string | null;
		membershipStartTime: Date | null;
		membershipEndTime: Date | null;
		membershipPriceCents: number | null;
		// Grouped membership data
		allMemberships: Array<{
			id: string;
			membershipId: string;
			status: "awaiting_payment" | "awaiting_approval" | "active" | "expired" | "cancelled";
			stripeSessionId: string | null;
			createdAt: Date;
			updatedAt: Date;
			membershipType: string | null;
			membershipStartTime: Date | null;
			membershipEndTime: Date | null;
			membershipPriceCents: number | null;
		}>;
		membershipCount: number;
	};

	type Props = {
		data: MemberRow[];
		membershipTypes: string[];
		years: number[];
	};

	let { data, membershipTypes, years }: Props = $props();

	// Reactive URL search params
	const urlParams = new SvelteURLSearchParams(page.url.searchParams);

	// Table state - synced with URL
	let sorting = $state<SortingState>(
		urlParams.get("sort") && urlParams.get("order")
			? [{ id: urlParams.get("sort") ?? "", desc: urlParams.get("order") === "desc" }]
			: [],
	);
	let columnFilters = $state<ColumnFiltersState>([]);
	let globalFilter = $state(urlParams.get("search") ?? "");
	let expandedRows = $state<Set<string>>(new Set());
	let columnVisibility = $state<Record<string, boolean>>({
		membershipStartTime: false, // Hide the filter column
		isAllowedEmails: false, // Hide the filter column
	});
	let pagination = $state({
		pageIndex: Number.parseInt(urlParams.get("page") ?? "0"),
		pageSize: Number.parseInt(urlParams.get("pageSize") ?? "100"),
	});

	// Filter state - synced with URL
	let selectedYear = $state<string>(urlParams.get("year") ?? "all");
	let selectedType = $state<string>(urlParams.get("type") ?? "all");
	let selectedStatus = $state<string>(urlParams.get("status") ?? "all");
	let selectedEmailAllowed = $state<string>(urlParams.get("emailAllowed") ?? "all");

	// Debounce timer for URL updates
	let updateTimer: ReturnType<typeof setTimeout> | null = null;

	// Sync state to URL with debouncing
	$effect(() => {
		// Track all reactive values
		void globalFilter;
		void selectedYear;
		void selectedType;
		void selectedStatus;
		void selectedEmailAllowed;
		void sorting;
		void pagination;

		// Clear existing timer
		if (updateTimer) clearTimeout(updateTimer);

		// Debounce URL updates to prevent flooding
		updateTimer = setTimeout(() => {
			// Clear all params first
			for (const key of Array.from(urlParams.keys())) {
				urlParams.delete(key);
			}

			// Add search if present
			if (globalFilter) urlParams.set("search", globalFilter);

			// Add filters if not "all"
			if (selectedYear !== "all") urlParams.set("year", selectedYear);
			if (selectedType !== "all") urlParams.set("type", selectedType);
			if (selectedStatus !== "all") urlParams.set("status", selectedStatus);
			if (selectedEmailAllowed !== "all") urlParams.set("emailAllowed", selectedEmailAllowed);

			// Add sorting if present
			if (isNonEmpty(sorting)) {
				urlParams.set("sort", sorting[0].id);
				urlParams.set("order", sorting[0].desc ? "desc" : "asc");
			}

			// Add pagination if not defaults
			if (pagination.pageIndex !== 0) urlParams.set("page", pagination.pageIndex.toString());
			if (pagination.pageSize !== 100) urlParams.set("pageSize", pagination.pageSize.toString());

			// Update URL without reloading
			const newUrl = `${page.url.pathname}${urlParams.toString() ? `?${urlParams.toString()}` : ""}`;
			goto(newUrl, { replaceState: true, noScroll: true, keepFocus: true });
		}, 300); // 300ms debounce
	});

	// Copy to clipboard state
	let copySuccess = $state(false);
	let exportSuccess = $state(false);

	// Helper to copy filtered members as text
	async function copyMembersAsText() {
		const filteredRows = table.getFilteredRowModel().rows;

		// Group members by membership type
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const grouped = new Map<string, MemberRow[]>();
		for (const row of filteredRows) {
			const type = row.original.membershipType ?? "Unknown";
			if (!grouped.has(type)) {
				grouped.set(type, []);
			}
			const typeGroup = grouped.get(type);
			if (typeGroup) {
				typeGroup.push(row.original);
			}
		}

		// Build text output
		let text = "";
		for (const [type, members] of grouped) {
			text += `${type}:\n`;
			for (const member of members) {
				const firstName = member.firstNames ?? "";
				const lastName = member.lastName ?? "";
				text += `  ${firstName} ${lastName}\n`;
			}
			text += "\n";
		}

		// Copy to clipboard
		try {
			await navigator.clipboard.writeText(text.trim());
			copySuccess = true;
			setTimeout(() => {
				copySuccess = false;
			}, 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	}

	// Helper to export filtered members as CSV (Google Groups format)
	function exportMembersAsCSV() {
		const filteredRows = table.getFilteredRowModel().rows;

		// Google Groups CSV format: Group Email [Required],Member Email,Member Type,Member Role
		// We'll use a simpler format: Email,First Name,Last Name
		const csvRows = ["Email,First Name,Last Name"];

		for (const row of filteredRows) {
			const email = (row.original.email ?? "").replace(/"/g, '""'); // Escape quotes
			const firstName = (row.original.firstNames ?? "").replace(/"/g, '""');
			const lastName = (row.original.lastName ?? "").replace(/"/g, '""');

			// Only export members with email addresses
			if (email) {
				csvRows.push(`"${email}","${firstName}","${lastName}"`);
			}
		}

		const csvContent = csvRows.join("\n");

		// Create a blob and trigger download
		const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
		const link = document.createElement("a");
		const url = URL.createObjectURL(blob);

		// Generate filename with timestamp
		const timestamp = new Date().toISOString().split("T")[0];
		link.setAttribute("href", url);
		link.setAttribute("download", `members-export-${timestamp}.csv`);
		link.style.visibility = "hidden";

		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);

		// Show success message
		exportSuccess = true;
		setTimeout(() => {
			exportSuccess = false;
		}, 2000);
	}

	// Helper to filter memberships based on current filters
	function getFilteredMemberships(allMemberships: MemberRow["allMemberships"]) {
		return allMemberships.filter((membership) => {
			// Year filter
			if (selectedYear !== "all") {
				const membershipYear = membership.membershipStartTime?.getFullYear().toString();
				if (membershipYear !== selectedYear) return false;
			}

			// Type filter
			if (selectedType !== "all" && membership.membershipType !== selectedType) return false;

			// Status filter
			if (selectedStatus !== "all" && membership.status !== selectedStatus) return false;

			return true;
		});
	}

	// Status color mapping
	function getStatusColor(status: MemberRow["status"]) {
		switch (status) {
			case "active":
				return "default";
			case "awaiting_payment":
				return "secondary";
			case "awaiting_approval":
				return "secondary";
			case "expired":
				return "destructive";
			case "cancelled":
				return "outline";
			default:
				return "outline";
		}
	}

	// Format status for display
	function formatStatus(status: MemberRow["status"]) {
		return status.replaceAll("_", " ").replaceAll(/\b\w/g, (l) => l.toUpperCase());
	}

	// Custom filter function for year
	const yearFilterFn = (row: TanStackRow<MemberRow>, columnId: string, filterValue: string) => {
		const startTime = row.getValue(columnId) as Date | null;
		if (!startTime) return false;
		const year = startTime.getFullYear().toString();
		return year === filterValue;
	};

	// Column definitions
	const columns = $derived<ColumnDef<MemberRow>[]>([
		{
			id: "expand",
			header: "",
			cell: ({ row }) => row.original.id,
			enableSorting: false,
		},
		{
			accessorKey: "firstNames",
			header: $LL.admin.members.table.firstNames(),
			cell: ({ row }) => row.original.firstNames ?? "-",
			enableSorting: true,
		},
		{
			accessorKey: "lastName",
			header: $LL.admin.members.table.lastName(),
			cell: ({ row }) => row.original.lastName ?? "-",
			enableSorting: true,
		},
		{
			accessorKey: "email",
			header: $LL.admin.members.table.email(),
			cell: ({ row }) => row.original.email ?? "-",
			enableSorting: true,
		},
		{
			accessorKey: "membershipType",
			header: $LL.admin.members.table.membershipType(),
			cell: ({ row }) => row.original.membershipType ?? "-",
			enableSorting: true,
		},
		{
			accessorKey: "status",
			header: $LL.admin.members.table.status(),
			cell: ({ row }) => row.original.status,
			enableSorting: true,
		},
		// Hidden column for filtering by year
		{
			accessorKey: "membershipStartTime",
			header: "",
			enableHiding: true,
			enableSorting: false,
			filterFn: yearFilterFn,
		},
		// Hidden column for filtering by email allowed
		{
			accessorKey: "isAllowedEmails",
			header: "",
			enableHiding: true,
			enableSorting: false,
		},
	]);

	// Apply filters
	$effect(() => {
		const filters: ColumnFiltersState = [];

		// Year filter
		if (selectedYear !== "all") {
			filters.push({
				id: "membershipStartTime",
				value: selectedYear,
			});
		}

		// Type filter
		if (selectedType !== "all") {
			filters.push({
				id: "membershipType",
				value: selectedType,
			});
		}

		// Status filter
		if (selectedStatus !== "all") {
			filters.push({
				id: "status",
				value: selectedStatus,
			});
		}

		// Email allowed filter
		if (selectedEmailAllowed !== "all") {
			filters.push({
				id: "isAllowedEmails",
				value: selectedEmailAllowed === "allowed",
			});
		}

		columnFilters = filters;
	});

	// Create table
	const table = $derived(
		createSvelteTable({
			data,
			columns,
			state: {
				get sorting() {
					return sorting;
				},
				get columnFilters() {
					return columnFilters;
				},
				get globalFilter() {
					return globalFilter;
				},
				get columnVisibility() {
					return columnVisibility;
				},
				get pagination() {
					return pagination;
				},
			},
			onSortingChange: (updater) => {
				sorting = typeof updater === "function" ? updater(sorting) : updater;
			},
			onColumnFiltersChange: (updater) => {
				columnFilters = typeof updater === "function" ? updater(columnFilters) : updater;
			},
			onGlobalFilterChange: (updater) => {
				globalFilter = typeof updater === "function" ? updater(globalFilter) : updater;
			},
			onColumnVisibilityChange: (updater) => {
				columnVisibility = typeof updater === "function" ? updater(columnVisibility) : updater;
			},
			onPaginationChange: (updater) => {
				pagination = typeof updater === "function" ? updater(pagination) : updater;
			},
			getCoreRowModel: getCoreRowModel(),
			getSortedRowModel: getSortedRowModel(),
			getFilteredRowModel: getFilteredRowModel(),
			getPaginationRowModel: getPaginationRowModel(),
			globalFilterFn: (row, columnId, filterValue) => {
				const searchValue = filterValue.toLowerCase();
				const firstName = (row.original.firstNames ?? "").toLowerCase();
				const lastName = (row.original.lastName ?? "").toLowerCase();
				const email = (row.original.email ?? "").toLowerCase();
				const municipality = (row.original.homeMunicipality ?? "").toLowerCase();

				return (
					firstName.includes(searchValue) ||
					lastName.includes(searchValue) ||
					email.includes(searchValue) ||
					municipality.includes(searchValue)
				);
			},
		}),
	);
</script>

<div class="space-y-4">
	<!-- Filters and Search -->
	<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
		<div class="flex gap-2">
			<Input placeholder={$LL.admin.members.table.search()} type="search" class="max-w-sm" bind:value={globalFilter} />
			<Button variant="outline" size="default" onclick={copyMembersAsText}>
				{#if copySuccess}
					<Check class="mr-2 size-4" />
					{$LL.admin.members.table.copied()}
				{:else}
					<Copy class="mr-2 size-4" />
					{$LL.admin.members.table.copyAsText()}
				{/if}
			</Button>
			<Button variant="outline" size="default" onclick={exportMembersAsCSV}>
				{#if exportSuccess}
					<Check class="mr-2 size-4" />
					{$LL.admin.members.table.exported()}
				{:else}
					<Download class="mr-2 size-4" />
					{$LL.admin.members.table.exportCsv()}
				{/if}
			</Button>
		</div>
		<div class="flex flex-col gap-3">
			<!-- Year Filter -->
			<div class="flex flex-wrap gap-2">
				<span class="text-sm font-medium">{$LL.admin.members.table.filterYear()}</span>
				<Button
					variant={selectedYear === "all" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedYear = "all")}
				>
					{$LL.admin.members.table.all()}
				</Button>
				{#each years as year (year)}
					<Button
						variant={selectedYear === year.toString() ? "default" : "outline"}
						size="sm"
						onclick={() => (selectedYear = year.toString())}
					>
						{year}
					</Button>
				{/each}
			</div>

			<!-- Type Filter -->
			<div class="flex flex-wrap gap-2">
				<span class="text-sm font-medium">{$LL.admin.members.table.filterType()}</span>
				<Button
					variant={selectedType === "all" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedType = "all")}
				>
					{$LL.admin.members.table.all()}
				</Button>
				{#each membershipTypes as type (type)}
					<Button
						variant={selectedType === type ? "default" : "outline"}
						size="sm"
						onclick={() => (selectedType = type)}
					>
						{type}
					</Button>
				{/each}
			</div>

			<!-- Status Filter -->
			<div class="flex flex-wrap gap-2">
				<span class="text-sm font-medium">{$LL.admin.members.table.filterStatus()}</span>
				<Button
					variant={selectedStatus === "all" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "all")}
				>
					{$LL.admin.members.table.all()}
				</Button>
				<Button
					variant={selectedStatus === "active" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "active")}
				>
					{$LL.admin.members.table.active()}
				</Button>
				<Button
					variant={selectedStatus === "expired" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "expired")}
				>
					{$LL.admin.members.table.expired()}
				</Button>
				<Button
					variant={selectedStatus === "awaiting_approval" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "awaiting_approval")}
				>
					{$LL.admin.members.table.awaitingApproval()}
				</Button>
				<Button
					variant={selectedStatus === "awaiting_payment" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "awaiting_payment")}
				>
					{$LL.admin.members.table.awaitingPayment()}
				</Button>
				<Button
					variant={selectedStatus === "cancelled" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedStatus = "cancelled")}
				>
					{$LL.admin.members.table.cancelled()}
				</Button>
			</div>

			<!-- Email Allowed Filter -->
			<div class="flex flex-wrap gap-2">
				<span class="text-sm font-medium">{$LL.admin.members.table.filterEmailAllowed()}</span>
				<Button
					variant={selectedEmailAllowed === "all" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedEmailAllowed = "all")}
				>
					{$LL.admin.members.table.all()}
				</Button>
				<Button
					variant={selectedEmailAllowed === "allowed" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedEmailAllowed = "allowed")}
				>
					{$LL.admin.members.table.emailAllowed()}
				</Button>
				<Button
					variant={selectedEmailAllowed === "notAllowed" ? "default" : "outline"}
					size="sm"
					onclick={() => (selectedEmailAllowed = "notAllowed")}
				>
					{$LL.admin.members.table.emailNotAllowed()}
				</Button>
			</div>
		</div>
	</div>

	<!-- Table -->
	<div class="rounded-md border">
		<Table.Root>
			<Table.Header>
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					<Table.Row>
						{#each headerGroup.headers as header (header.id)}
							<Table.Head>
								{#if !header.isPlaceholder}
									{#if header.column.getCanSort()}
										<Button
											variant="ghost"
											size="sm"
											class="-ml-3 h-8 data-[state=open]:bg-accent"
											onclick={() => header.column.toggleSorting()}
										>
											<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
											<ArrowUpDown class="ml-2 size-4" />
										</Button>
									{:else}
										<FlexRender content={header.column.columnDef.header} context={header.getContext()} />
									{/if}
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#each table.getRowModel().rows as row (row.id)}
					<Table.Row>
						{#each row.getVisibleCells() as cell (cell.id)}
							<Table.Cell>
								{#if cell.column.id === "expand"}
									<Button
										variant="ghost"
										size="sm"
										onclick={() => {
											const userId = row.original.userId;
											if (expandedRows.has(userId)) {
												// eslint-disable-next-line svelte/prefer-svelte-reactivity
												const newSet = new Set(expandedRows);
												newSet.delete(userId);
												expandedRows = newSet;
											} else {
												expandedRows = new Set([...expandedRows, userId]);
											}
										}}
									>
										{#if expandedRows.has(row.original.userId)}
											<ChevronDown class="size-4" />
										{:else}
											<ChevronRight class="size-4" />
										{/if}
									</Button>
								{:else if cell.column.id === "status"}
									<Badge variant={getStatusColor(row.original.status)}>
										{formatStatus(row.original.status)}
									</Badge>
								{:else if cell.column.id === "membershipType"}
									{@const filteredMemberships = getFilteredMemberships(row.original.allMemberships)}
									<div class="flex items-center gap-2">
										<span>{row.original.membershipType ?? "-"}</span>
										{#if filteredMemberships.length > 1}
											<Badge variant="secondary" class="text-xs">
												{$LL.admin.members.table.membershipsCount({ count: filteredMemberships.length })}
											</Badge>
										{/if}
									</div>
								{:else}
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								{/if}
							</Table.Cell>
						{/each}
					</Table.Row>
					{#if expandedRows.has(row.original.userId)}
						{@const filteredMemberships = getFilteredMemberships(row.original.allMemberships)}
						<Table.Row class="bg-muted/50">
							<Table.Cell colspan={columns.length}>
								<div class="p-4">
									<!-- User Details -->
									<div class="mb-4 space-y-2">
										<h4 class="font-semibold">{$LL.admin.members.table.userDetails()}</h4>
										<dl class="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
											<div>
												<dt class="text-muted-foreground">{$LL.admin.members.table.userIdLabel()}</dt>
												<dd class="font-mono">{row.original.userId}</dd>
											</div>
											<div>
												<dt class="text-muted-foreground">{$LL.admin.members.table.emailLabel()}</dt>
												<dd>{row.original.email ?? "-"}</dd>
											</div>
											<div>
												<dt class="text-muted-foreground">{$LL.admin.members.table.municipalityLabel()}</dt>
												<dd>{row.original.homeMunicipality ?? "-"}</dd>
											</div>
											<div>
												<dt class="text-muted-foreground">{$LL.admin.members.table.preferredLanguageLabel()}</dt>
												<dd>
													{#if row.original.preferredLanguage === "finnish"}
														{$LL.user.preferredLanguageOptions.finnish()}
													{:else if row.original.preferredLanguage === "english"}
														{$LL.user.preferredLanguageOptions.english()}
													{:else}
														{$LL.user.preferredLanguageOptions.unspecified()}
													{/if}
												</dd>
											</div>
											<div>
												<dt class="text-muted-foreground">{$LL.admin.members.table.emailAllowedLabel()}</dt>
												<dd>
													{row.original.isAllowedEmails ? $LL.admin.members.table.yes() : $LL.admin.members.table.no()}
												</dd>
											</div>
										</dl>
									</div>

									<!-- Filtered Memberships -->
									<div class="space-y-3">
										<h4 class="font-semibold">
											{#if filteredMemberships.length !== row.original.membershipCount}
												{$LL.admin.members.table.memberships()} ({$LL.admin.members.table.membershipsOf({
													filtered: filteredMemberships.length,
													total: row.original.membershipCount,
												})})
											{:else}
												{$LL.admin.members.table.memberships()} ({filteredMemberships.length})
											{/if}
										</h4>
										<div class="space-y-3">
											{#each filteredMemberships as membership (membership.id)}
												<div class="rounded-md border p-4">
													<div class="mb-3 grid gap-2 text-sm md:grid-cols-3">
														<div>
															<dt class="text-muted-foreground">{$LL.admin.members.table.typeLabel()}</dt>
															<dd class="font-medium">{membership.membershipType ?? "-"}</dd>
														</div>
														<div>
															<dt class="text-muted-foreground">{$LL.admin.members.table.periodLabel()}</dt>
															<dd>
																{membership.membershipStartTime?.toLocaleDateString() ?? "-"} - {membership.membershipEndTime?.toLocaleDateString() ??
																	"-"}
															</dd>
														</div>
														<div>
															<dt class="text-muted-foreground">{$LL.admin.members.table.priceLabel()}</dt>
															<dd>
																{membership.membershipPriceCents
																	? `€${(membership.membershipPriceCents / 100).toFixed(2)}`
																	: "-"}
															</dd>
														</div>
														<div>
															<dt class="text-muted-foreground">{$LL.admin.members.table.statusLabel()}</dt>
															<dd>
																<Badge variant={getStatusColor(membership.status)}>
																	{formatStatus(membership.status)}
																</Badge>
															</dd>
														</div>
														<div>
															<dt class="text-muted-foreground">{$LL.admin.members.table.createdLabel()}</dt>
															<dd>{membership.createdAt.toLocaleDateString()}</dd>
														</div>
														{#if membership.stripeSessionId}
															<div>
																<dt class="text-muted-foreground">{$LL.admin.members.table.stripeSessionLabel()}</dt>
																<dd class="font-mono text-xs">{membership.stripeSessionId}</dd>
															</div>
														{/if}
													</div>

													<!-- Admin Actions per membership -->
													{#if membership.status === "awaiting_approval"}
														<div class="flex gap-2 border-t pt-3">
															<form method="POST" action="?/approve" use:enhance>
																<input type="hidden" name="memberId" value={membership.id} />
																<Button type="submit" size="sm" variant="default"
																	>{$LL.admin.members.table.approve()}</Button
																>
															</form>
															<form method="POST" action="?/reject" use:enhance>
																<input type="hidden" name="memberId" value={membership.id} />
																<Button type="submit" size="sm" variant="destructive"
																	>{$LL.admin.members.table.reject()}</Button
																>
															</form>
														</div>
													{:else if membership.status === "expired" || membership.status === "cancelled"}
														<div class="flex gap-2 border-t pt-3">
															<form method="POST" action="?/reactivate" use:enhance>
																<input type="hidden" name="memberId" value={membership.id} />
																<Button type="submit" size="sm" variant="default"
																	>{$LL.admin.members.table.reactivate()}</Button
																>
															</form>
														</div>
													{:else if membership.status === "active" || membership.status === "awaiting_payment"}
														<div class="flex gap-2 border-t pt-3">
															<form method="POST" action="?/markExpired" use:enhance>
																<input type="hidden" name="memberId" value={membership.id} />
																<Button type="submit" size="sm" variant="outline"
																	>{$LL.admin.members.table.markExpired()}</Button
																>
															</form>
															<form method="POST" action="?/cancel" use:enhance>
																<input type="hidden" name="memberId" value={membership.id} />
																<Button type="submit" size="sm" variant="destructive"
																	>{$LL.admin.members.table.cancelMembership()}</Button
																>
															</form>
														</div>
													{/if}
												</div>
											{/each}
										</div>
									</div>
								</div>
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	</div>

	<!-- Pagination -->
	<div class="flex items-center justify-between">
		<div class="text-sm text-muted-foreground">
			{$LL.admin.members.table.showing({
				current: table.getRowModel().rows.length,
				total: table.getFilteredRowModel().rows.length,
			})}
		</div>
		<div class="flex gap-2">
			<Button variant="outline" size="sm" onclick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
				{$LL.admin.members.table.previous()}
			</Button>
			<Button variant="outline" size="sm" onclick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
				{$LL.admin.members.table.next()}
			</Button>
		</div>
	</div>
</div>
