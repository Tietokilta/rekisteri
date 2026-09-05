<script lang="ts">
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import {
    deleteMembership,
    publishMembershipFeePeriod,
    selectApplicationTarget,
    updateMembership,
  } from "./data.remote";
  import { updateMembershipSchema, deleteMembershipSchema } from "./schema";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import { Badge } from "$lib/components/ui/badge";
  import { getStripePriceMetadata } from "$lib/api/stripe.remote";
  import { formatPrice } from "$lib/utils";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import type { MembershipType } from "$lib/server/db/schema";

  interface Membership {
    id: string;
    membershipTypeId: string;
    stripePriceId: string | null;
    startDate: string;
    endDate: string;
    startTime: Date;
    endTime: Date;
    publishedAt: Date | null;
    acceptsApplications: boolean;
    memberCount: number;
  }

  interface Props {
    membership: Membership;
    membershipTypes: MembershipType[];
    onClose: () => void;
  }

  let { membership, membershipTypes, onClose }: Props = $props();

  // Generate unique IDs for form elements
  const formId = $derived(`edit-membership-form-${membership.id}`);
  const membershipTypeInputId = $derived(`edit-membershipTypeId-${membership.id}`);
  const stripePriceInputId = $derived(`edit-stripePriceId-${membership.id}`);
  const startTimeInputId = $derived(`edit-startTime-${membership.id}`);
  const endTimeInputId = $derived(`edit-endTime-${membership.id}`);

  const editForm = $derived(updateMembership.for(membership.id));

  // Initialize form fields when component mounts
  $effect(() => {
    untrack(() => {
      editForm.fields.set({
        id: membership.id,
        membershipTypeId: membership.membershipTypeId,
        stripePriceId: membership.stripePriceId ?? "",
        startTime: membership.startDate,
        endTime: membership.endDate,
      });
    });
  });

  const selectedType = $derived(membershipTypes.find((type) => type.id === editForm.fields.membershipTypeId.value()));
  const isPayable = $derived(selectedType?.requiresPayment ?? true);
  const isPublished = $derived(membership.publishedAt !== null);
  const hasUnsavedChanges = $derived(
    editForm.fields.membershipTypeId.value() !== membership.membershipTypeId ||
      (editForm.fields.stripePriceId.value() || null) !== membership.stripePriceId ||
      editForm.fields.startTime.value() !== membership.startDate ||
      editForm.fields.endTime.value() !== membership.endDate,
  );
  let lifecycleActionLoading = $state(false);

  async function publishPeriod() {
    lifecycleActionLoading = true;
    try {
      await publishMembershipFeePeriod({ id: membership.id });
      onClose();
      await invalidateAll();
    } finally {
      lifecycleActionLoading = false;
    }
  }

  async function makeApplicationTarget() {
    lifecycleActionLoading = true;
    try {
      await selectApplicationTarget({ id: membership.id });
      onClose();
      await invalidateAll();
    } finally {
      lifecycleActionLoading = false;
    }
  }

  // A non-paying type must not retain a Stripe Price.
  $effect(() => {
    if (!isPayable && !isPublished) {
      untrack(() => {
        editForm.fields.stripePriceId.set("");
      });
    }
  });

  // State for Stripe metadata
  let stripeMetadata = $state<{
    priceId: string;
    priceCents: number;
    currency: string;
    nickname: string | null;
    productId: string;
    productName: string | null;
    active: boolean;
  } | null>(null);
  let fetchingMetadata = $state(false);
  let metadataError = $state<string | null>(null);

  // Fetch Stripe metadata when stripePriceId changes
  $effect(() => {
    const priceId = editForm.fields.stripePriceId.value();

    if (!priceId || !priceId.startsWith("price_")) {
      stripeMetadata = null;
      metadataError = null;
      return;
    }

    // Debounce the fetch
    const timeoutId = setTimeout(async () => {
      fetchingMetadata = true;
      metadataError = null;

      try {
        const metadata = await getStripePriceMetadata(priceId);
        stripeMetadata = metadata;
      } catch (err) {
        console.error("Failed to fetch Stripe metadata:", err);
        metadataError = "Failed to fetch price information";
        stripeMetadata = null;
      } finally {
        fetchingMetadata = false;
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  });
</script>

<form
  id={formId}
  {...editForm.preflight(updateMembershipSchema).enhance(async ({ submit }) => {
    await submit();
    await invalidateAll();
    onClose();
  })}
  class="flex flex-1 flex-col gap-5 px-4"
>
  <input {...editForm.fields.id.as("hidden", membership.id)} />

  <!-- Membership Type -->
  <div class="space-y-2">
    <Label for={membershipTypeInputId}>{$LL.membership.type()}</Label>
    <NativeSelect.Root
      {...editForm.fields.membershipTypeId.as("select")}
      id={membershipTypeInputId}
      disabled={isPublished}
    >
      <NativeSelect.Option value="">{$LL.common.select()}</NativeSelect.Option>
      {#each membershipTypes as membershipType (membershipType.id)}
        <NativeSelect.Option value={membershipType.id}>
          {$locale === "fi" ? membershipType.name.fi : membershipType.name.en}
        </NativeSelect.Option>
      {/each}
    </NativeSelect.Root>
    <p class="text-sm text-muted-foreground">{$LL.membership.continuityNote()}</p>
    {#each editForm.fields.membershipTypeId.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  {#if isPayable}
    <!-- Stripe Price ID -->
    <div class="space-y-2">
      <Label for={stripePriceInputId}>{$LL.admin.memberships.stripePriceId()}</Label>
      <Input
        {...editForm.fields.stripePriceId.as("text")}
        id={stripePriceInputId}
        placeholder="price_xxx"
        class="font-mono"
        disabled={isPublished}
      />
      <p class="text-sm text-muted-foreground">{$LL.admin.memberships.stripePriceIdDescription()}</p>

      {#if fetchingMetadata}
        <div
          class="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
        >
          <div class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
          {$LL.admin.memberships.fetchingStripeMetadata()}
        </div>
      {:else if metadataError}
        <div class="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {metadataError}
        </div>
      {:else if stripeMetadata}
        <div class="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <p class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {$LL.admin.memberships.stripeMetadataPreview()}
          </p>
          <div class="space-y-1 text-sm">
            {#if stripeMetadata.productName}
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$LL.admin.memberships.productName()}</span>
                <span class="font-medium">{stripeMetadata.productName}</span>
              </div>
            {/if}
            {#if stripeMetadata.nickname}
              <div class="flex justify-between">
                <span class="text-muted-foreground">{$LL.admin.memberships.priceNickname()}</span>
                <span class="font-medium">{stripeMetadata.nickname}</span>
              </div>
            {/if}
            <div class="flex justify-between">
              <span class="text-muted-foreground">{$LL.admin.memberships.amount()}</span>
              <span class="font-semibold"
                >{formatPrice(stripeMetadata.priceCents, stripeMetadata.currency, $locale)}</span
              >
            </div>
            {#if !stripeMetadata.active}
              <div class="mt-2 flex items-center gap-2 text-destructive">
                <Badge variant="destructive">{$LL.admin.memberships.priceInactive()}</Badge>
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#each editForm.fields.stripePriceId.issues() as issue, i (i)}
        <p class="text-sm text-destructive">{issue.message}</p>
      {/each}
    </div>
  {/if}

  <div class="grid grid-cols-2 gap-4">
    <div class="space-y-2">
      <Label for={startTimeInputId}>{$LL.membership.startTime()}</Label>
      <Input {...editForm.fields.startTime.as("date")} id={startTimeInputId} disabled={isPublished} />
    </div>
    <div class="space-y-2">
      <Label for={endTimeInputId}>{$LL.membership.endTime()}</Label>
      <Input {...editForm.fields.endTime.as("date")} id={endTimeInputId} disabled={isPublished} />
    </div>
  </div>
</form>

<Sheet.Footer class="flex-col gap-3">
  <div class="flex w-full gap-3">
    <Button type="button" variant="outline" class="flex-1" onclick={onClose}>
      {$LL.common.cancel()}
    </Button>
    {#if !isPublished}
      <Button type="submit" form={formId} disabled={!!editForm.pending} class="flex-1">
        {$LL.common.save()}
      </Button>
    {:else if !membership.acceptsApplications}
      <Button type="button" class="flex-1" disabled={lifecycleActionLoading} onclick={makeApplicationTarget}>
        {$LL.admin.memberships.selectApplicationTarget()}
      </Button>
    {/if}
  </div>
  {#if !isPublished}
    <Button
      type="button"
      class="w-full"
      disabled={lifecycleActionLoading || hasUnsavedChanges || (isPayable && !membership.stripePriceId)}
      onclick={publishPeriod}
    >
      {$LL.admin.memberships.publish()}
    </Button>
    {#if hasUnsavedChanges}
      <p class="text-center text-sm text-muted-foreground">{$LL.admin.memberships.saveBeforePublishing()}</p>
    {/if}
  {/if}
  {#if !isPublished && membership.memberCount === 0}
    {@const deleteForm = deleteMembership.for(membership.id)}
    <form
      {...deleteForm.preflight(deleteMembershipSchema).enhance(async ({ submit }) => {
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
      <input {...deleteForm.fields.id.as("hidden", membership.id)} />
      {#each deleteForm.fields.allIssues() as issue, i (i)}
        <p class="text-sm text-destructive">{issue.message}</p>
      {/each}
      <Button
        type="submit"
        variant="outline"
        class="w-full text-destructive hover:bg-destructive/10 hover:text-destructive"
        disabled={!!deleteForm.pending}
      >
        <Trash2 class="size-4" />
        {$LL.common.delete()}
      </Button>
    </form>
  {/if}
</Sheet.Footer>
