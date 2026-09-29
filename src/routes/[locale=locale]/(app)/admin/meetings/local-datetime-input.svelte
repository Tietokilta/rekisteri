<script lang="ts">
  import type { RemoteFormField } from "@sveltejs/kit";
  import { Input } from "$lib/components/ui/input";

  /**
   * A datetime-local input backed by a remote form field that stores an ISO timestamp.
   * The browser converts the local wall time to UTC, so DST is handled per date, not per "now".
   */
  let {
    field,
    id,
    required = false,
  }: {
    field: RemoteFormField<string>;
    id?: string;
    required?: boolean;
  } = $props();

  function toLocal(value: string | undefined) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  }
</script>

<Input
  {id}
  type="datetime-local"
  {required}
  value={toLocal(field.value())}
  oninput={(event) => field.set(event.currentTarget.value ? new Date(event.currentTarget.value).toISOString() : "")}
/>
<input {...field.as("text")} type="hidden" />
{#each field.issues() as issue, i (i)}
  <p class="text-sm text-destructive">{issue.message}</p>
{/each}
