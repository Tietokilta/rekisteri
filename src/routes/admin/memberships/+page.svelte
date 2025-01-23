<script lang="ts">
	import { Separator } from "$lib/components/ui/separator";
	import { languageTag } from "$lib/paraglide/runtime";
	import { route } from "$lib/ROUTES";
	import { superForm } from "sveltekit-superforms";
	import type { PageProps } from "./$types";
	import { zodClient } from "sveltekit-superforms/adapters";
	import { createSchema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
	import { Input } from "$lib/components/ui/input";
	import * as m from "$lib/paraglide/messages.js";
	import { Button } from "$lib/components/ui/button";
	import { enhance as defaultEnhance } from "$app/forms";

	const { data }: PageProps = $props();

	const form = superForm(data.form, {
		validators: zodClient(createSchema),
	});
	const { form: formData, enhance, constraints } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">{m.smug_vexed_toucan_dream()}</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{m.equal_smug_dolphin_promise()}</h2>
			<ul class="space-y-4">
				{#each data.memberships as membership}
					<li class="flex items-center justify-between space-x-4 rounded-md border p-4">
						<div class="text-sm">
							<p class="font-medium">{membership.type}</p>
							<p>
								<time datetime={membership.startTime.toISOString()}
									>{membership.startTime.toLocaleDateString(`${languageTag()}-FI`)}</time
								>–<time datetime={membership.endTime.toISOString()}
									>{membership.endTime.toLocaleDateString(`${languageTag()}-FI`)}</time
								>
							</p>
							<p class="text-muted-foreground">{m.active_home_lobster_flip({ price: membership.priceCents / 100 })}</p>
							<p class="text-muted-foreground">{m.zippy_proof_parrot_climb({ count: membership.memberCount })}</p>
						</div>
						<div>
							{#if membership.memberCount === 0}
								<form
									class="contents"
									method="post"
									action={route("deleteMembership /admin/memberships")}
									use:defaultEnhance
								>
									<input type="hidden" name="id" value={membership.id} />
									<Button type="submit" variant="destructive">{m.gray_brief_camel_clasp()}</Button>
								</form>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		</div>
		<Separator class="hidden md:block" orientation="vertical" />
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{m.flaky_lower_pig_cut()}</h2>
			<form
				method="post"
				action={route("createMembership /admin/memberships")}
				use:enhance
				class="flex w-full max-w-xs flex-col gap-4"
			>
				<Form.Field {form} name="type">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.long_quick_peacock_gulp()}</Form.Label>
							<Input {...props} {...$constraints.type} list="types" bind:value={$formData.type} />
							<Form.Description>{m.any_mild_seal_trust()}</Form.Description>
							<datalist id="types">
								{#each data.types as type}
									<option value={type}></option>
								{/each}
							</datalist>
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="startTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.early_loved_cockroach_radiate()}</Form.Label>
							<Input {...props} {...$constraints.startTime} type="date" bind:value={$formData.startTime} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="endTime">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.trite_plain_dachshund_rest()}</Form.Label>
							<Input {...props} {...$constraints.endTime} type="date" bind:value={$formData.endTime} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="priceCents">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.level_sad_ant_nurture()}</Form.Label>
							<Input {...props} {...$constraints.priceCents} inputmode="numeric" bind:value={$formData.priceCents} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Button type="submit">{m.warm_any_penguin_pop()}</Form.Button>
			</form>
		</div>
	</div>
</main>
