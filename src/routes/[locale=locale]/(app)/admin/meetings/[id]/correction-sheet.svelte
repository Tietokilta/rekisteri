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
  import { addMissedAction, correctEvent } from "../data.remote";
  import { addMissedActionSchema, correctEventSchema } from "../schema";
  import LocalDatetimeInput from "../local-datetime-input.svelte";
  import { remoteErrorMessage, type CorrectionTarget } from "./types";

  let {
    open = $bindable(false),
    target,
    data,
  }: {
    open: boolean;
    target: CorrectionTarget | null;
    data: PageData;
  } = $props();

  const event = $derived(
    target?.kind === "edit" ? data.resolvedEvents.find((item) => item.id === target.eventId) : undefined,
  );
  const original = $derived(event ? data.events.find((item) => item.id === event.id) : undefined);
  const revisions = $derived(
    event
      ? data.corrections
          .filter((correction) => correction.eventId === event.id)
          .toSorted((a, b) => a.revision - b.revision)
      : [],
  );
  const editForm = $derived(correctEvent.for(event?.id ?? "none"));
  const addForm = $derived(addMissedAction.for(target?.kind === "add" ? (target.attendeeId ?? "any") : "none"));

  // Populate the form instance each time the sheet is opened for a target.
  $effect(() => {
    if (!open) return;
    const current = target;
    untrack(() => {
      if (current?.kind === "edit" && event) {
        editForm.fields.set({
          meetingId: data.meeting.id,
          eventId: event.id,
          operation: "replace",
          attendeeId: event.attendeeId,
          direction: event.direction,
          effectiveAt: new Date(event.effectiveAt).toISOString(),
          reason: "",
        });
      } else if (current?.kind === "add") {
        addForm.fields.set({
          meetingId: data.meeting.id,
          attendeeId: current.attendeeId ?? data.attendees[0]?.id ?? "",
          direction: "in",
          effectiveAt: new Date().toISOString(),
          note: "",
        });
      }
    });
  });

  function afterSubmit(result: { success: boolean; message?: string } | undefined) {
    return async () => {
      if (result?.success === false) {
        toast.error(result.message ?? $LL.error.updateFailed());
        return;
      }
      toast.success($LL.admin.meetings.saveCorrection());
      open = false;
      await invalidateAll();
    };
  }
</script>

