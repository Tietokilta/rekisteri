<script lang="ts">
  import type { PageData } from "./$types";
  import { goto } from "$app/navigation";
  import { toast } from "svelte-sonner";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { formatDateTime } from "$lib/utils";
  import { route } from "$lib/ROUTES";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Label } from "$lib/components/ui/label";
  import { createMeeting } from "./data.remote";
  import { createMeetingSchema } from "./schema";
  import LocalDatetimeInput from "./local-datetime-input.svelte";

  let { data }: { data: PageData } = $props();

  type Meeting = PageData["meetings"][number];

  const meetingTime = (meeting: Meeting) =>
    new Date(meeting.startsAt ?? meeting.scheduledStartsAt ?? meeting.createdAt).getTime();

  const open = $derived(
    data.meetings.filter((meeting) => !meeting.closedAt).toSorted((a, b) => meetingTime(a) - meetingTime(b)),
  );
  const running = $derived(open.filter((meeting) => meeting.startsAt));
  // Not-started meetings stay here even past their scheduled time, so a forgotten one remains easy to reach
  const upcoming = $derived(open.filter((meeting) => !meeting.startsAt));
  const pastByYear = $derived([
    ...Map.groupBy(
      data.meetings.filter((meeting) => meeting.closedAt).toSorted((a, b) => meetingTime(b) - meetingTime(a)),
      (meeting) => new Date(meetingTime(meeting)).getFullYear(),
    ),
  ]);
</script>

{#snippet meetingList(meetings: Meeting[])}
  <ul class="divide-y rounded-lg border">
    {#each meetings as meeting (meeting.id)}
      <li>
        <a
          class="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-4 hover:bg-muted"
          href={route("/[locale=locale]/admin/meetings/[id]", { locale: $locale, id: meeting.id })}
          data-testid="meeting-row"
        >
          <span class="font-medium">{meeting.title}</span>
          {#if meeting.startsAt}
            <span class="text-sm text-muted-foreground"
              >{$LL.admin.meetings.started({ time: formatDateTime(new Date(meeting.startsAt), $locale) })}</span
            >
          {:else if meeting.scheduledStartsAt}
            <span class="text-sm text-muted-foreground"
              >{$LL.admin.meetings.scheduledFor({
                time: formatDateTime(new Date(meeting.scheduledStartsAt), $locale),
              })}</span
            >
          {/if}
        </a>
      </li>
    {/each}
  </ul>
{/snippet}

<main class="container mx-auto max-w-4xl space-y-6 px-4 py-6" data-testid="admin-meetings-page">
  <AdminPageHeader title={$LL.admin.meetings.title()} description={$LL.admin.meetings.description()} />

  {#if data.canWrite}
    <form
      {...createMeeting.preflight(createMeetingSchema).enhance(async ({ submit }) => {
        try {
          await submit();
        } catch (cause) {
          toast.error(cause instanceof Error ? cause.message : $LL.error.updateFailed());
          return;
        }
        const id = createMeeting.result?.id;
        if (id) await goto(route("/[locale=locale]/admin/meetings/[id]", { locale: $locale, id }));
      })}
      class="flex flex-wrap items-end gap-3 rounded-lg border p-4"
    >
      <div class="min-w-0 flex-1 space-y-2">
        <Label for="meeting-title">{$LL.admin.meetings.meetingTitle()}</Label>
        <Input {...createMeeting.fields.title.as("text")} id="meeting-title" required maxlength={200} />
      </div>
      <div class="space-y-2">
        <Label for="meeting-scheduled-start">{$LL.admin.meetings.scheduledStart()}</Label>
        <LocalDatetimeInput field={createMeeting.fields.scheduledStartsAt} id="meeting-scheduled-start" required />
      </div>
      <Button type="submit" disabled={!!createMeeting.pending}>{$LL.admin.meetings.create()}</Button>
      {#each createMeeting.fields.allIssues() as issue, i (i)}
        <p class="w-full text-sm text-destructive">{issue.message}</p>
      {/each}
    </form>
  {/if}

  {#if running.length}
    <section class="space-y-3" data-testid="running-meetings">
      <h2 class="text-lg font-semibold">{$LL.admin.meetings.runningMeetings()}</h2>
      {@render meetingList(running)}
    </section>
  {/if}

  <section class="space-y-3" data-testid="upcoming-meetings">
    <h2 class="text-lg font-semibold">{$LL.admin.meetings.upcomingMeetings()}</h2>
    {#if upcoming.length}
      {@render meetingList(upcoming)}
    {:else}
      <p class="text-sm text-muted-foreground">{$LL.admin.meetings.noUpcomingMeetings()}</p>
    {/if}
  </section>

  {#if pastByYear.length}
    <section class="space-y-4" data-testid="past-meetings">
      <h2 class="text-lg font-semibold">{$LL.admin.meetings.pastMeetings()}</h2>
      {#each pastByYear as [year, meetings] (year)}
        <div class="space-y-2">
          <h3 class="text-sm font-medium text-muted-foreground">{year}</h3>
          {@render meetingList(meetings)}
        </div>
      {/each}
    </section>
  {/if}
</main>
