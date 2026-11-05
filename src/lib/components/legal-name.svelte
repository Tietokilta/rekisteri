<script lang="ts">
  interface Props {
    user: { firstNames?: string | null; lastName?: string | null; preferredName?: string | null };
  }

  let { user }: Props = $props();

  const firstNames = $derived(user.firstNames?.split(" ").filter(Boolean) ?? []);
  const preferred = $derived(user.preferredName?.split(" ").filter(Boolean) ?? []);
  // Underline the first names they go by, as on Finnish forms; a name outside the first names follows in italics
  const calledStart = $derived(
    preferred.length === 0
      ? -1
      : firstNames.findIndex((_, start) =>
          preferred.every((name, i) => name.toLocaleLowerCase() === firstNames[start + i]?.toLocaleLowerCase()),
        ),
  );
  const parts = $derived([
    ...firstNames.map((text, i) => ({
      text,
      kind: calledStart !== -1 && i >= calledStart && i < calledStart + preferred.length ? "called" : "",
    })),
    ...(user.lastName ? [{ text: user.lastName, kind: "" }] : []),
    ...(preferred.length > 0 && calledStart === -1 ? [{ text: preferred.join(" "), kind: "preferred" }] : []),
  ]);
</script>

<!-- prettier-ignore -->
<span>{#each parts as part, i (i)}{i > 0 ? " " : ""}<span class={["underline-offset-2", part.kind && "underline", part.kind === "preferred" && "italic"]} data-testid={part.kind ? `${part.kind}-name` : undefined}>{part.text}</span>{/each}</span>
