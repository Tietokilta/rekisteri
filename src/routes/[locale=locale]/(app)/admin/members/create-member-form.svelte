<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDateRange as formatDateRangeUtil } from "$lib/utils";
  import { createMember } from "./data.remote";
  import { Input } from "$lib/components/ui/input";
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import type { LocalizedString } from "$lib/server/db/schema";

  interface AvailableMembership {
    id: string;
    membershipTypeId: string;
    membershipTypeName: LocalizedString | null;
    startTime: Date;
    endTime: Date;
  }

  interface Props {
    availableMemberships: AvailableMembership[];
    onClose: () => void;
  }

  let { availableMemberships, onClose }: Props = $props();

  // Form state
  let memberType = $state<"person" | "association">("person");
  let membershipId = $state("");
  let status = $state<"awaiting_approval" | "active">("awaiting_approval");
  let description = $state("");
  let submitting = $state(false);

  // Person fields
  let email = $state("");
  let firstNames = $state("");
  let lastName = $state("");
  let homeMunicipality = $state("");

  // Association fields
  let organizationName = $state("");

  function getLocalizedName(name: LocalizedString | null): string {
    if (!name) return "-";
    return $locale === "fi" ? name.fi : name.en;
  }

  function formatDateRange(m: AvailableMembership): string {
    return formatDateRangeUtil(m.startTime, m.endTime, $locale);
  }

  // Group memberships by type for the select dropdown
  const groupedMemberships = $derived.by(() => {
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- rebuilt from scratch each derivation, no reactive mutations
    const groups = new Map<string, { typeName: string; memberships: AvailableMembership[] }>();
    for (const m of availableMemberships) {
      const existing = groups.get(m.membershipTypeId);
      if (existing) {
        existing.memberships.push(m);
      } else {
        groups.set(m.membershipTypeId, {
          typeName: getLocalizedName(m.membershipTypeName),
          memberships: [m],
        });
      }
    }
    return [...groups.values()];
  });

  async function handleSubmit() {
    if (!membershipId) return;
    submitting = true;

    try {
      await createMember(
        memberType === "association"
          ? {
              type: "association",
              organizationName,
              membershipId,
              status,
              description: description || undefined,
            }
          : {
              type: "person",
              email,
              firstNames: firstNames || undefined,
              lastName: lastName || undefined,
              homeMunicipality: homeMunicipality || undefined,
              membershipId,
              status,
              description: description || undefined,
            },
      );

      toast.success($LL.admin.members.memberCreated());
      onClose();
      await invalidateAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message);
    } finally {
      submitting = false;
    }
  }
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    handleSubmit();
  }}
  class="flex flex-1 flex-col gap-5 px-4"
>
  <!-- Member type toggle -->
  <div class="space-y-2">
    <Label>{$LL.admin.members.memberType()}</Label>
    <div class="flex gap-2">
      <Button
        type="button"
        variant={memberType === "person" ? "default" : "outline"}
        size="sm"
        data-testid="member-type-person"
        onclick={() => (memberType = "person")}
      >
        {$LL.admin.members.person()}
      </Button>
      <Button
        type="button"
        variant={memberType === "association" ? "default" : "outline"}
        size="sm"
        data-testid="member-type-association"
        onclick={() => (memberType = "association")}
      >
        {$LL.admin.members.association()}
      </Button>
    </div>
  </div>

  {#if memberType === "person"}
    <!-- Email (required) -->
    <div class="space-y-2">
      <Label for="create-member-email">{$LL.user.email()}</Label>
      <Input id="create-member-email" type="email" bind:value={email} required />
    </div>

    <!-- First names -->
    <div class="space-y-2">
      <Label for="create-member-firstNames"
        >{$LL.user.firstNames()} <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span></Label
      >
      <Input id="create-member-firstNames" bind:value={firstNames} />
    </div>

    <!-- Last name -->
    <div class="space-y-2">
      <Label for="create-member-lastName"
        >{$LL.user.lastName()} <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span></Label
      >
      <Input id="create-member-lastName" bind:value={lastName} />
    </div>

    <!-- Home municipality -->
    <div class="space-y-2">
      <Label for="create-member-municipality"
        >{$LL.user.homeMunicipality()}
        <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span></Label
      >
      <Input id="create-member-municipality" bind:value={homeMunicipality} />
    </div>
  {:else}
    <!-- Organization name (required) -->
    <div class="space-y-2">
      <Label for="create-member-orgName">{$LL.admin.members.organizationName()}</Label>
      <Input id="create-member-orgName" bind:value={organizationName} required />
    </div>
  {/if}

  <!-- Membership selection -->
  <div class="space-y-2">
    <Label for="create-member-membership">{$LL.admin.members.selectMembership()}</Label>
    <NativeSelect.Root id="create-member-membership" bind:value={membershipId} required>
      <NativeSelect.Option value="" disabled>{$LL.admin.members.selectMembership()}</NativeSelect.Option>
      {#each groupedMemberships as group (group.typeName)}
        <NativeSelect.OptGroup label={group.typeName}>
          {#each group.memberships as membership (membership.id)}
            <NativeSelect.Option value={membership.id}>{formatDateRange(membership)}</NativeSelect.Option>
          {/each}
        </NativeSelect.OptGroup>
      {/each}
    </NativeSelect.Root>
  </div>

  <!-- Initial status -->
  <div class="space-y-2">
    <Label for="create-member-status">{$LL.admin.members.initialStatus()}</Label>
    <NativeSelect.Root id="create-member-status" bind:value={status}>
      <NativeSelect.Option value="awaiting_approval">{$LL.admin.members.table.awaitingApproval()}</NativeSelect.Option>
      <NativeSelect.Option value="active">{$LL.admin.members.table.active()}</NativeSelect.Option>
    </NativeSelect.Root>
    <p class="text-sm text-muted-foreground">{$LL.admin.members.initialStatusDescription()}</p>
  </div>

  <!-- Description (optional) -->
  <div class="space-y-2">
    <Label for="create-member-description"
      >{$LL.membership.description()}
      <span class="font-normal text-muted-foreground">({$LL.common.optional()})</span></Label
    >
    <Textarea id="create-member-description" bind:value={description} rows={2} />
  </div>

  <Sheet.Footer>
    <Button type="button" variant="outline" class="flex-1" onclick={onClose}>
      {$LL.common.cancel()}
    </Button>
    <Button type="submit" class="flex-1" disabled={submitting}>
      {$LL.common.create()}
    </Button>
  </Sheet.Footer>
</form>
