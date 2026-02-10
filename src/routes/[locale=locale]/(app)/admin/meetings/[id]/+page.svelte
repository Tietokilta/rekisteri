<script lang="ts">
  import type { PageProps } from "./$types";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card";
  import { Badge } from "$lib/components/ui/badge";
  import { Input } from "$lib/components/ui/input";
  import AdminPageHeader from "$lib/components/admin-page-header.svelte";
  import { transitionMeeting, checkOutAll } from "./data.remote";
  import { transitionMeetingSchema, checkOutAllSchema } from "./schema";
  import { invalidateAll } from "$app/navigation";
  import Play from "@lucide/svelte/icons/play";
  import Coffee from "@lucide/svelte/icons/coffee";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import Users from "@lucide/svelte/icons/users";
  import Share2 from "@lucide/svelte/icons/share-2";
  import Copy from "@lucide/svelte/icons/copy";
  import { toast } from "svelte-sonner";

  const { data }: PageProps = $props();

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(data.shareUrl);
      toast.success("Share link copied to clipboard!");
    } catch {
      toast.error("Failed to copy link");
    }
  }

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
  function formatDate(date: Date | string | null): string {
    if (!date) return "-";
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
  <AdminPageHeader title={data.meeting.name} description={data.meeting.description || ""}>
    {#snippet actions()}
      <Button variant="outline" href="/{$locale}/admin/meetings">Back to meetings</Button>
    {/snippet}
  </AdminPageHeader>

  <!-- Meeting info -->
  <Card.Root class="mb-6">
    <Card.Header>
      <div class="flex items-center justify-between">
        <div>
          <Card.Title>Meeting Information</Card.Title>
        </div>
        <Badge variant={getStatusVariant(data.meeting.status)}>
          {$LL.admin.meetings.status[data.meeting.status]()}
        </Badge>
      </div>
    </Card.Header>
    <Card.Content>
      <dl class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <dt class="text-sm font-medium text-muted-foreground">Created</dt>
          <dd class="mt-1 text-sm">{formatDate(data.meeting.createdAt)}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-muted-foreground">Started</dt>
          <dd class="mt-1 text-sm">{formatDate(data.meeting.startedAt)}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-muted-foreground">Finished</dt>
          <dd class="mt-1 text-sm">{formatDate(data.meeting.finishedAt)}</dd>
        </div>
        <div>
          <dt class="text-sm font-medium text-muted-foreground">Current attendees</dt>
          <dd class="mt-1 text-sm font-semibold">{data.currentAttendeeCount}</dd>
        </div>
      </dl>
    </Card.Content>
  </Card.Root>

  <!-- Share link -->
  <Card.Root class="mb-6">
    <Card.Header>
      <div class="flex items-center gap-2">
        <Share2 class="h-5 w-5" />
        <Card.Title>Public Attendance View</Card.Title>
      </div>
      <Card.Description>Share this link to allow read-only access to attendance data</Card.Description>
    </Card.Header>
    <Card.Content>
      <div class="flex gap-2">
        <Input value={data.shareUrl} readonly class="font-mono text-sm" />
        <Button onclick={copyShareLink} variant="outline">
          <Copy class="mr-2 h-4 w-4" />
          Copy
        </Button>
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Control panel -->
  <Card.Root class="mb-6">
    <Card.Header>
      <Card.Title>Meeting Controls</Card.Title>
    </Card.Header>
    <Card.Content>
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {#if data.meeting.status === "upcoming"}
          <form
            {...transitionMeeting.preflight(transitionMeetingSchema).enhance(async ({ submit }) => {
              transitionMeeting.fields.set({ meetingId: data.meeting.id, action: "start" });
              await submit();
              await invalidateAll();
            })}
          >
            <Button type="submit" size="lg" class="h-auto w-full py-6">
              <Play class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">Start Meeting</div>
                <div class="text-xs font-normal opacity-80">Begin tracking attendance</div>
              </div>
            </Button>
          </form>
        {:else if data.meeting.status === "ongoing"}
          <form
            {...transitionMeeting.preflight(transitionMeetingSchema).enhance(async ({ submit }) => {
              transitionMeeting.fields.set({ meetingId: data.meeting.id, action: "recess_start" });
              await submit();
              await invalidateAll();
            })}
          >
            <Button type="submit" size="lg" variant="outline" class="h-auto w-full py-6">
              <Coffee class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">Start Recess</div>
                <div class="text-xs font-normal opacity-80">Pause meeting temporarily</div>
              </div>
            </Button>
          </form>

          <form
            {...transitionMeeting.preflight(transitionMeetingSchema).enhance(async ({ submit }) => {
              transitionMeeting.fields.set({ meetingId: data.meeting.id, action: "finish" });
              await submit();
              await invalidateAll();
            })}
          >
            <Button type="submit" size="lg" class="h-auto w-full py-6">
              <CheckCircle class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">Finish Meeting</div>
                <div class="text-xs font-normal opacity-80">End meeting and stop tracking</div>
              </div>
            </Button>
          </form>
        {:else if data.meeting.status === "recess"}
          <form
            {...transitionMeeting.preflight(transitionMeetingSchema).enhance(async ({ submit }) => {
              transitionMeeting.fields.set({ meetingId: data.meeting.id, action: "recess_end" });
              await submit();
              await invalidateAll();
            })}
          >
            <Button type="submit" size="lg" class="h-auto w-full py-6">
              <Play class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">End Recess</div>
                <div class="text-xs font-normal opacity-80">Resume meeting</div>
              </div>
            </Button>
          </form>

          <form
            {...transitionMeeting.preflight(transitionMeetingSchema).enhance(async ({ submit }) => {
              transitionMeeting.fields.set({ meetingId: data.meeting.id, action: "finish" });
              await submit();
              await invalidateAll();
            })}
          >
            <Button type="submit" size="lg" class="h-auto w-full py-6">
              <CheckCircle class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">Finish Meeting</div>
                <div class="text-xs font-normal opacity-80">End meeting and stop tracking</div>
              </div>
            </Button>
          </form>
        {:else}
          <div class="col-span-2 py-8 text-center text-muted-foreground">
            Meeting has finished. No actions available.
          </div>
        {/if}

        {#if data.meeting.status === "ongoing" || data.meeting.status === "recess"}
          <form
            {...checkOutAll.preflight(checkOutAllSchema).enhance(async ({ submit }) => {
              if (!confirm("Check out all current attendees?")) {
                return;
              }
              checkOutAll.fields.set({ meetingId: data.meeting.id });
              await submit();
              await invalidateAll();
            })}
          >
            <Button
              type="submit"
              size="lg"
              variant="destructive"
              disabled={data.currentAttendeeCount === 0}
              class="h-auto w-full py-6"
            >
              <Users class="mr-2 h-5 w-5" />
              <div class="text-left">
                <div class="font-semibold">Check Out All</div>
                <div class="text-xs font-normal opacity-80">
                  For long recess ({data.currentAttendeeCount} attendees)
                </div>
              </div>
            </Button>
          </form>
        {/if}
      </div>
    </Card.Content>
  </Card.Root>

  <!-- Quick links -->
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    <Card.Root>
      <Card.Header>
        <Card.Title>QR Scanner</Card.Title>
        <Card.Description>Scan member QR codes for check-in/out</Card.Description>
      </Card.Header>
      <Card.Footer>
        {#if data.meeting.status === "ongoing" || data.meeting.status === "recess"}
          <Button variant="outline" class="w-full" href="/{$locale}/admin/meetings/{data.meeting.id}/scan">
            Open Scanner
          </Button>
        {:else}
          <Button variant="outline" class="w-full" disabled>Available when meeting is ongoing</Button>
        {/if}
      </Card.Footer>
    </Card.Root>

    <Card.Root>
      <Card.Header>
        <Card.Title>Attendee Management</Card.Title>
        <Card.Description>View and manage attendance records</Card.Description>
      </Card.Header>
      <Card.Footer>
        <Button variant="outline" class="w-full" href="/{$locale}/admin/meetings/{data.meeting.id}/attendees">
          View Attendees
        </Button>
      </Card.Footer>
    </Card.Root>
  </div>
</main>
