<script lang="ts">
  import { untrack } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { LL } from "$lib/i18n/i18n-svelte";
  import { createMembershipType } from "./data.remote";
  import { createMembershipTypeSchema } from "./schema";
  import { Input } from "$lib/components/ui/input";
  import { Button } from "$lib/components/ui/button";
  import { Label } from "$lib/components/ui/label";
  import * as Sheet from "$lib/components/ui/sheet";

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  // Initialize form fields when component mounts
  $effect(() => {
    untrack(() => {
      createMembershipType.fields.set({
        id: "",
        nameFi: "",
        nameEn: "",
        descriptionFi: "",
        descriptionEn: "",
      });
    });
  });

  // Auto-generate ID from Finnish name
  function generateId(name: string): string {
    return name
      .toLowerCase()
      .replaceAll("ä", "a")
      .replaceAll("ö", "o")
      .replaceAll("å", "a")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "");
  }

  let autoGenerateId = $state(true);

  $effect(() => {
    if (autoGenerateId) {
      const nameFi = createMembershipType.fields.nameFi.value();
      if (nameFi) {
        createMembershipType.fields.id.set(generateId(nameFi));
      }
    }
  });
</script>

<form
  {...createMembershipType.preflight(createMembershipTypeSchema).enhance(async ({ submit }) => {
    await submit();
    onClose();
    await invalidateAll();
  })}
  class="flex flex-1 flex-col gap-5 px-4"
>
  <!-- ID -->
  <div class="space-y-2">
    <Label for="id">{$LL.admin.membershipTypes.id()}</Label>
    <Input
      {...createMembershipType.fields.id.as("text")}
      id="id"
      placeholder="varsinainen-jasen"
      class="font-mono"
      oninput={() => (autoGenerateId = false)}
    />
    <p class="text-sm text-muted-foreground">{$LL.admin.membershipTypes.idDescription()}</p>
    {#each createMembershipType.fields.id.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  <!-- Finnish name -->
  <div class="space-y-2">
    <Label for="nameFi">{$LL.admin.membershipTypes.nameFi()}</Label>
    <Input {...createMembershipType.fields.nameFi.as("text")} id="nameFi" placeholder="Varsinainen jäsen" />
    {#each createMembershipType.fields.nameFi.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  <!-- English name -->
  <div class="space-y-2">
    <Label for="nameEn">{$LL.admin.membershipTypes.nameEn()}</Label>
    <Input {...createMembershipType.fields.nameEn.as("text")} id="nameEn" placeholder="Regular member" />
    {#each createMembershipType.fields.nameEn.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  <!-- Finnish description (optional) -->
  <div class="space-y-2">
    <Label for="descriptionFi">{$LL.admin.membershipTypes.descriptionFi()}</Label>
    <textarea
      {...createMembershipType.fields.descriptionFi.as("text")}
      id="descriptionFi"
      placeholder={$LL.admin.membershipTypes.descriptionPlaceholder()}
      rows={3}
      class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    ></textarea>
    {#each createMembershipType.fields.descriptionFi.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  <!-- English description (optional) -->
  <div class="space-y-2">
    <Label for="descriptionEn">{$LL.admin.membershipTypes.descriptionEn()}</Label>
    <textarea
      {...createMembershipType.fields.descriptionEn.as("text")}
      id="descriptionEn"
      placeholder={$LL.admin.membershipTypes.descriptionPlaceholder()}
      rows={3}
      class="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    ></textarea>
    {#each createMembershipType.fields.descriptionEn.issues() as issue, i (i)}
      <p class="text-sm text-destructive">{issue.message}</p>
    {/each}
  </div>

  <Sheet.Footer>
    <Button type="button" variant="outline" class="flex-1" onclick={onClose}>
      {$LL.common.cancel()}
    </Button>
    <Button type="submit" class="flex-1">{$LL.common.create()}</Button>
  </Sheet.Footer>
</form>
