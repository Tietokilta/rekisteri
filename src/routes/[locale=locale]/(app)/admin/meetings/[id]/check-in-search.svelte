<script lang="ts">
  import { page } from "$app/state";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import type { AttendeeRow, RecordTarget } from "./types";

  type SearchUser = {
    id: string;
    email: string;
    firstNames: string | null;
    lastName: string | null;
    membershipTypeId: string | null;
  };
  type Row =
    | { key: string; kind: "attendee"; attendee: AttendeeRow }
    | { key: string; kind: "user"; user: SearchUser; name: string }
    | { key: string; kind: "guest"; name: string };

  let {
    attendees,
    disabled,
    started,
    typeName,
    onAct,
  }: {
    attendees: AttendeeRow[];
    disabled: boolean;
    started: boolean;
    typeName: (id: string | null) => string;
    onAct: (target: RecordTarget, direction: "in" | "out") => void;
  } = $props();

  let query = $state("");
  let highlighted = $state(0);
  let remote = $state.raw<SearchUser[]>([]);
  let input = $state<HTMLInputElement | null>(null);
  let searchRequest = 0;
  let debounce: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    input?.focus();
  });

  const trimmed = $derived(query.trim());
  const rows = $derived.by((): Row[] => {
    if (trimmed.length < 2) return [];
    const needle = trimmed.toLowerCase();
    const local = attendees
      .filter((person) => person.displayName.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((attendee): Row => ({ key: `attendee:${attendee.id}`, kind: "attendee", attendee }));
    const knownUsers = new Set(attendees.map((person) => person.userId).filter(Boolean));
    const users = remote
      .filter((user) => !knownUsers.has(user.id))
      .slice(0, 10)
      .map((user): Row => ({
        key: `user:${user.id}`,
        kind: "user",
        user,
        name: [user.firstNames, user.lastName].filter(Boolean).join(" ") || user.email,
      }));
    return [...local, ...users, { key: "guest", kind: "guest", name: trimmed }];
  });

  function onInput() {
    highlighted = 0;
    clearTimeout(debounce);
    searchRequest += 1;
    if (trimmed.length < 2) {
      remote = [];
      return;
    }
    const request = searchRequest;
    debounce = setTimeout(async () => {
      try {
        const response = await fetch(
          `${page.url.pathname.replace(/\/[^/]+$/, "")}/search?q=${encodeURIComponent(trimmed)}`,
        );
        if (request === searchRequest && response.ok) remote = await response.json();
      } catch {
        if (request === searchRequest) remote = [];
      }
    }, 150);
  }

  function reset() {
    query = "";
    remote = [];
    highlighted = 0;
    input?.focus();
  }

  function act(row: Row) {
    if (disabled) return;
    if (row.kind === "attendee") {
      onAct({ attendeeId: row.attendee.id }, row.attendee.physicalPresent ? "out" : "in");
    } else if (row.kind === "user") {
      onAct({ userId: row.user.id }, "in");
    } else {
      onAct({ guestName: row.name }, "in");
    }
    reset();
  }

  function onKeydown(event: KeyboardEvent) {
    if (!rows.length) return;
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        highlighted = (highlighted + 1) % rows.length;
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        highlighted = (highlighted - 1 + rows.length) % rows.length;
        break;
      }
      case "Enter": {
        event.preventDefault();
        const row = rows[highlighted];
        if (row) act(row);
        break;
      }
      case "Escape": {
        reset();
        break;
      }
      default:
    }
  }
</script>

<div class="space-y-2">
  <Input
    bind:ref={input}
    bind:value={query}
    type="search"
    autocomplete="off"
    {disabled}
    placeholder={$LL.admin.meetings.search()}
    class="h-11 text-base"
    oninput={onInput}
    onkeydown={onKeydown}
    aria-label={$LL.admin.meetings.search()}
    data-testid="meeting-search"
  />
  {#if rows.length}
    <ul class="divide-y overflow-hidden rounded-md border bg-background shadow-sm" role="listbox">
      {#each rows as row, index (row.key)}
        <li
          role="option"
          data-testid="search-result"
          aria-selected={index === highlighted}
          class={["flex items-center gap-3 px-3 py-2", index === highlighted && "bg-muted"]}
          onpointerenter={() => (highlighted = index)}
        >
          {#if row.kind === "attendee"}
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{row.attendee.displayName}</p>
              <p class="truncate text-xs text-muted-foreground">
                {row.attendee.isGuest ? $LL.admin.meetings.guest() : typeName(row.attendee.typeId)}
              </p>
            </div>
            <Badge variant={row.attendee.status === "present" ? "default" : "outline"}>
              {row.attendee.status === "present"
                ? $LL.admin.meetings.present()
                : row.attendee.status === "pending"
                  ? started
                    ? $LL.admin.meetings.pendingReentry()
                    : $LL.admin.meetings.pendingStart()
                  : $LL.admin.meetings.away()}
            </Badge>
            <Button
              size="sm"
              variant={row.attendee.physicalPresent ? "outline" : "default"}
              {disabled}
              onclick={() => act(row)}
            >
              {row.attendee.physicalPresent ? $LL.admin.meetings.checkOut() : $LL.admin.meetings.checkIn()}
            </Button>
          {:else if row.kind === "user"}
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{row.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                {row.user.email} · {typeName(row.user.membershipTypeId)}
              </p>
            </div>
            <Button size="sm" {disabled} onclick={() => act(row)}>{$LL.admin.meetings.checkIn()}</Button>
          {:else}
            <p class="min-w-0 flex-1 text-sm text-muted-foreground">
              {$LL.admin.meetings.addGuestNamed({ name: row.name })}
            </p>
            <Button size="sm" variant="secondary" {disabled} onclick={() => act(row)}>
              {$LL.admin.meetings.checkIn()}
            </Button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  <p class="text-xs text-muted-foreground">{$LL.admin.meetings.searchHint()}</p>
</div>
