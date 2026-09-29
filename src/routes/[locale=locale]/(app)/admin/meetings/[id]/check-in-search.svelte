<script lang="ts">
  import { LL } from "$lib/i18n/i18n-svelte";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { matchesSearchTokens } from "$lib/utils";
  import type { AttendeeRow, RecordTarget } from "./types";
  import type { Registry, RegistryUser } from "./registry.svelte";

  type Row =
    | { key: string; kind: "attendee"; attendee: AttendeeRow }
    | { key: string; kind: "user"; user: RegistryUser; name: string }
    | { key: string; kind: "guest"; name: string };

  let {
    attendees,
    registry,
    disabled,
    started,
    typeName,
    onAct,
  }: {
    attendees: AttendeeRow[];
    registry: Registry;
    disabled: boolean;
    started: boolean;
    typeName: (id: string | null) => string;
    onAct: (target: RecordTarget, direction: "in" | "out") => void;
  } = $props();

  let query = $state("");
  let highlighted = $state(0);
  let input = $state<HTMLInputElement | null>(null);

  $effect(() => {
    input?.focus();
  });

  const userById = $derived(new Map(registry.users.map((user) => [user.id, user])));
  const trimmed = $derived(query.trim());
  const rows = $derived.by((): Row[] => {
    if (trimmed.length < 2) return [];
    const local = attendees
      .filter((person) => {
        const user = person.userId ? userById.get(person.userId) : undefined;
        return matchesSearchTokens(trimmed, [person.displayName, user?.firstNames, user?.lastName, user?.email]);
      })
      .slice(0, 8)
      .map((attendee): Row => ({ key: `attendee:${attendee.id}`, kind: "attendee", attendee }));
    const knownUsers = new Set(attendees.map((person) => person.userId).filter(Boolean));
    const matches = registry.users
      .filter((user) => !knownUsers.has(user.id))
      .filter((user) => matchesSearchTokens(trimmed, [user.firstNames, user.lastName, user.email]))
      .slice(0, 10)
      .map((user): Row => ({
        key: `user:${user.id}`,
        kind: "user",
        user,
        name: [user.firstNames, user.lastName].filter(Boolean).join(" ") || user.email,
      }));
    // No guest row while the registry loads (so a member isn't added as a guest), or for an email address
    // Also none when the name is already a guest here, so the same person isn't split across two rows
    const existingGuest = attendees.some(
      (person) => person.isGuest && person.displayName.toLowerCase() === trimmed.toLowerCase(),
    );
    const guest: Row[] =
      registry.status !== "loading" && !trimmed.includes("@") && !existingGuest
        ? [{ key: "guest", kind: "guest", name: trimmed }]
        : [];
    return [...local, ...matches, ...guest];
  });

  function reset() {
    query = "";
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

{#snippet enterHint()}
  <kbd
    class="ml-1 hidden rounded border border-current/60 px-1 font-mono text-xs leading-4 font-semibold sm:inline"
    data-testid="enter-hint">↵</kbd
  >
{/snippet}

<div class="space-y-2">
  <Input
    bind:ref={input}
    bind:value={query}
    type="search"
    autocomplete="off"
    {disabled}
    placeholder={$LL.admin.meetings.search()}
    class="h-11 text-base"
    oninput={() => (highlighted = 0)}
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
          class={[
            "flex items-center gap-3 border-l-4 px-3 py-2",
            index === highlighted ? "border-l-primary bg-primary/10" : "border-l-transparent hover:bg-muted/50",
          ]}
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
              variant={index === highlighted ? "default" : "outline"}
              {disabled}
              onclick={() => act(row)}
            >
              {row.attendee.physicalPresent ? $LL.admin.meetings.checkOut() : $LL.admin.meetings.checkIn()}
              {#if index === highlighted}{@render enterHint()}{/if}</Button
            >
          {:else if row.kind === "user"}
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{row.name}</p>
              <p class="truncate text-xs text-muted-foreground">
                {row.user.email} · {typeName(row.user.membershipTypeId)}
              </p>
            </div>
            <Button
              size="sm"
              variant={index === highlighted ? "default" : "outline"}
              {disabled}
              onclick={() => act(row)}
              >{$LL.admin.meetings.checkIn()}{#if index === highlighted}{@render enterHint()}{/if}</Button
            >
          {:else}
            <p class="min-w-0 flex-1 text-sm text-muted-foreground">
              {$LL.admin.meetings.addGuestNamed({ name: row.name })}
            </p>
            <Button
              size="sm"
              variant={index === highlighted ? "default" : "outline"}
              {disabled}
              onclick={() => act(row)}
            >
              {$LL.admin.meetings.checkIn()}
              {#if index === highlighted}{@render enterHint()}{/if}</Button
            >
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
  {#if registry.status === "error"}
    <p class="flex flex-wrap items-center gap-2 text-xs text-destructive">
      {$LL.admin.meetings.registryLoadFailed()}
      <Button size="sm" variant="outline" onclick={() => registry.load()}>{$LL.admin.meetings.retry()}</Button>
    </p>
  {:else}
    <p class="text-xs text-muted-foreground">
      {registry.status === "ready" ? $LL.admin.meetings.searchHint() : $LL.admin.meetings.loadingRegistry()}
    </p>
  {/if}
</div>
