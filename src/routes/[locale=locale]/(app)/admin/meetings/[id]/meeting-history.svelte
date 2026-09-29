<script lang="ts">
  import type { PageData } from "./$types";
  import { locale, LL } from "$lib/i18n/i18n-svelte";
  import { formatShortDateTime } from "$lib/utils";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Table from "$lib/components/ui/table";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Redo2 from "@lucide/svelte/icons/redo-2";
  import type { CorrectionTarget } from "./types";

  let {
    data,
    latestUndoableId,
    latestRestorableId,
    correct,
    openCorrection,
    openRecess,
    openTimes,
  }: {
    data: PageData;
    latestUndoableId: string | undefined;
    latestRestorableId: string | undefined;
    correct: (eventId: string, operation: "void" | "restore", reason: string) => Promise<void>;
    openCorrection: (target: CorrectionTarget) => void;
    openRecess: (id: string) => void;
    openTimes: () => void;
  } = $props();

  const attendeeName = $derived(new Map(data.attendees.map((person) => [person.id, person.displayName])));
  const attendanceEffects = $derived(new Map(data.projectedEvents.map((event) => [event.id, event.effectiveAt])));
  const correctedEventIds = $derived(new Set(data.corrections.map((correction) => correction.eventId)));

  function modeName(mode: "track_exits" | "reset_all") {
    return mode === "track_exits" ? $LL.admin.meetings.shortRecess() : $LL.admin.meetings.longRecess();
  }

  type LogEntry = { key: string; at: Date } & (
    | { kind: "attendance"; event: (typeof data.resolvedEvents)[number] }
    | { kind: "recess_start" | "recess_end"; recess: (typeof data.recesses)[number] }
    | { kind: "meeting_start" | "meeting_close" }
  );
  const log = $derived.by((): LogEntry[] => {
    const entries: LogEntry[] = data.resolvedEvents.map((event) => ({
      key: `event:${event.id}`,
      at: new Date(event.effectiveAt),
      kind: "attendance",
      event,
    }));
    for (const recess of data.recesses) {
      entries.push({ key: `recess-start:${recess.id}`, at: new Date(recess.startedAt), kind: "recess_start", recess });
      if (recess.endedAt) {
        entries.push({ key: `recess-end:${recess.id}`, at: new Date(recess.endedAt), kind: "recess_end", recess });
      }
    }
    if (data.meeting.startsAt) {
      entries.push({ key: "meeting-start", at: new Date(data.meeting.startsAt), kind: "meeting_start" });
    }
    if (data.meeting.closedAt) {
      entries.push({ key: "meeting-close", at: new Date(data.meeting.closedAt), kind: "meeting_close" });
    }
    return entries.toSorted((a, b) => b.at.getTime() - a.at.getTime() || a.key.localeCompare(b.key));
  });
</script>

