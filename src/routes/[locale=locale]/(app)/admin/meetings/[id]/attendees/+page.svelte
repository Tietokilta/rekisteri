<script lang="ts">
  import type { PageProps } from "./$types";
  import { locale } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button";
  import * as Card from "$lib/components/ui/card";
  import * as Table from "$lib/components/ui/table";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { manualCheckIn, manualCheckOut } from "./data.remote";
  import { manualCheckInSchema, manualCheckOutSchema } from "./schema";
  import { invalidateAll } from "$app/navigation";
  import LogIn from "@lucide/svelte/icons/log-in";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Search from "@lucide/svelte/icons/search";
  import Users from "@lucide/svelte/icons/users";
  import Download from "@lucide/svelte/icons/download";

  const { data }: PageProps = $props();

  let searchQuery = $state("");
  let showAvailableOnly = $state(false);

  // Filtered attendees based on search
  const filteredAttendees = $derived(
    data.attendees.filter(
      (attendee) =>
        attendee.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        attendee.email.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // Filtered available members based on search
  const filteredAvailable = $derived(
    data.availableForCheckIn.filter(
      (member) =>
        member.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        member.email.toLowerCase().includes(searchQuery.toLowerCase()),
    ),
  );

  // Format date/time for display
  function formatTime(date: Date | string | null): string {
    if (!date) return "-";
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toLocaleTimeString($locale, {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
</script>

<main class="container mx-auto max-w-[1400px] px-4 py-6">
  <AdminPageHeader title="Attendees" description={`Manage attendance for: ${data.meeting.name}`}>
    {#snippet actions()}
      <Button variant="outline" href="/{$locale}/admin/meetings/{data.meeting.id}/attendees/export">
        <Download class="mr-2 h-4 w-4" />
        Export CSV
      </Button>
      <Button variant="outline" href="/{$locale}/admin/meetings/{data.meeting.id}">Back to meeting</Button>
    {/snippet}
  </AdminPageHeader>

  <!-- Summary stats -->
  <div class="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm font-medium">Currently In</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{data.stats.currentlyIn}</div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm font-medium">Total Attended</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{data.stats.totalAttended}</div>
      </Card.Content>
    </Card.Root>

    <Card.Root>
      <Card.Header class="pb-3">
        <Card.Title class="text-sm font-medium">Available Members</Card.Title>
      </Card.Header>
      <Card.Content>
        <div class="text-2xl font-bold">{data.availableForCheckIn.length}</div>
      </Card.Content>
    </Card.Root>
  </div>

  <!-- Search and filters -->
  <Card.Root class="mb-6">
    <Card.Content class="pt-6">
      <div class="flex gap-4">
        <div class="relative flex-1">
          <Search class="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="text" placeholder="Search by name or email..." bind:value={searchQuery} class="pl-10" />
        </div>
        <Button
          variant={showAvailableOnly ? "default" : "outline"}
          onclick={() => (showAvailableOnly = !showAvailableOnly)}
        >
          <Users class="mr-2 h-4 w-4" />
          {showAvailableOnly ? "Show All" : "Show Available Only"}
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Attendees list -->
  {#if showAvailableOnly}
    <!-- Show only members available for check-in -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Available for Check-In ({filteredAvailable.length})</Card.Title>
      </Card.Header>
      <Card.Content class="p-0">
        {#if filteredAvailable.length === 0}
          <div class="py-8 text-center text-muted-foreground">
            {#if searchQuery}
              No members found matching "{searchQuery}"
            {:else}
              All active members have already attended
            {/if}
          </div>
        {:else}
          <Table.Root>
            <Table.Header>
              <Table.Row>
                <Table.Head>Name</Table.Head>
                <Table.Head>Email</Table.Head>
                <Table.Head class="text-right">Actions</Table.Head>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {#each filteredAvailable as member (member.userId)}
                <Table.Row>
                  <Table.Cell class="font-medium">{member.name}</Table.Cell>
                  <Table.Cell>{member.email}</Table.Cell>
                  <Table.Cell class="text-right">
                    <form
                      {...manualCheckIn.preflight(manualCheckInSchema).enhance(async ({ submit }) => {
                        manualCheckIn.fields.set({ meetingId: data.meeting.id, userId: member.userId });
                        await submit();
                        await invalidateAll();
                      })}
                      class="inline"
                    >
                      <Button type="submit" size="sm" variant="outline">
                        <LogIn class="mr-2 h-4 w-4" />
                        Check In
                      </Button>
                    </form>
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  {:else}
    <!-- Show attendance history -->
    <Card.Root>
      <Card.Header>
        <Card.Title>Attendance History ({filteredAttendees.length})</Card.Title>
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
                <Table.Head class="text-right">Actions</Table.Head>
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
                  <Table.Cell class="text-right">
                    {#if attendee.isCurrentlyIn}
                      <form
                        {...manualCheckOut.preflight(manualCheckOutSchema).enhance(async ({ submit }) => {
                          manualCheckOut.fields.set({ meetingId: data.meeting.id, userId: attendee.userId });
                          await submit();
                          await invalidateAll();
                        })}
                        class="inline"
                      >
                        <Button type="submit" size="sm" variant="outline">
                          <LogOut class="mr-2 h-4 w-4" />
                          Check Out
                        </Button>
                      </form>
                    {:else}
                      <form
                        {...manualCheckIn.preflight(manualCheckInSchema).enhance(async ({ submit }) => {
                          manualCheckIn.fields.set({ meetingId: data.meeting.id, userId: attendee.userId });
                          await submit();
                          await invalidateAll();
                        })}
                        class="inline"
                      >
                        <Button type="submit" size="sm" variant="outline">
                          <LogIn class="mr-2 h-4 w-4" />
                          Check In
                        </Button>
                      </form>
                    {/if}
                  </Table.Cell>
                </Table.Row>
              {/each}
            </Table.Body>
          </Table.Root>
        {/if}
      </Card.Content>
    </Card.Root>
  {/if}
</main>
