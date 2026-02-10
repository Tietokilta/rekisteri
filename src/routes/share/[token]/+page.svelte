<script lang="ts">
  import type { PageProps } from "./$types";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import Search from "@lucide/svelte/icons/search";
  import Users from "@lucide/svelte/icons/users";
  import Clock from "@lucide/svelte/icons/clock";
  import Calendar from "@lucide/svelte/icons/calendar";

  const { data }: PageProps = $props();

  let searchQuery = $state("");

  // Filtered attendees based on search
  const filteredAttendees = $derived(
    data.attendees.filter(
      (attendee) =>
        attendee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        attendee.email.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // Format date/time for display
  function formatTime(date: Date | string | null): string {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function formatDate(date: Date | string | null): string {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

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
</script>

<svelte:head>
  <title>Attendance - {data.meeting.name}</title>
</svelte:head>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <!-- Meeting header -->
  <div class="mb-6">
    <div class="mb-2 flex items-center gap-3">
      <h1 class="text-3xl font-bold">{data.meeting.name}</h1>
      <Badge variant={getStatusVariant(data.meeting.status)}>
        {data.meeting.status}
      </Badge>
    </div>
    {#if data.meeting.description}
      <p class="text-muted-foreground">{data.meeting.description}</p>
    {/if}
    <div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
      <div class="flex items-center gap-1">
        <Calendar class="h-4 w-4" />
        <span>{formatDate(data.meeting.createdAt)}</span>
      </div>
      {#if data.meeting.startedAt}
        <div class="flex items-center gap-1">
          <Clock class="h-4 w-4" />
          <span>Started {formatTime(data.meeting.startedAt)}</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Summary stats -->
  <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="flex items-center gap-2 text-sm font-medium">
          <Users class="h-4 w-4" />
          Currently In
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{data.stats.currentlyIn}</div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="flex items-center gap-2 text-sm font-medium">
          <Users class="h-4 w-4" />
          Total Attended
        </Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{data.stats.totalAttended}</div>
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Search -->
  <Card.Root class="mb-6">
    <Card.Content class="pt-6">
      <div class="relative">
        <Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input type="text" placeholder="Search by name or email..." bind:value={searchQuery} class="pl-10" />
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Attendees list -->
  <Card.Root>
    <Card.Header>
      <Card.Title>Attendees ({filteredAttendees.length})</Card.Title>
    </Card.Header>
    <Card.Content class="p-0">
      {#if filteredAttendees.length === 0}
        <div class="py-8 text-center text-muted-foreground">
          {#if searchQuery}
            No attendees found matching "{searchQuery}"
          {:else}
            No one has attended yet
          {/if}
        </div>
      {:else}
        <Table.Root>
          <Table.Header>
            <Table.Row>
              <Table.Head>Name</Table.Head>
              <Table.Head>Email</Table.Head>
              <Table.Head>Status</Table.Head>
              <Table.Head>Last Check-In</Table.Head>
              <Table.Head>Last Check-Out</Table.Head>
              <Table.Head>Check-Ins</Table.Head>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {#each filteredAttendees as attendee (attendee.userId)}
              <Table.Row>
                <Table.Cell class="font-medium">{attendee.name}</Table.Cell>
                <Table.Cell>{attendee.email}</Table.Cell>
                <Table.Cell>
                  {#if attendee.isCurrentlyIn}
                    <Badge variant="default">In</Badge>
                  {:else}
                    <Badge variant="secondary">Out</Badge>
                  {/if}
                </Table.Cell>
                <Table.Cell>{formatTime(attendee.lastCheckIn)}</Table.Cell>
                <Table.Cell>{formatTime(attendee.lastCheckOut)}</Table.Cell>
                <Table.Cell>{attendee.checkInCount}</Table.Cell>
              </Table.Row>
            {/each}
          </Table.Body>
        </Table.Root>
      {/if}
    </Card.Content>
  </Card.Root>

  <!-- Footer note -->
  <div class="mt-6 text-center text-sm text-muted-foreground">
    <p>This is a read-only view of meeting attendance.</p>
    <p class="mt-1">Data refreshes when you reload the page.</p>
  </div>
</main>
