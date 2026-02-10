<script lang="ts">
  import type { PageProps } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import { Label } from "$lib/components/ui/label";
  import { Input } from "$lib/components/ui/input";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { createMeeting } from "./data.remote";
  import { createMeetingSchema } from "./schema";
  import { invalidateAll } from "$app/navigation";

  const { data }: PageProps = $props();

  // Get status badge variant based on meeting status
  function getStatusVariant(
    status: "upcoming" | "ongoing" | "recess" | "finished",
  ): "default" | "secondary" | "outline" | "destructive" {
    switch (status) {
      case "upcoming":
        return "secondary";
      case "ongoing":
        return "default";
      case "recess":
        return "outline";
      case "finished":
        return "secondary";
    }
  }

  // Format date for display
  function formatDate(date: Date | string): string {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString($locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title={$LL.admin.meetings.title()} description={$LL.admin.meetings.description()} />

  <!-- Create meeting form -->
  <Card.Root class="mb-6">
    <Card.Header>
      <Card.Title>{$LL.admin.meetings.createNew()}</Card.Title>
    </Card.Header>
    <Card.Content>
      <form
        {...createMeeting.preflight(createMeetingSchema).enhance(async ({ submit }) => {
          await submit();
          await invalidateAll();
        })}
        class="space-y-4"
      >
        <div class="space-y-2">
          <Label for="name">{$LL.admin.meetings.meetingName()}</Label>
          <Input {...createMeeting.fields.name.as("text")} id="name" required />
        </div>

        <div class="space-y-2">
          <Label for="description">{$LL.admin.meetings.meetingDescription()}</Label>
          <Input {...createMeeting.fields.description.as("text")} id="description" />
        </div>

        <Button type="submit">{$LL.admin.meetings.createButton()}</Button>
      </form>
    </Card.Content>
  </Card.Root>

  <!-- Meetings table -->
  {#if data.meetings.length === 0}
    <Card.Root>
      <Card.Content class="flex flex-col items-center justify-center py-12">
        <p class="text-lg font-semibold text-muted-foreground">
          {$LL.admin.meetings.noMeetings()}
        </p>
        <p class="text-sm text-muted-foreground">
          {$LL.admin.meetings.noMeetingsDescription()}
        </p>
      </Card.Content>
    </Card.Root>
  {:else}
    <Card.Root>
      <Card.Content class="p-0">
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>{$LL.admin.meetings.table.name()}</Table.Head>
              <Table.Head>{$LL.admin.meetings.table.status()}</Table.Head>
              <Table.Head>{$LL.admin.meetings.table.created()}</Table.Head>
              <Table.Head class="text-right">{$LL.admin.meetings.table.actions()}</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each data.meetings as meeting (meeting.id)}
              <Table.Row>
                <Table.Cell class="font-medium">{meeting.name}</Table.Cell>
                <Table.Cell>
                  <Badge variant={getStatusVariant(meeting.status)}>
                    {$LL.admin.meetings.status[meeting.status]()}
                  </Badge>
                </Table.Cell>
                <Table.Cell>{formatDate(meeting.createdAt)}</Table.Cell>
                <Table.Cell class="text-right">
                  <Button variant="ghost" size="sm" href="/{$locale}/admin/meetings/{meeting.id}">
                    {$LL.admin.meetings.table.view()}
                  </Button>
                </Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      </Card.Content>
    </Card.Root>
  {/if}
</main>
