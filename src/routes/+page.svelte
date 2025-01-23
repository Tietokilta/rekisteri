<script lang="ts">
	import { enhance } from "$app/forms";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input/index.js";
	import { Label } from "$lib/components/ui/label/index.js";
	import type { PageServerData } from "./$types";
	import * as m from "$lib/paraglide/messages.js";
	import { Switch } from "$lib/components/ui/switch";

	let { data }: { data: PageServerData } = $props();
</script>

<main class="my-8 flex flex-1 flex-col items-center gap-4 p-4">
	<h1 class="font-mono text-lg">Welcome {data.user.email}!</h1>

	<div class="w-full max-w-xs">
		<h2 class="font-mono text-lg">{m.bold_proof_grizzly_rush()}</h2>

		<form method="post" use:enhance class="flex w-full max-w-xs flex-col gap-4">
			<p>
				<Label for="email">{m.dark_weak_vulture_bless()}</Label>
				<Input id="email" name="email" type="email" required readonly value={data.user.email} />
			</p>

			<p>
				<Label for="firstNames">{m.giant_jolly_mayfly_lead()}</Label>
				<Input id="firstNames" name="firstNames" required min="1" value={data.user.firstNames} />
			</p>

			<p>
				<Label for="lastName">{m.frail_fine_fish_chop()}</Label>
				<Input id="lastName" name="lastName" required min="1" value={data.user.lastName} />
			</p>

			<p>
				<Label for="homeMunicipality">{m.lofty_patient_squid_drop()}</Label>
				<Input id="homeMunicipality" name="homeMunicipality" required min="1" value={data.user.homeMunicipality} />
			</p>

			<div class="space-y flex flex-row items-center justify-between rounded-lg border p-4">
				<div class="space-y-0.5">
					<Label for="isAllowedEmails">{m.light_frail_poodle_enrich()}</Label>
					<span class="block text-sm text-muted-foreground">{m.livid_trite_thrush_animate()}</span>
				</div>
				<Switch id="isAllowedEmails" name="isAllowedEmails" checked={data.user.isAllowedEmails} />
			</div>

			<Button type="submit">{m.tough_mellow_porpoise_explore()}</Button>
		</form>
	</div>
</main>
