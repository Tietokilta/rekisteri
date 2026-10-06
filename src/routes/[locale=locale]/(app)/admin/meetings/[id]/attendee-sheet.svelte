<script lang="ts">
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { matchesSearchTokens } from "$lib/utils";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as Sheet from "$lib/components/ui/sheet";
  import { updateAttendee } from "../data.remote";
  import type { Registry } from "./registry.svelte";
  import { remoteErrorMessage, type AttendeeRow } from "./types";

  let {
    open = $bindable(false),
    attendee,
    attendees,
    registry,
    meetingId,
    typeName,
  }: {
    open: boolean;
    attendee: AttendeeRow | null;
    attendees: AttendeeRow[];
    registry: Registry;
    meetingId: string;
    typeName: (id: string | null) => string;
  } = $props();

  // Each opening starts from the attendee's current identity; edits then override these
  let query = $derived(open ? untrack(() => attendee?.displayName ?? "") : "");
  let selectedUserId = $derived(open ? untrack(() => attendee?.userId ?? null) : null);
  let reason = $derived(open ? "" : "");
  const form = $derived(updateAttendee.for(attendee?.id ?? "none"));

  const trimmed = $derived(query.trim());
  const matches = $derived(
    trimmed.length < 2
      ? []
      : registry.users
          .filter((user) => matchesSearchTokens(trimmed, [user.firstNames, user.lastName, user.email]))
          .slice(0, 8),
  );
  const selectedUser = $derived(registry.users.find((user) => user.id === selectedUserId));
  const mergesWith = $derived(
    selectedUserId ? attendees.find((row) => row.userId === selectedUserId && row.id !== attendee?.id) : undefined,
  );
  const guestName = $derived(selectedUserId ? "" : trimmed);
  const unchanged = $derived(
    attendee !== null &&
      (selectedUserId ? selectedUserId === attendee.userId : !attendee.userId && guestName === attendee.displayName),
  );
  const canSave = $derived((selectedUserId || (guestName && !guestName.includes("@"))) && !unchanged && reason.trim());

  function fullName(user: { firstNames: string | null; lastName: string | null; email: string }) {
    return [user.firstNames, user.lastName].filter(Boolean).join(" ") || user.email;
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content class="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
    <Sheet.Header>
      <Sheet.Title>{$LL.admin.meetings.editAttendee()}</Sheet.Title>
      <Sheet.Description>{$LL.admin.meetings.editAttendeeDescription()}</Sheet.Description>
    </Sheet.Header>

    {#if attendee}
      <form
        {...form.enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (cause) {
            toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
            return;
          }
          if (form.result?.success === false) {
            toast.error(form.result.message);
            return;
          }
          toast.success($LL.admin.meetings.attendeeUpdated());
          open = false;
          await invalidateAll();
        })}
        class="space-y-4 px-4"
        data-testid="attendee-sheet"
      >
        <input {...form.fields.meetingId.as("hidden", meetingId)} />
        <input {...form.fields.attendeeId.as("hidden", attendee.id)} />
        <input {...form.fields.userId.as("hidden", selectedUserId ?? "")} />
        <input {...form.fields.guestName.as("hidden", guestName)} />

        <div class="space-y-2">
          <Label for="attendee-name">{$LL.admin.meetings.attendeeNameOrMember()}</Label>
          <Input
            id="attendee-name"
            bind:value={query}
            oninput={() => (selectedUserId = null)}
            autocomplete="off"
            maxlength={200}
          />
          <ul class="divide-y rounded-md border" role="listbox" aria-label={$LL.admin.meetings.person()}>
            <li role="option" aria-selected={!selectedUserId}>
              <button
                type="button"
                class={[
                  "flex w-full items-center gap-2 border-l-4 px-3 py-2 text-left text-sm",
                  selectedUserId ? "border-l-transparent hover:bg-muted/50" : "border-l-primary bg-primary/10",
                ]}
                onclick={() => (selectedUserId = null)}
                disabled={!trimmed || trimmed.includes("@")}
              >
                <span class="min-w-0 flex-1 truncate">{trimmed || "…"}</span>
                <span class="text-xs text-muted-foreground">{$LL.admin.meetings.guest()}</span>
              </button>
            </li>
            {#each selectedUser && !matches.includes(selectedUser) ? [selectedUser, ...matches] : matches as user (user.id)}
              <li role="option" aria-selected={user.id === selectedUserId}>
                <button
                  type="button"
                  class={[
                    "flex w-full items-center gap-2 border-l-4 px-3 py-2 text-left text-sm",
                    user.id === selectedUserId
                      ? "border-l-primary bg-primary/10"
                      : "border-l-transparent hover:bg-muted/50",
                  ]}
                  onclick={() => (selectedUserId = user.id)}
                  data-testid="attendee-member-option"
                >
                  <span class="min-w-0 flex-1">
                    <span class="block truncate font-medium">{fullName(user)}</span>
                    <span class="block truncate text-xs text-muted-foreground">
                      {user.email} · {typeName(user.membershipTypeId)}
                    </span>
                  </span>
                </button>
              </li>
            {/each}
          </ul>
          {#if mergesWith}
            <p class="text-sm text-muted-foreground">
              {$LL.admin.meetings.attendeeMergeHint({ name: mergesWith.displayName })}
            </p>
          {/if}
          {#if registry.status === "error"}
            <p class="text-sm text-destructive">{$LL.admin.meetings.registryLoadFailed()}</p>
          {/if}
        </div>

        <div class="space-y-2">
          <Label for="attendee-reason">{$LL.admin.meetings.correctionReason()}</Label>
          <Input {...form.fields.reason.as("text")} bind:value={reason} id="attendee-reason" required maxlength={500} />
        </div>

        <Button type="submit" disabled={!canSave || !!form.pending}>{$LL.admin.meetings.saveCorrection()}</Button>
      </form>
    {/if}
  </Sheet.Content>
</Sheet.Root>
