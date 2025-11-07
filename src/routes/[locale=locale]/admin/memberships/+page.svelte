<script lang="ts">
	import { Separator } from "$lib/components/ui/separator";
	import { LL, locale } from "$lib/i18n/i18n-svelte";
	import { route } from "$lib/ROUTES";
	import { superForm } from "sveltekit-superforms";
	import type { PageProps } from "./$types";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { createSchema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { enhance as defaultEnhance } from "$app/forms";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zod4Client(createSchema),
	});
	const { form: formData, enhance, constraints } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{$LL.admin.memberships.title()}</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{$LL.membership.title()}</h2>
			<ul class="space-y-4">
				{#each data.memberships as membership (membership.id)}
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
									method="post"
									action={route("deleteMembership /[locale=locale]/admin/memberships", { locale: $locale })}
									use:defaultEnhance
								>
									<input type="hidden" name="id" value={membership.id} />
									<Button type="submit" variant="destructive">{$LL.common.delete()}</Button>
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
				method="post"
				action={route("createMembership /[locale=locale]/admin/memberships", { locale: $locale })}
				use:enhance
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<Form.Field {form} name="type">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{$LL.membership.type()}</Form.Label>
							<Input {...props} {...$constraints.type} list="types" bind:value={$formData.type} />
							<Form.Description>{$LL.membership.continuityNote()}</Form.Description>
							<datalist id="types">
								{#each data.types as type (type)}
									<option value={type}></option>
								{/each}
							</datalist>
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
