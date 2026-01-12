<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import { Separator } from "$lib/components/ui/separator";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import type { PageProps } from "./$types";
	import { createMembership, deleteMembership } from "./data.remote";
	import { createMembershipSchema } from "./schema";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";

	const { data }: PageProps = $props();

	// Initialize form with default values from server
	createMembership.fields.set(data.defaultValues);
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.admin.memberships.title()}</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.title()}</h2>
			<ul class="space-y-4">
				{#each data.memberships as membership (membership.id)}
					{@const deleteForm = deleteMembership.for(membership.id)}
					<li class="flex items-center justify-between space-x-4 rounded-md border p-4">
						<div class="text-sm">
							<p class="font-medium">{membership.type}</p>
							<p>
								<time datetime={membership.startTime.toISOString()}
									>{membership.startTime.toLocaleDateString(`${$locale}-FI`)}</time
								>–<time datetime={membership.endTime.toISOString()}
									>{membership.endTime.toLocaleDateString(`${$locale}-FI`)}</time
								>
							</p>
							<p class="text-muted-foreground">
								{$LL.admin.memberships.stripePriceIdLabel({ stripePriceId: membership.stripePriceId })}
							</p>
							<p class="text-muted-foreground">{$LL.membership.price({ price: membership.priceCents / 100 })}</p>
							<p class="text-muted-foreground">{$LL.admin.members.count({ count: membership.memberCount })}</p>
						</div>
						<div>
							{#if membership.memberCount === 0}
								<form
									class="contents"
									{...deleteForm.enhance(async ({ submit }) => {
										await submit();
										await invalidateAll();
									})}
								>
									<input type="hidden" name="id" value={membership.id} />
									<Button type="submit" variant="destructive" disabled={!!deleteForm.pending}>
										{$LL.common.delete()}
									</Button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
		<Separator class="hidden md:block" orientation="vertical" />
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.createNew()}</h2>
			<form
				{...createMembership.preflight(createMembershipSchema).enhance(async ({ submit }) => {
					await submit();
					createMembership.fields.set(data.defaultValues);
					await invalidateAll();
				})}
				oninput={() => createMembership.validate()}
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<div class="space-y-2">
					<Label for="type">{$LL.membership.type()}</Label>
					<Input {...createMembership.fields.type.as("text")} id="type" list="types" />
					<p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
					<datalist id="types">
						{#each data.types as type (type)}
							<option value={type}></option>
						{/each}
					</datalist>
					{#each createMembership.fields.type.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="stripePriceId">{$LL.admin.memberships.stripePriceId()}</Label>
					<Input {...createMembership.fields.stripePriceId.as("text")} id="stripePriceId" placeholder="price_xxx" />
					<p class="text-sm text-muted-foreground">{$LL.admin.memberships.stripePriceIdDescription()}</p>
					{#each createMembership.fields.stripePriceId.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="startTime">{$LL.membership.startTime()}</Label>
					<Input {...createMembership.fields.startTime.as("date")} id="startTime" />
					{#each createMembership.fields.startTime.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="endTime">{$LL.membership.endTime()}</Label>
					<Input {...createMembership.fields.endTime.as("date")} id="endTime" />
					{#each createMembership.fields.endTime.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="space-y-2">
					<Label for="priceCents">{$LL.membership.priceCents()}</Label>
					<Input {...createMembership.fields.priceCents.as("number")} id="priceCents" inputmode="numeric" />
					{#each createMembership.fields.priceCents.issues() as issue, i (i)}
						<p class="text-sm text-destructive">{issue.message}</p>
					{/each}
				</div>

				<div class="flex items-center gap-2">
					<Input
						{...createMembership.fields.requiresStudentVerification.as("checkbox")}
						id="requiresStudentVerification"
						class="w-auto"
					/>
					<Label for="requiresStudentVerification">{$LL.membership.requiresStudentVerification()}</Label>
				</div>

				<Button type="submit">{$LL.membership.add()}</Button>
			</form>
		</div>
	</div>
</main>
