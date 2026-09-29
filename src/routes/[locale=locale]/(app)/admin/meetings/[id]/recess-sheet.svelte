<script lang="ts">
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDateTime } from "$lib/utils";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import * as NativeSelect from "$lib/components/ui/native-select";
  import * as Sheet from "$lib/components/ui/sheet";
  import type { PageData } from "./$types";
  import { editRecess } from "../data.remote";
  import { editRecessSchema } from "../schema";
  import LocalDatetimeInput from "../local-datetime-input.svelte";
  import { remoteErrorMessage } from "./types";

  let {
    open = $bindable(false),
    recessId,
    data,
  }: {
    open: boolean;
    recessId: string | null;
    data: PageData;
  } = $props();

  const recess = $derived(data.recesses.find((item) => item.id === recessId));
  const history = $derived(data.recessCorrections.filter((row) => row.targetId === recessId));
  const editForm = $derived(editRecess.for(recessId ?? "none"));

  $effect(() => {
    if (!open) return;
    const current = recess;
    untrack(() => {
      if (!current) return;
      editForm.fields.set({
        meetingId: data.meeting.id,
        recessId: current.id,
        mode: current.mode,
        startedAt: new Date(current.startedAt).toISOString(),
        endedAt: current.endedAt ? new Date(current.endedAt).toISOString() : "",
        cancelled: current.cancelledAt ? "true" : "false",
        reason: "",
      });
    });
  });

  function modeName(mode: string) {
    return mode === "track_exits" ? $LL.admin.meetings.shortRecess() : $LL.admin.meetings.longRecess();
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content class="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
    <Sheet.Header>
      <Sheet.Title>{$LL.admin.meetings.editRecess()}</Sheet.Title>
      <Sheet.Description>{$LL.admin.meetings.recessGuidance()}</Sheet.Description>
    </Sheet.Header>
    {#if recess}
      <form
        {...editForm.preflight(editRecessSchema).enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (cause) {
            toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
            return;
          }
          if (editForm.result?.success === false) {
            toast.error(editForm.result.message);
            return;
          }
          toast.success($LL.admin.meetings.saveRecess());
          open = false;
          await invalidateAll();
        })}
        class="space-y-4 px-4"
      >
        <input {...editForm.fields.meetingId.as("hidden", data.meeting.id)} />
        <input {...editForm.fields.recessId.as("hidden", recess.id)} />
        <div class="space-y-2">
          <Label for="recess-mode">{$LL.admin.meetings.recessMode()}</Label>
          <NativeSelect.Root {...editForm.fields.mode.as("select")} id="recess-mode">
            <NativeSelect.Option value="track_exits">{$LL.admin.meetings.shortRecess()}</NativeSelect.Option>
            <NativeSelect.Option value="reset_all">{$LL.admin.meetings.longRecess()}</NativeSelect.Option>
          </NativeSelect.Root>
        </div>
        <div class="space-y-2">
          <Label for="recess-start">{$LL.admin.meetings.recessStart()}</Label>
          <LocalDatetimeInput field={editForm.fields.startedAt} id="recess-start" required />
        </div>
        <div class="space-y-2">
          <Label for="recess-end">{$LL.admin.meetings.recessEnd()}</Label>
          <LocalDatetimeInput field={editForm.fields.endedAt} id="recess-end" />
        </div>
        <div class="space-y-2">
          <Label for="recess-reason">{$LL.admin.meetings.correctionReason()}</Label>
          <Input {...editForm.fields.reason.as("text")} id="recess-reason" required maxlength={500} />
          {#each editForm.fields.reason.issues() as issue, i (i)}
            <p class="text-sm text-destructive">{issue.message}</p>
          {/each}
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            {...editForm.fields.cancelled.as("submit", recess.cancelledAt ? "true" : "false")}
            disabled={!!editForm.pending}
          >
            {$LL.admin.meetings.saveRecess()}
          </Button>
          <Button
            {...editForm.fields.cancelled.as("submit", recess.cancelledAt ? "false" : "true")}
            variant="outline"
            disabled={!!editForm.pending}
          >
            {recess.cancelledAt ? $LL.admin.meetings.restoreRecess() : $LL.admin.meetings.cancelRecess()}
          </Button>
        </div>
      </form>
      {#if history.length}
        <div class="space-y-1 px-4 text-sm">
          <p class="font-medium">{$LL.admin.meetings.recessCorrectionHistory()}</p>
          <ul class="space-y-1 text-muted-foreground">
            {#each history as row (row.id)}
              {@const meta = row.metadata as {
                after?: { mode: string; startedAt: string; endedAt: string | null; cancelled: boolean };
                reason?: string;
              }}
              <li>
                {formatDateTime(new Date(row.createdAt), $locale)}
                {#if meta.after}
                  · {modeName(meta.after.mode)} · {formatDateTime(new Date(meta.after.startedAt), $locale)} → {meta
                    .after.endedAt
                    ? formatDateTime(new Date(meta.after.endedAt), $locale)
                    : $LL.admin.meetings.ongoing()}{meta.after.cancelled
                    ? ` · ${$LL.admin.meetings.recessCancelled()}`
                    : ""}
                {/if}
                {#if meta.reason}· {meta.reason}{/if}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {/if}
  </Sheet.Content>
</Sheet.Root>
