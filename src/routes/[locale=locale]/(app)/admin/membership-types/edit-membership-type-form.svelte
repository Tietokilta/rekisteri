<script lang="ts">
	import { untrack } from "svelte";
	import { invalidateAll } from "$app/navigation";
	import { toast } from "svelte-sonner";
	import { LL } from "$lib/i18n/i18n-svelte";
	import { updateMembershipType, deleteMembershipType } from "./data.remote";
	import { updateMembershipTypeSchema, deleteMembershipTypeSchema } from "./schema";
	import { Input } from "$lib/components/ui/input";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import * as Sheet from "$lib/components/ui/sheet";
	import Trash2 from "@lucide/svelte/icons/trash-2";
	import type { LocalizedString } from "$lib/server/db/schema";

	interface MembershipType {
		id: string;
		name: LocalizedString;
		description: LocalizedString | null;
		membershipCount: number;
	}

	interface Props {
		membershipType: MembershipType;
		onClose: () => void;
	}

	let { membershipType, onClose }: Props = $props();

	// Generate unique IDs for form elements
	const formId = $derived(`edit-membership-type-form-${membershipType.id}`);
	const idInputId = $derived(`edit-id-${membershipType.id}`);
	const nameFiInputId = $derived(`edit-nameFi-${membershipType.id}`);
	const nameEnInputId = $derived(`edit-nameEn-${membershipType.id}`);
	const descriptionFiInputId = $derived(`edit-descriptionFi-${membershipType.id}`);
	const descriptionEnInputId = $derived(`edit-descriptionEn-${membershipType.id}`);

	const editForm = $derived(updateMembershipType.for(membershipType.id));

	// Initialize form fields when component mounts
	$effect(() => {
		untrack(() => {
			editForm.fields.set({
				id: membershipType.id,
				nameFi: membershipType.name.fi,
				nameEn: membershipType.name.en,
				descriptionFi: membershipType.description?.fi ?? "",
				descriptionEn: membershipType.description?.en ?? "",
			});
		});
	});
</script>

<form
	id={formId}
	{...editForm.preflight(updateMembershipTypeSchema).enhance(async ({ submit }) => {
		await submit();
		await invalidateAll();
		onClose();
	})}
	class="flex flex-1 flex-col gap-5 px-4"
>
	<input {...editForm.fields.id.as("hidden", membershipType.id)} />

	<!-- ID (read-only) -->
	<div class="space-y-2">
		<Label for={idInputId}>{$LL.admin.membershipTypes.id()}</Label>
		<Input id={idInputId} value={membershipType.id} disabled class="font-mono opacity-60" />
		<p class="text-sm text-muted-foreground">{$LL.admin.membershipTypes.idCannotChange()}</p>
	</div>

	<!-- Finnish name -->
	<div class="space-y-2">
		<Label for={nameFiInputId}>{$LL.admin.membershipTypes.nameFi()}</Label>
		<Input {...editForm.fields.nameFi.as("text")} id={nameFiInputId} />
		{#each editForm.fields.nameFi.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- English name -->
	<div class="space-y-2">
		<Label for={nameEnInputId}>{$LL.admin.membershipTypes.nameEn()}</Label>
		<Input {...editForm.fields.nameEn.as("text")} id={nameEnInputId} />
		{#each editForm.fields.nameEn.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- Finnish description (optional) -->
	<div class="space-y-2">
		<Label for={descriptionFiInputId}>{$LL.admin.membershipTypes.descriptionFi()}</Label>
		<textarea
			{...editForm.fields.descriptionFi.as("text")}
			id={descriptionFiInputId}
			rows={3}
			class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		></textarea>
		{#each editForm.fields.descriptionFi.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>

	<!-- English description (optional) -->
	<div class="space-y-2">
		<Label for={descriptionEnInputId}>{$LL.admin.membershipTypes.descriptionEn()}</Label>
		<textarea
			{...editForm.fields.descriptionEn.as("text")}
			id={descriptionEnInputId}
			rows={3}
			class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
		></textarea>
		{#each editForm.fields.descriptionEn.issues() as issue, i (i)}
			<p class="text-sm text-destructive">{issue.message}</p>
		{/each}
	</div>
</form>

<Sheet.Footer class="flex-col gap-3">
	<div class="flex w-full gap-3">
		<Button type="button" variant="outline" class="flex-1" onclick={onClose}>
			{$LL.common.cancel()}
		</Button>
		<Button type="submit" form={formId} disabled={!!editForm.pending} class="flex-1">
			{$LL.common.save()}
		</Button>
	</div>
	{#if membershipType.membershipCount === 0}
		{@const deleteForm = deleteMembershipType.for(membershipType.id)}
		<form
			{...deleteForm.preflight(deleteMembershipTypeSchema).enhance(async ({ submit }) => {
				await submit();
				if (deleteForm.result?.success === false) {
					toast.error($LL.common.deleteFailed());
					return;
				}
				await invalidateAll();
				onClose();
			})}
			class="w-full"
		>
			<input {...deleteForm.fields.id.as("hidden", membershipType.id)} />
			<Button
				type="submit"
				variant="outline"
				class="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
			>
				<Trash2 class="size-4" />
				{$LL.common.delete()}
			</Button>
		</form>
	{:else}
		<p class="text-center text-sm text-muted-foreground">{$LL.admin.membershipTypes.cannotDeleteInUse()}</p>
	{/if}
</Sheet.Footer>