<section class="space-y-3">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <h2 class="text-xl font-semibold">{$LL.admin.meetings.history()}</h2>
    {#if data.canWrite}
      <div class="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={!latestUndoableId}
          onclick={() => latestUndoableId && correct(latestUndoableId, "void", "Undo")}
        >
          <Undo2 />
          {$LL.admin.meetings.undoLast()}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!latestRestorableId}
          onclick={() => latestRestorableId && correct(latestRestorableId, "restore", "Redo")}
        >
          <Redo2 />
          {$LL.admin.meetings.redoLast()}
        </Button>
        {#if data.attendees.length}
          <Button size="sm" variant="outline" onclick={() => openCorrection({ kind: "add" })}>
            {$LL.admin.meetings.addMissedAction()}
          </Button>
        {/if}
      </div>
    {/if}
  </div>
  <div class="rounded-lg border contain-inline-size">
    <Table.Root>
      <Table.Body>
        {#each log as entry (entry.key)}
          <Table.Row
            class={entry.kind === "attendance" && entry.event.voided ? "opacity-60" : ""}
            data-testid="log-row"
          >
            <Table.Cell class="w-28 align-top text-muted-foreground tabular-nums">
              {formatShortDateTime(new Date(entry.at), $locale)}
            </Table.Cell>
            <Table.Cell class="align-top">
              {#if entry.kind === "attendance"}
                {@const event = entry.event}
                <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>
                    <strong>{attendeeName.get(event.attendeeId)}</strong>
                    {event.direction === "in"
                      ? $LL.admin.meetings.entered().toLowerCase()
                      : $LL.admin.meetings.left().toLowerCase()}
                  </span>
                  <span class="text-xs text-muted-foreground">
                    {event.source === "manual"
                      ? $LL.admin.meetings.sourceManual()
                      : event.source === "scan"
                        ? $LL.admin.meetings.sourceScan()
                        : $LL.admin.meetings.sourceCorrection()}
                  </span>
                  {#if event.voided}
                    <Badge variant="outline">{$LL.admin.meetings.voidedAction()}</Badge>
                  {:else if correctedEventIds.has(event.id)}
                    <Badge variant="outline">{$LL.admin.meetings.corrected()}</Badge>
                  {/if}
                  {#if !event.voided && (event.recessId || !data.meeting.startsAt || event.effectiveAt < data.meeting.startsAt)}
                    <Badge variant="secondary">
                      {attendanceEffects.has(event.id)
                        ? $LL.admin.meetings.attendanceEffectiveAt({
                            time: formatShortDateTime(
                              new Date(attendanceEffects.get(event.id) ?? event.effectiveAt),
                              $locale,
                            ),
                          })
                        : $LL.admin.meetings.noAttendanceEffect()}
                    </Badge>
                  {/if}
                </div>
                {#if event.note}
                  <p class="text-xs text-muted-foreground">{event.note}</p>
                {/if}
                {#each data.warnings.filter((warning) => warning.eventId === event.id) as warning (warning.code)}
                  <p class="text-xs font-medium text-destructive">
                    {warning.code === "duplicate_in"
                      ? $LL.admin.meetings.duplicateIn()
                      : $LL.admin.meetings.outWithoutIn()}
                  </p>
                {/each}
              {:else if entry.kind === "recess_start"}
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium"
                    >{$LL.admin.meetings.recessStartedLog({ mode: modeName(entry.recess.mode) })}</span
                  >
                  {#if entry.recess.cancelledAt}
                    <Badge variant="outline">{$LL.admin.meetings.recessCancelled()}</Badge>
                  {/if}
                </div>
              {:else if entry.kind === "recess_end"}
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-medium">{$LL.admin.meetings.recessEndedLog()}</span>
                  {#if entry.recess.cancelledAt}
                    <Badge variant="outline">{$LL.admin.meetings.recessCancelled()}</Badge>
                  {/if}
                </div>
              {:else if entry.kind === "meeting_start"}
                <span class="font-medium">{$LL.admin.meetings.meetingStartedLog()}</span>
              {:else}
                <span class="font-medium">{$LL.admin.meetings.meetingClosedLog()}</span>
              {/if}
            </Table.Cell>
            <Table.Cell class="w-0 align-top whitespace-nowrap">
              {#if data.canWrite}
                {#if entry.kind === "attendance"}
                  <div class="flex flex-col items-end gap-1 sm:flex-row sm:justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() => openCorrection({ kind: "edit", eventId: entry.event.id })}
                    >
                      {$LL.admin.meetings.correctAction()}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onclick={() =>
                        correct(
                          entry.event.id,
                          entry.event.voided ? "restore" : "void",
                          entry.event.voided ? "Redo" : "Undo",
                        )}
                    >
                      {entry.event.voided ? $LL.admin.meetings.redoAction() : $LL.admin.meetings.undoAction()}
                    </Button>
                  </div>
                {:else if entry.kind === "recess_start" || entry.kind === "recess_end"}
                  <Button size="sm" variant="ghost" onclick={() => openRecess(entry.recess.id)}>
                    {$LL.admin.meetings.editRecess()}
                  </Button>
                {:else}
                  <Button size="sm" variant="ghost" onclick={openTimes}>
                    {$LL.admin.meetings.editTimes()}
                  </Button>
                {/if}
              {/if}
            </Table.Cell>
          </Table.Row>
        {/each}
      </Table.Body>
    </Table.Root>
  </div>
</section>