<Sheet.Root bind:open>
  <Sheet.Content class="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
    <Sheet.Header>
      <Sheet.Title>
        {target?.kind === "edit" ? $LL.admin.meetings.correctAction() : $LL.admin.meetings.correction()}
      </Sheet.Title>
      {#if original}
        <Sheet.Description>
          {$LL.admin.meetings.originalAction()}: {formatDateTime(new Date(original.effectiveAt), $locale)} · {original.direction ===
          "in"
            ? $LL.admin.meetings.entered()
            : $LL.admin.meetings.left()}
        </Sheet.Description>
      {/if}
    </Sheet.Header>

    {#if target?.kind === "edit" && event}
      <form
        {...editForm.preflight(correctEventSchema).enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (cause) {
            toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
            return;
          }
          await afterSubmit(editForm.result)();
        })}
        class="space-y-4 px-4"
      >
        <input {...editForm.fields.meetingId.as("hidden", data.meeting.id)} />
        <input {...editForm.fields.eventId.as("hidden", event.id)} />
        <div class="space-y-2">
          <Label for="correction-person">{$LL.admin.meetings.person()}</Label>
          <NativeSelect.Root {...editForm.fields.attendeeId.as("select")} id="correction-person" required>
            {#each data.attendees as person (person.id)}
              <NativeSelect.Option value={person.id}>{person.displayName}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>
        <div class="space-y-2">
          <Label for="correction-direction">{$LL.admin.meetings.direction()}</Label>
          <NativeSelect.Root {...editForm.fields.direction.as("select")} id="correction-direction">
            <NativeSelect.Option value="in">{$LL.admin.meetings.entered()}</NativeSelect.Option>
            <NativeSelect.Option value="out">{$LL.admin.meetings.left()}</NativeSelect.Option>
          </NativeSelect.Root>
        </div>
        <div class="space-y-2">
          <Label for="correction-time">{$LL.admin.meetings.effectiveTime()}</Label>
          <LocalDatetimeInput field={editForm.fields.effectiveAt} id="correction-time" required />
        </div>
        <div class="space-y-2">
          <Label for="correction-reason">{$LL.admin.meetings.correctionReason()}</Label>
          <Input {...editForm.fields.reason.as("text")} id="correction-reason" required maxlength={500} />
          {#each editForm.fields.reason.issues() as issue, i (i)}
            <p class="text-sm text-destructive">{issue.message}</p>
          {/each}
        </div>
        <div class="flex flex-wrap gap-2">
          <Button {...editForm.fields.operation.as("submit", "replace")} disabled={!!editForm.pending}>
            {$LL.admin.meetings.saveCorrection()}
          </Button>
          <Button
            {...editForm.fields.operation.as("submit", event.voided ? "restore" : "void")}
            variant="outline"
            disabled={!!editForm.pending}
          >
            {event.voided ? $LL.admin.meetings.redoAction() : $LL.admin.meetings.undoAction()}
          </Button>
        </div>
      </form>
      {#if revisions.length}
        <div class="space-y-1 px-4 text-sm">
          <p class="font-medium">{$LL.admin.meetings.correctionHistory()}</p>
          <ul class="space-y-1 text-muted-foreground">
            {#each revisions as correction (correction.id)}
              <li>
                #{correction.revision} · {formatDateTime(new Date(correction.recordedAt), $locale)} · {correction.voided
                  ? $LL.admin.meetings.voidedAction()
                  : correction.direction === "in"
                    ? $LL.admin.meetings.entered()
                    : $LL.admin.meetings.left()} · {correction.reason}
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    {:else if target?.kind === "add"}
      <form
        {...addForm.preflight(addMissedActionSchema).enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (cause) {
            toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
            return;
          }
          await afterSubmit(addForm.result)();
        })}
        class="space-y-4 px-4"
      >
        <input {...addForm.fields.meetingId.as("hidden", data.meeting.id)} />
        <div class="space-y-2">
          <Label for="add-person">{$LL.admin.meetings.person()}</Label>
          <NativeSelect.Root {...addForm.fields.attendeeId.as("select")} id="add-person" required>
            {#each data.attendees as person (person.id)}
              <NativeSelect.Option value={person.id}>{person.displayName}</NativeSelect.Option>
            {/each}
          </NativeSelect.Root>
        </div>
        <div class="space-y-2">
          <Label for="add-direction">{$LL.admin.meetings.direction()}</Label>
          <NativeSelect.Root {...addForm.fields.direction.as("select")} id="add-direction">
            <NativeSelect.Option value="in">{$LL.admin.meetings.entered()}</NativeSelect.Option>
            <NativeSelect.Option value="out">{$LL.admin.meetings.left()}</NativeSelect.Option>
          </NativeSelect.Root>
        </div>
        <div class="space-y-2">
          <Label for="add-time">{$LL.admin.meetings.effectiveTime()}</Label>
          <LocalDatetimeInput field={addForm.fields.effectiveAt} id="add-time" required />
        </div>
        <div class="space-y-2">
          <Label for="add-reason">{$LL.admin.meetings.correctionReason()}</Label>
          <Input {...addForm.fields.note.as("text")} id="add-reason" required maxlength={500} />
          {#each addForm.fields.note.issues() as issue, i (i)}
            <p class="text-sm text-destructive">{issue.message}</p>
          {/each}
        </div>
        <Button type="submit" disabled={!!addForm.pending}>{$LL.admin.meetings.saveCorrection()}</Button>
      </form>
    {/if}
  </Sheet.Content>
</Sheet.Root>
