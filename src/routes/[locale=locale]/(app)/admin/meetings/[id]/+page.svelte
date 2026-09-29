<script lang="ts">
  import type { PageData } from "./$types";
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDateTime, formatShortDateTime } from "$lib/utils";
  import * as AlertDialog from "$lib/components/ui/alert-dialog";
  import * as Alert from "$lib/components/ui/alert";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { Label } from "$lib/components/ui/label";
  import * as Sheet from "$lib/components/ui/sheet";
  import * as Table from "$lib/components/ui/table";
  import EllipsisVertical from "@lucide/svelte/icons/ellipsis-vertical";
  import CheckInSearch from "./check-in-search.svelte";
  import CorrectionSheet from "./correction-sheet.svelte";
  import AttendeeSheet from "./attendee-sheet.svelte";
  import MeetingHistory from "./meeting-history.svelte";
  import RecessSheet from "./recess-sheet.svelte";
  import LocalDatetimeInput from "../local-datetime-input.svelte";
  import {
    closeMeeting,
    endRecess,
    quickCorrectEvent,
    recordAttendance,
    reopenMeeting,
    startMeeting,
    startRecess,
    updateMeetingTimes,
  } from "../data.remote";
  import { updateMeetingTimesSchema } from "../schema";
  import { onMount } from "svelte";
  import { Registry } from "./registry.svelte";
  import { remoteErrorMessage, type AttendeeRow, type CorrectionTarget, type RecordTarget } from "./types";

  let { data }: { data: PageData } = $props();

  // Write access only: the endpoint is for operators, and read-only admins can't act on attendees
  const registry = new Registry(`${page.url.pathname.replace(/\/[^/]+$/, "")}/users`);
  onMount(() => {
    if (data.canWrite) void registry.load();
  });

  let filter = $state<"all" | "present" | "away" | "guests">("all");
  let correctionOpen = $state(false);
  let attendeeEditOpen = $state(false);
  let attendeeEditId = $state<string | null>(null);
  let correctionTarget = $state<CorrectionTarget | null>(null);
  let recessOpen = $state(false);
  let recessId = $state<string | null>(null);
  let timesOpen = $state(false);
  let closeDialogOpen = $state(false);
  let longRecessDialogOpen = $state(false);

  const activeRecess = $derived(data.recesses.find((recess) => !recess.endedAt && !recess.cancelledAt));
  const status = $derived(
    data.meeting.closedAt ? "closed" : activeRecess ? "recess" : data.meeting.startsAt ? "running" : "notStarted",
  );
  const canAct = $derived(data.canWrite && !data.meeting.closedAt);
  const present = $derived(new Set(data.present));
  const physicalPresent = $derived(new Set(data.physicalPresent));
  const attendeeName = $derived(new Map(data.attendees.map((person) => [person.id, person.displayName])));

  const lastActionAt = $derived.by(() => {
    const latest: Record<string, Date> = {};
    for (const event of data.resolvedEvents) {
      if (event.voided) continue;
      const at = new Date(event.effectiveAt);
      const previous = latest[event.attendeeId];
      if (!previous || at > previous) latest[event.attendeeId] = at;
    }
    return latest;
  });

  const rows = $derived.by((): AttendeeRow[] =>
    data.attendees
      .map((person) => ({
        id: person.id,
        userId: person.userId,
        displayName: person.displayName,
        isGuest: !person.userId,
        typeId: Object.hasOwn(data.membershipTypeByAttendee, person.id)
          ? (data.membershipTypeByAttendee[person.id] ?? null)
          : person.membershipTypeId,
        status: present.has(person.id)
          ? ("present" as const)
          : (activeRecess || !data.meeting.startsAt) && physicalPresent.has(person.id)
            ? ("pending" as const)
            : ("away" as const),
        physicalPresent: physicalPresent.has(person.id),
        lastActionAt: lastActionAt[person.id] ?? null,
        conflicts: data.warnings.filter((warning) => warning.attendeeId === person.id).length,
      }))
      .toSorted(
        (a, b) =>
          (b.lastActionAt?.getTime() ?? 0) - (a.lastActionAt?.getTime() ?? 0) ||
          a.displayName.localeCompare(b.displayName),
      ),
  );
  const filteredRows = $derived(
    rows.filter((row) =>
      filter === "present"
        ? row.status === "present"
        : filter === "away"
          ? row.status !== "present"
          : filter !== "guests" || !row.typeId,
    ),
  );
  const presentRows = $derived(rows.filter((row) => row.status === "present"));
  const memberCount = $derived(presentRows.filter((row) => row.typeId).length);
  const guestCount = $derived(presentRows.length - memberCount);

  const latestUndoable = $derived(
    data.resolvedEvents
      .filter((event) => !event.voided)
      .toSorted((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())[0],
  );
  const latestRestorable = $derived(
    data.corrections
      .filter((correction) => correction.voided)
      .toSorted((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
      .find((correction) => data.resolvedEvents.some((event) => event.id === correction.eventId && event.voided)),
  );

  const filters = $derived([
    ["all", $LL.admin.meetings.filterAll()],
    ["present", $LL.admin.meetings.filterPresent()],
    ["away", $LL.admin.meetings.filterAway()],
    ["guests", $LL.admin.meetings.filterGuests()],
  ] as const);

  function typeName(id: string | null) {
    if (!id) return $LL.admin.meetings.noMembership();
    return data.types.find((type) => type.id === id)?.name[$locale] ?? id;
  }

  function modeName(mode: "track_exits" | "reset_all") {
    return mode === "track_exits" ? $LL.admin.meetings.shortRecess() : $LL.admin.meetings.longRecess();
  }

  /** Runs a command, refreshes page data, and reports failures as toasts. Calls never abort each other. */
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    try {
      const result = await action();
      await invalidateAll();
      return result;
    } catch (cause) {
      toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
      return undefined;
    }
  }

  async function correct(eventId: string, operation: "void" | "restore", reason: string) {
    const result = await run(() => quickCorrectEvent({ meetingId: data.meeting.id, eventId, operation, reason }));
    if (result !== undefined) {
      toast.success(operation === "void" ? $LL.admin.meetings.undoDone() : $LL.admin.meetings.restoreDone());
    }
  }

  async function record(target: RecordTarget, direction: "in" | "out") {
    const result = await run(() =>
      recordAttendance({ meetingId: data.meeting.id, eventId: crypto.randomUUID(), direction, ...target }),
    );
    if (!result) return;
    const event = data.resolvedEvents.find((item) => item.id === result.eventId);
    const name = ("guestName" in target ? target.guestName : event && attendeeName.get(event.attendeeId)) ?? "";
    toast.success(
      direction === "in" ? $LL.admin.meetings.checkedIn({ name }) : $LL.admin.meetings.checkedOut({ name }),
      { action: { label: $LL.admin.meetings.undo(), onClick: () => correct(result.eventId, "void", "Undo") } },
    );
  }

  // Populate the times form each time its sheet opens.
  $effect(() => {
    if (!timesOpen) return;
    untrack(() =>
      updateMeetingTimes.fields.set({
        meetingId: data.meeting.id,
        scheduledStartsAt: data.meeting.scheduledStartsAt ? new Date(data.meeting.scheduledStartsAt).toISOString() : "",
        startsAt: data.meeting.startsAt ? new Date(data.meeting.startsAt).toISOString() : "",
      }),
    );
  });

  function handleUndoKey(event: KeyboardEvent) {
    if (!canAct || !(event.ctrlKey || event.metaKey) || event.altKey || event.key.toLowerCase() !== "z") return;
    if ((event.target as HTMLElement)?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (correctionOpen || attendeeEditOpen || recessOpen || timesOpen || closeDialogOpen || longRecessDialogOpen)
      return;
    const target = event.shiftKey ? latestRestorable?.eventId : latestUndoable?.id;
    if (!target) return;
    event.preventDefault();
    correct(target, event.shiftKey ? "restore" : "void", event.shiftKey ? "Keyboard redo" : "Keyboard undo");
  }

  function openAttendeeEdit(attendeeId: string) {
    attendeeEditId = attendeeId;
    attendeeEditOpen = true;
  }

  function openCorrection(target: CorrectionTarget) {
    correctionTarget = target;
    correctionOpen = true;
  }

  function openRecess(id: string) {
    recessId = id;
    recessOpen = true;
  }
</script>

<svelte:window onkeydown={handleUndoKey} onfocus={() => data.canWrite && registry.load()} />

<main class="container mx-auto max-w-5xl space-y-6 px-4 pb-8" data-testid="admin-meeting-page">
  <header class="sticky top-0 z-10 -mx-4 space-y-2 border-b bg-background/95 px-4 py-3 backdrop-blur">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="min-w-0">
        <h1 class="truncate text-2xl font-bold tracking-tight">{data.meeting.title}</h1>
        <div class="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground" data-testid="meeting-status">
          {#if status === "closed"}
            <Badge variant="secondary">{$LL.admin.meetings.closed()}</Badge>
          {:else if status === "recess"}
            <Badge>{$LL.admin.meetings.recess()}</Badge>
          {:else if status === "running"}
            <Badge>{$LL.admin.meetings.statusRunning()}</Badge>
          {:else}
            <Badge variant="outline">{$LL.admin.meetings.notStarted()}</Badge>
          {/if}
          {#if activeRecess}
            <span>
              {$LL.admin.meetings.recessSince({
                mode: modeName(activeRecess.mode),
                time: formatShortDateTime(new Date(activeRecess.startedAt), $locale),
              })}
            </span>
          {:else if data.meeting.startsAt}
            <span
              >{$LL.admin.meetings.started({
                time: formatShortDateTime(new Date(data.meeting.startsAt), $locale),
              })}</span
            >
          {:else if data.meeting.scheduledStartsAt}
            <span>
              {$LL.admin.meetings.scheduledFor({
                time: formatShortDateTime(new Date(data.meeting.scheduledStartsAt), $locale),
              })}
            </span>
          {/if}
          {#if data.meeting.closedAt}
            <span>{formatShortDateTime(new Date(data.meeting.closedAt), $locale)}</span>
          {/if}
        </div>
      </div>
      {#if data.canWrite}
        <div class="flex items-center gap-2">
          {#if status === "notStarted"}
            <Button onclick={() => run(() => startMeeting({ meetingId: data.meeting.id }))}
              >{$LL.admin.meetings.startNow()}</Button
            >
          {:else if status === "running"}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button {...props} variant="outline">{$LL.admin.meetings.startRecess()}</Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="end" class="w-80">
                <DropdownMenu.Item
                  onclick={() => run(() => startRecess({ meetingId: data.meeting.id, mode: "track_exits" }))}
                >
                  {$LL.admin.meetings.startShortRecess()}
                </DropdownMenu.Item>
                <DropdownMenu.Item onclick={() => (longRecessDialogOpen = true)}>
                  {$LL.admin.meetings.startLongRecess()}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          {:else if status === "recess"}
            <Button onclick={() => run(() => endRecess({ meetingId: data.meeting.id }))}
              >{$LL.admin.meetings.endRecess()}</Button
            >
          {/if}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="outline" size="icon" aria-label={$LL.common.actions()}>
                  <EllipsisVertical />
                </Button>
              {/snippet}
            </DropdownMenu.Trigger>
            <DropdownMenu.Content align="end" class="w-64">
              <DropdownMenu.Item onclick={() => (timesOpen = true)}>{$LL.admin.meetings.editTimes()}</DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Label class="text-xs font-semibold text-muted-foreground">
                {$LL.admin.meetings.export()}
              </DropdownMenu.Label>
              {#each ["attendees", "events", "corrections", "recesses"] as kind (kind)}
                <DropdownMenu.Item onclick={() => location.assign(`${page.url.pathname}/export?kind=${kind}`)}>
                  {kind === "attendees"
                    ? $LL.admin.meetings.downloadAttendees()
                    : kind === "events"
                      ? $LL.admin.meetings.downloadEvents()
                      : kind === "corrections"
                        ? $LL.admin.meetings.downloadCorrections()
                        : $LL.admin.meetings.downloadRecesses()}
                </DropdownMenu.Item>
              {/each}
              {#if status === "running"}
                <DropdownMenu.Separator />
                <DropdownMenu.Item variant="destructive" onclick={() => (closeDialogOpen = true)}>
                  {$LL.admin.meetings.close()}
                </DropdownMenu.Item>
              {:else if status === "closed"}
                <DropdownMenu.Separator />
                <DropdownMenu.Item onclick={() => run(() => reopenMeeting({ meetingId: data.meeting.id }))}>
                  {$LL.admin.meetings.reopen()}
                </DropdownMenu.Item>
              {/if}
            </DropdownMenu.Content>
          </DropdownMenu.Root>
        </div>
      {/if}
    </div>
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      <p class="text-lg font-semibold" data-testid="present-count">
        {$LL.admin.meetings.presentNow({ members: String(memberCount), guests: String(guestCount) })}
      </p>
      <ul class="hidden flex-wrap gap-1.5 sm:flex">
        {#each data.types as type (type.id)}
          <li>
            <Badge variant="secondary">
              {type.name[$locale]}
              {presentRows.filter((row) => row.typeId === type.id).length}
            </Badge>
          </li>
        {/each}
      </ul>
      {#if activeRecess || !data.meeting.startsAt}
        <span class="text-sm text-muted-foreground">
          {$LL.admin.meetings.inRoom({ count: String(rows.filter((row) => row.physicalPresent).length) })}
        </span>
      {/if}
    </div>
  </header>

  {#if data.meeting.closedAt}
    <p class="text-sm text-muted-foreground">
      {$LL.admin.meetings.closedAt({ time: formatDateTime(new Date(data.meeting.closedAt), $locale) })}
    </p>
  {/if}

  {#if canAct}
    <section class="space-y-2">
      <CheckInSearch
        attendees={rows}
        {registry}
        disabled={!canAct}
        started={!!data.meeting.startsAt}
        {typeName}
        onAct={record}
      />
      {#if activeRecess}
        <p class="text-sm text-muted-foreground">{$LL.admin.meetings.recessEntriesPending()}</p>
      {/if}
    </section>
  {/if}

  {#if data.warnings.length}
    <Alert.Root variant="destructive">
      <Alert.Title>{$LL.admin.meetings.actionWarnings({ count: String(data.warnings.length) })}</Alert.Title>
      <Alert.Description>
        <ul class="space-y-1">
          {#each data.warnings as warning (warning.eventId + warning.code)}
            <li class="flex flex-wrap items-center gap-2">
              <span>
                <strong>{attendeeName.get(warning.attendeeId)}</strong>: {warning.code === "duplicate_in"
                  ? $LL.admin.meetings.duplicateIn()
                  : $LL.admin.meetings.outWithoutIn()}
              </span>
              {#if data.canWrite}
                <Button
                  size="sm"
                  variant="outline"
                  onclick={() => openCorrection({ kind: "edit", eventId: warning.eventId })}
                >
                  {$LL.admin.meetings.correctAction()}
                </Button>
              {/if}
            </li>
          {/each}
        </ul>
      </Alert.Description>
    </Alert.Root>
  {/if}

  <section class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h2 class="text-xl font-semibold">{$LL.admin.meetings.attendees()}</h2>
      <div class="flex gap-1" role="group">
        {#each filters as [value, label] (value)}
          <Button
            size="sm"
            variant={filter === value ? "secondary" : "ghost"}
            aria-pressed={filter === value}
            onclick={() => (filter = value)}
          >
            {label}
          </Button>
        {/each}
      </div>
    </div>
    {#if rows.length === 0}
      <p class="rounded-lg border p-6 text-center text-sm text-muted-foreground">{$LL.admin.meetings.noAttendees()}</p>
    {:else}
      <div class="rounded-lg border contain-inline-size">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{$LL.admin.meetings.person()}</Table.Head>
              <Table.Head class="hidden lg:table-cell">{$LL.admin.meetings.membership()}</Table.Head>
              <Table.Head>{$LL.admin.meetings.status()}</Table.Head>
              <Table.Head class="hidden lg:table-cell">{$LL.admin.meetings.lastAction()}</Table.Head>
              <Table.Head class="text-right"></Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each filteredRows as row (row.id)}
              <Table.Row data-testid="attendee-row">
                <Table.Cell class="max-w-56">
                  <p class="truncate font-medium">{row.displayName}</p>
                  <p class="truncate text-xs text-muted-foreground lg:hidden">
                    {row.isGuest ? $LL.admin.meetings.guest() : typeName(row.typeId)}
                  </p>
                </Table.Cell>
                <Table.Cell class="hidden lg:table-cell">
                  {row.isGuest ? $LL.admin.meetings.guest() : typeName(row.typeId)}
                </Table.Cell>
                <Table.Cell>
                  <div class="flex flex-wrap items-center gap-1">
                    <Badge variant={row.status === "present" ? "default" : "outline"}>
                      {row.status === "present"
                        ? $LL.admin.meetings.present()
                        : row.status === "pending"
                          ? data.meeting.startsAt
                            ? $LL.admin.meetings.pendingReentry()
                            : $LL.admin.meetings.pendingStart()
                          : $LL.admin.meetings.away()}
                    </Badge>
                    {#if row.conflicts}
                      <Badge variant="destructive">{row.conflicts}</Badge>
                    {/if}
                  </div>
                </Table.Cell>
                <Table.Cell class="hidden text-muted-foreground lg:table-cell">
                  {row.lastActionAt ? formatShortDateTime(new Date(row.lastActionAt), $locale) : ""}
                </Table.Cell>
                <Table.Cell class="text-right">
                  {#if data.canWrite}
                    <div class="flex justify-end gap-1">
                      {#if canAct}
                        <Button
                          size="sm"
                          variant="outline"
                          onclick={() => record({ attendeeId: row.id }, row.physicalPresent ? "out" : "in")}
                        >
                          {row.physicalPresent ? $LL.admin.meetings.checkOut() : $LL.admin.meetings.checkIn()}
                        </Button>
                      {/if}
                      <DropdownMenu.Root>
                        <DropdownMenu.Trigger>
                          {#snippet child({ props })}
                            <Button {...props} size="sm" variant="ghost" aria-label={$LL.admin.meetings.moreActions()}>
                              <EllipsisVertical />
                            </Button>
                          {/snippet}
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Content align="end">
                          <DropdownMenu.Item onclick={() => openAttendeeEdit(row.id)}>
                            {$LL.admin.meetings.editAttendee()}
                          </DropdownMenu.Item>
                          <DropdownMenu.Item onclick={() => openCorrection({ kind: "add", attendeeId: row.id })}>
                            {$LL.admin.meetings.addMissedAction()}
                          </DropdownMenu.Item>
                        </DropdownMenu.Content>
                      </DropdownMenu.Root>
                    </div>
                  {/if}
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </div>
    {/if}
  </section>

  <MeetingHistory
    {data}
    latestUndoableId={latestUndoable?.id}
    latestRestorableId={latestRestorable?.eventId}
    {correct}
    {openCorrection}
    {openRecess}
    openTimes={() => (timesOpen = true)}
  />
</main>

{#if data.canWrite}
  <CorrectionSheet bind:open={correctionOpen} target={correctionTarget} {data} />
  <AttendeeSheet
    bind:open={attendeeEditOpen}
    attendee={rows.find((row) => row.id === attendeeEditId) ?? null}
    attendees={rows}
    {registry}
    meetingId={data.meeting.id}
    {typeName}
  />
  <RecessSheet bind:open={recessOpen} {recessId} {data} />

  <Sheet.Root bind:open={timesOpen}>
    <Sheet.Content class="flex flex-col gap-4 overflow-y-auto sm:max-w-md">
      <Sheet.Header>
        <Sheet.Title>{$LL.admin.meetings.meetingTimes()}</Sheet.Title>
        <Sheet.Description>
          {$LL.admin.meetings.createdAt({ time: formatDateTime(new Date(data.meeting.createdAt), $locale) })}
        </Sheet.Description>
      </Sheet.Header>
      <form
        {...updateMeetingTimes.preflight(updateMeetingTimesSchema).enhance(async ({ submit }) => {
          try {
            await submit();
          } catch (cause) {
            toast.error(remoteErrorMessage(cause, $LL.error.updateFailed()));
            return;
          }
          if (updateMeetingTimes.result?.success === false) {
            toast.error(updateMeetingTimes.result.message);
            return;
          }
          toast.success($LL.admin.meetings.saveTimes());
          timesOpen = false;
          await invalidateAll();
        })}
        class="space-y-4 px-4"
      >
        <input {...updateMeetingTimes.fields.meetingId.as("hidden", data.meeting.id)} />
        <div class="space-y-2">
          <Label for="scheduled-start">{$LL.admin.meetings.scheduledStart()}</Label>
          <LocalDatetimeInput field={updateMeetingTimes.fields.scheduledStartsAt} id="scheduled-start" required />
        </div>
        <div class="space-y-2">
          <Label for="actual-start">{$LL.admin.meetings.actualStart()}</Label>
          <LocalDatetimeInput field={updateMeetingTimes.fields.startsAt} id="actual-start" />
        </div>
        <Button type="submit" disabled={!!updateMeetingTimes.pending}>{$LL.admin.meetings.saveTimes()}</Button>
      </form>
    </Sheet.Content>
  </Sheet.Root>

  <AlertDialog.Root bind:open={closeDialogOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{$LL.admin.meetings.closeConfirmTitle()}</AlertDialog.Title>
        <AlertDialog.Description>{$LL.admin.meetings.closeConfirmDescription()}</AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{$LL.common.cancel()}</AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={() => {
            closeDialogOpen = false;
            run(() => closeMeeting({ meetingId: data.meeting.id }));
          }}
        >
          {$LL.admin.meetings.close()}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>

  <AlertDialog.Root bind:open={longRecessDialogOpen}>
    <AlertDialog.Content>
      <AlertDialog.Header>
        <AlertDialog.Title>{$LL.admin.meetings.longRecessConfirmTitle()}</AlertDialog.Title>
        <AlertDialog.Description>{$LL.admin.meetings.longRecessConfirmDescription()}</AlertDialog.Description>
      </AlertDialog.Header>
      <AlertDialog.Footer>
        <AlertDialog.Cancel>{$LL.common.cancel()}</AlertDialog.Cancel>
        <AlertDialog.Action
          onclick={() => {
            longRecessDialogOpen = false;
            run(() => startRecess({ meetingId: data.meeting.id, mode: "reset_all" }));
          }}
        >
          {$LL.admin.meetings.longRecess()}
        </AlertDialog.Action>
      </AlertDialog.Footer>
    </AlertDialog.Content>
  </AlertDialog.Root>
{/if}
