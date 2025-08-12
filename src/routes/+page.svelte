<script lang="ts">
	import { Input } from "$lib/components/ui/input/index.js";
	import type { PageServerData } from "./$types";
	import * as m from "$lib/paraglide/messages.js";
	import { Switch } from "$lib/components/ui/switch";
	import { zod4Client } from "sveltekit-superforms/adapters";
	import { superForm } from "sveltekit-superforms";
	import { schema } from "./schema";
	import * as Form from "$lib/components/ui/form/index.js";
	import { route } from "$lib/ROUTES";
	import { Separator } from "$lib/components/ui/separator";
	import UserCog from "@lucide/svelte/icons/user-cog";
	import CircleCheck from "@lucide/svelte/icons/circle-check";
	import CircleAlert from "@lucide/svelte/icons/circle-alert";
	import Trash from "@lucide/svelte/icons/trash";
	import Hourglass from "@lucide/svelte/icons/hourglass";
	import Banknote from "@lucide/svelte/icons/banknote";
	import { localizeHref, getLocale } from "$lib/paraglide/runtime";

	let { data }: { data: PageServerData } = $props();

	const form = superForm(data.form, {
		validators: zod4Client(schema),
		validationMethod: "oninput",
	});
	const { form: formData, enhance } = form;
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">
		{m.bad_crazy_termite_jump({ firstNames: data.user.firstNames ?? "", lastName: data.user.lastName ?? "" })}
	</h1>

	<div class="flex w-full max-w-2xl flex-col items-center gap-4 md:flex-row md:items-stretch">
		<div class="w-full max-w-xs">
			<h2 class="font-mono text-lg">{m.bold_proof_grizzly_rush()}</h2>

			<form method="post" action={route("saveInfo /")} use:enhance class="flex w-full max-w-xs flex-col gap-4">
				<Form.Field {form} name="email">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.dark_weak_vulture_bless()}</Form.Label>
							<Input {...props} type="email" readonly bind:value={$formData.email} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="firstNames">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.giant_jolly_mayfly_lead()}</Form.Label>
							<Input {...props} bind:value={$formData.firstNames} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="lastName">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.frail_fine_fish_chop()}</Form.Label>
							<Input {...props} bind:value={$formData.lastName} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field {form} name="homeMunicipality">
					<Form.Control>
						{#snippet children({ props })}
							<Form.Label>{m.lofty_patient_squid_drop()}</Form.Label>
							<Input {...props} bind:value={$formData.homeMunicipality} />
						{/snippet}
					</Form.Control>
					<Form.FieldErrors />
				</Form.Field>

				<Form.Field
					{form}
					name="isAllowedEmails"
					class="space-y flex flex-row items-center justify-between rounded-lg border p-4"
				>
					<Form.Control>
						{#snippet children({ props })}
							<div class="space-y-0.5">
								<Form.Label>{m.light_frail_poodle_enrich()}</Form.Label>
								<Form.Description>{m.livid_trite_thrush_animate()}</Form.Description>
							</div>
							<Switch {...props} bind:checked={$formData.isAllowedEmails} />
						{/snippet}
					</Form.Control>
				</Form.Field>

				<Form.Button type="submit">{m.tough_mellow_porpoise_explore()}</Form.Button>

				<Form.Button formnovalidate formmethod="post" formaction={route("signOut /")} variant="outline"
					>{m.brief_early_scallop_bless()}</Form.Button
				>
			</form>
		</div>

		{#if data.user.isAdmin}
			<Separator class="hidden md:block" orientation="vertical" />
			<div class="flex w-full max-w-xs flex-col gap-4">
				<h2 class="font-mono text-lg">{m.each_strong_butterfly_seek()}</h2>
				<a
					href={localizeHref(route("/admin/memberships"))}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{m.raw_nimble_ibex_flow()}</p>
						<p class="text-sm text-muted-foreground">{m.jolly_due_snake_support()}</p>
					</div>
				</a>
				<a
					href={localizeHref(route("/admin/members"))}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">{m.warm_large_otter_push()}</p>
						<p class="text-sm text-muted-foreground">{m.legal_zany_tortoise_flop()}</p>
					</div>
				</a>
				<a
					href={localizeHref(route("/admin/members/import"))}
					class="flex items-center space-x-4 rounded-md border p-4 hover:bg-card-foreground/10"
				>
					<UserCog class="h-6 w-6" />
					<div class="flex-1 space-y-1">
						<p class="text-sm leading-none font-medium">Tuo jäseniä</p>
						<p class="text-sm text-muted-foreground">Tuo jäseniä CSV-tiedostosta</p>
					</div>
				</a>
			</div>
		{:else}
			<Separator class="hidden md:block" orientation="vertical" />
			<div class="flex w-full max-w-xs flex-col gap-4">
				<h2 class="font-mono text-lg">{m.smug_vexed_toucan_dream()}</h2>
				<a href={route("/new")} class="flex w-full max-w-xs flex-col">
					<Form.Button variant="default">{m.proof_spicy_mule_loop()}</Form.Button>
				</a>
				{#if data.memberships.length === 0}
					<p class="text-sm text-muted-foreground">{m.weird_sad_gazelle_pet()}</p>
				{:else}
					{#each data.memberships as membership (membership.unique_id)}
						<li class="flex items-center justify-between space-x-4 rounded-md border p-4">
							{#if membership.status === "active"}
								<span title={m.curly_equal_impala_strive()}>
									<CircleCheck class="h-6 w-6" />
								</span>
							{:else if membership.status === "expired"}
								<span title={m.good_elegant_javelina_catch()}>
									<Trash class="h-6 w-6" />
								</span>
							{:else if membership.status === "awaiting_payment"}
								<span title={m.curly_equal_panda_bake()}>
									<Banknote class="h-6 w-6" />
								</span>
							{:else if membership.status === "awaiting_approval"}
								<span title={m.inclusive_bright_parrot_hike()}>
									<Hourglass class="h-6 w-6" />
								</span>
							{:else}
								<span title={m.sea_dull_shark_slurp()}>
									<CircleAlert class="h-6 w-6" />
								</span>
							{/if}
							<div class="flex-1 space-y-1">
								<div class="text-sm">
									<p class="font-medium">{membership.type}</p>
									<p>
										<time datetime={membership.startTime.toISOString()}
											>{membership.startTime.toLocaleDateString(`${getLocale()}-FI`)}</time
										>–<time datetime={membership.endTime.toISOString()}
											>{membership.endTime.toLocaleDateString(`${getLocale()}-FI`)}</time
										>
									</p>
								</div>
							</div>
						</li>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
</main>
