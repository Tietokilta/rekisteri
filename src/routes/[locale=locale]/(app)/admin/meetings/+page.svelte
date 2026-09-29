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
</script>

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

  <ul class="divide-y rounded-lg border">
    {#each data.meetings as meeting (meeting.id)}
      <li>
        <a
          class="block p-4 hover:bg-muted"
          href={route("/[locale=locale]/admin/meetings/[id]", { locale: $locale, id: meeting.id })}
        >
          <span class="font-medium">{meeting.title}</span>
          {#if meeting.scheduledStartsAt}<span class="ml-2 text-sm text-muted-foreground"
              >{$LL.admin.meetings.scheduledFor({
                time: formatDateTime(new Date(meeting.scheduledStartsAt), $locale),
              })}</span
            >{/if}
          {#if meeting.startsAt}<span class="ml-2 text-sm text-muted-foreground"
              >{$LL.admin.meetings.started({ time: formatDateTime(new Date(meeting.startsAt), $locale) })}</span
            >{/if}
          {#if meeting.closedAt}<span class="ml-2 text-sm">{$LL.admin.meetings.closed()}</span>{/if}
        </a>
      </li>
    {/each}
  </ul>
</main>
