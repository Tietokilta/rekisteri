<script lang="ts">
	import { Separator } from "$lib/components/ui/separator";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { superForm } from "sveltekit-superforms";
	import type { PageProps } from "./$types";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { createSchema, editSchema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { enhance as defaultEnhance } from "$app/forms";
	import * as Select from "$lib/components/ui/select/index.js";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zod4Client(createSchema),
	});
	const { form: formData, enhance, constraints } = form;

	let editingMembershipId = $state<string | null>(null);

	// Helper to get membership type name by locale
	function getMembershipTypeName(membershipTypeId: string) {
		const type = data.membershipTypes.find((t) => t.id === membershipTypeId);
		if (!type) return membershipTypeId;
		return $locale === "fi" ? type.nameFi : type.nameEn;
	}

	// Helper to get membership type description by locale
	function getMembershipTypeDescription(membershipTypeId: string) {
		const type = data.membershipTypes.find((t) => t.id === membershipTypeId);
		if (!type) return "";
		const desc = $locale === "fi" ? type.descriptionFi : type.descriptionEn;
		return desc || "";
	}


<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.admin.memberships.title()}</h1>

	<div class="flex w-full max-w-4xl flex-col items-start gap-4 md:flex-row md:items-stretch">
		<div class="w-full">
			<h2 class="mb-4 font-mono text-lg">{$LL.membership.title()}</h2>
			<ul class="space-y-4">
				{#each data.memberships as membership (membership.id)}
					<li class="rounded-md border p-4">
						{#if editingMembershipId === membership.id}
							<!-- Edit form -->
							<form
								method="post"
								action={route("editMembership /[locale=locale]/admin/memberships", { locale: $locale })}
								use:defaultEnhance
								onsubmit={() => {
									editingMembershipId = null;
								}}
								class="space-y-3"
							>
								<input type="hidden" name="id" value={membership.id} />

								<div>
									<label for="edit-membershipTypeId-{membership.id}" class="text-sm font-medium">
										{$LL.membership.type()}
									</label>
									<select
										id="edit-membershipTypeId-{membership.id}"
										name="membershipTypeId"
										value={membership.membershipTypeId}
										required
										class="w-full rounded-md border px-3 py-2"
									>
										{#each data.membershipTypes as type (type.id)}
											<option value={type.id}>{$locale === "fi" ? type.nameFi : type.nameEn}</option>
										{/each}
									</select>
								</div>

								<div>
									<label for="edit-stripePriceId-{membership.id}" class="text-sm font-medium">
										{$LL.admin.memberships.stripePriceId()}
									</label>
									<input
										id="edit-stripePriceId-{membership.id}"
										name="stripePriceId"
										type="text"
										value={membership.stripePriceId}
										required
										class="w-full rounded-md border px-3 py-2"
									/>
								</div>

								<div class="grid grid-cols-2 gap-2">
									<div>
										<label for="edit-startTime-{membership.id}" class="text-sm font-medium">
											{$LL.membership.startTime()}
										</label>
										<input
											id="edit-startTime-{membership.id}"
											name="startTime"
											type="date"
											value={membership.startTime.toISOString().split("T")[0]}
											required
											class="w-full rounded-md border px-3 py-2"
										/>
									</div>
									<div>
										<label for="edit-endTime-{membership.id}" class="text-sm font-medium">
											{$LL.membership.endTime()}
										</label>
										<input
											id="edit-endTime-{membership.id}"
											name="endTime"
											type="date"
											value={membership.endTime.toISOString().split("T")[0]}
											required
											class="w-full rounded-md border px-3 py-2"
										/>
									</div>
								</div>

								<div>
									<label for="edit-priceCents-{membership.id}" class="text-sm font-medium">
										{$LL.membership.priceCents()}
									</label>
									<input
										id="edit-priceCents-{membership.id}"
										name="priceCents"
										type="number"
										value={membership.priceCents}
										required
										class="w-full rounded-md border px-3 py-2"
									/>
								</div>

								<div>
									<label class="flex items-center gap-2 text-sm">
										<input
											name="requiresStudentVerification"
											type="checkbox"
											checked={membership.requiresStudentVerification}
											class="rounded"
										/>
										{$LL.membership.requiresStudentVerification()}
									</label>
								</div>

								<div class="flex gap-2">
									<Button type="submit" size="sm">{$LL.common.save()}</Button>
									<Button
										type="button"
										size="sm"
										variant="outline"
										onclick={() => {
											editingMembershipId = null;
										}}
									>
										{$LL.common.cancel()}
									</Button>
								</div>
							</form>
						{:else}
							<!-- Display view -->
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1 space-y-1 text-sm">
									<p class="font-medium text-base">
										{getMembershipTypeName(membership.membershipTypeId)}
									</p>
									{#if getMembershipTypeDescription(membership.membershipTypeId)}
										<p class="text-xs text-muted-foreground">
											{getMembershipTypeDescription(membership.membershipTypeId)}
										</p>
									{/if}
									<p>
										<time datetime={membership.startTime.toISOString()}
											>{membership.startTime.toLocaleDateString(`${$locale}-FI`)}</time
										>
										–
										<time datetime={membership.endTime.toISOString()}
											>{membership.endTime.toLocaleDateString(`${$locale}-FI`)}</time
										>
									</p>
									<p class="text-muted-foreground">
										{$LL.admin.memberships.stripePriceIdLabel({ stripePriceId: membership.stripePriceId })}
									</p>
									<p class="text-muted-foreground">{$LL.membership.price({ price: membership.priceCents / 100 })}</p>
									<p class="text-muted-foreground">
										{$LL.admin.members.count({ count: membership.memberCount })}
									</p>
									{#if membership.requiresStudentVerification}
										<p class="text-muted-foreground text-xs">✓ {$LL.membership.requiresStudentVerification()}</p>
									{/if}
								</div>
								<div class="flex flex-col gap-2">
									{#if membership.memberCount === 0}
										<Button
											size="sm"
											variant="outline"
											onclick={() => {
												editingMembershipId = membership.id;
											}}
										>
											{$LL.common.edit()}
										</Button>
										<form
											class="contents"
											method="post"
											action={route("deleteMembership /[locale=locale]/admin/memberships", { locale: $locale })}
											use:defaultEnhance
										>
											<input type="hidden" name="id" value={membership.id} />
											<Button type="submit" size="sm" variant="destructive">{$LL.common.delete()}</Button>
										</form>
									{:else}
										<p class="text-xs text-muted-foreground">{$LL.admin.memberships.cannotEdit()}</p>
									{/if}
								</div>
							</div>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
		<Separator class="hidden md:block" orientation="vertical" />
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.createNew()}</h2>
			<form
				method="post"
				action={route("createMembership /[locale=locale]/admin/memberships", { locale: $locale })}
				use:enhance
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<Form.Field {form} name="membershipTypeId">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.type()}</Form.Label>
							<select
								{...props}
								{...$constraints.membershipTypeId}
								bind:value={$formData.membershipTypeId}
								class="w-full rounded-md border px-3 py-2"
							>
								<option value="">{$LL.membership.select()}</option>
								{#each data.membershipTypes as type (type.id)}
									<option value={type.id}>
										{$locale === "fi" ? type.nameFi : type.nameEn}
										{#if type.descriptionFi || type.descriptionEn}
											- {$locale === "fi" ? type.descriptionFi : type.descriptionEn}
										{/if}
									</option>
								{/each}
							</select>
							<Form.Description>{$LL.membership.continuityNote()}</Form.Description>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="stripePriceId">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.admin.memberships.stripePriceId()}</Form.Label>
							<Input
								{...props}
								{...$constraints.stripePriceId}
								bind:value={$formData.stripePriceId}
								placeholder="price_xxx"
							/>
							<Form.Description>{$LL.admin.memberships.stripePriceIdDescription()}</Form.Description>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="startTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.startTime()}</Form.Label>
							<Input {...props} {...$constraints.startTime} type="date" bind:value={$formData.startTime} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="endTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.endTime()}</Form.Label>
							<Input {...props} {...$constraints.endTime} type="date" bind:value={$formData.endTime} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="priceCents">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.priceCents()}</Form.Label>
							<Input {...props} {...$constraints.priceCents} inputmode="numeric" bind:value={$formData.priceCents} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="requiresStudentVerification">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.requiresStudentVerification()}</Form.Label>
							<Input
								{...props}
								{...$constraints.requiresStudentVerification}
								type="checkbox"
								bind:checked={$formData.requiresStudentVerification}
							/>
						{/snippet}
					</Form.Control>
				</Form.Field>

				<Form.Button type="submit">{$LL.membership.add()}</Form.Button>
			</form>
		</div>
	</div>
</main>
