<script lang="ts">
  import { Textarea } from "$lib/components/ui/textarea";
  import { Button } from "$lib/components/ui/button";
  import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "$lib/components/ui/tooltip";
  import * as ToggleGroup from "$lib/components/ui/toggle-group";
  import snarkdown from "snarkdown";
  
  import Bold from "@lucide/svelte/icons/bold";
  import Italic from "@lucide/svelte/icons/italic";
  import Heading from "@lucide/svelte/icons/heading";
  import Quote from "@lucide/svelte/icons/quote";
  import List from "@lucide/svelte/icons/list";
  import ListOrdered from "@lucide/svelte/icons/list-ordered";
  import Link from "@lucide/svelte/icons/link";
  import Eye from "@lucide/svelte/icons/eye";
  import FileEdit from "@lucide/svelte/icons/file-edit";

  let { value = $bindable(), id = undefined, placeholder = undefined } = $props<{
    value?: string;
    id?: string;
    placeholder?: string;
  }>();

  let textarea: HTMLTextAreaElement | null = $state(null);
  let view = $state("edit");

  function insertText(before: string, after: string = "") {
    if (!textarea || view !== "edit") return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);
    const beforeText = text.substring(0, start);
    const afterText = text.substring(end);

    value = beforeText + before + selection + after + afterText;

    // Set focus and selection back to textarea after state update
    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      const newCursorPos = start + before.length + selection.length + after.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
  }

  function toggleHeading() {
    if (!textarea || view !== "edit") return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;

    // Find the start and end of the current line
    const lineStart = text.lastIndexOf("\n", start - 1) + 1;
    const lineEnd = text.indexOf("\n", end);
    const lineEndPos = lineEnd === -1 ? text.length : lineEnd;
    const line = text.substring(lineStart, lineEndPos);

    // Regex to match existing header prefix (up to 5 # followed by a space)
    const headerMatch = line.match(/^(#{1,5})\s/);
    let newLine = line;

    if (headerMatch && headerMatch[1]) {
      const hashes = headerMatch[1];
      const currentLevel = hashes.length;
      if (currentLevel < 5) {
        // Increment level: e.g. ## -> ###
        newLine = "#".repeat(currentLevel + 1) + " " + line.substring(hashes.length + 1);
      } else {
        // Level 5 reached, back to normal paragraph
        newLine = line.substring(hashes.length + 1);
      }
    } else {
      // No header, start with H1
      newLine = "# " + line;
    }

    const beforeText = text.substring(0, lineStart);
    const afterText = text.substring(lineEndPos);

    value = beforeText + newLine + afterText;

    // Set focus and selection back to textarea
    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      const cursorOffset = newLine.length - line.length;
      textarea.setSelectionRange(start + cursorOffset, end + cursorOffset);
    }, 0);
  }

  const actions = [
    { icon: Bold, label: "Bold", action: () => insertText("**", "**") },
    { icon: Italic, label: "Italic", action: () => insertText("_", "_") },
    { icon: Heading, label: "Heading", action: () => toggleHeading() },
    { icon: Quote, label: "Quote", action: () => insertText("> ") },
    { icon: List, label: "List", action: () => insertText("- ") },
    { icon: ListOrdered, label: "Ordered List", action: () => insertText("1. ") },
    { icon: Link, label: "Link", action: () => insertText("[", "](url)") },
  ];

  const html = $derived(snarkdown(value || ""));
</script>

<div class="markdown-editor-container flex flex-col rounded-md border border-input bg-background">
  <div class="flex flex-wrap items-center justify-between border-b p-1">
    <div class="flex flex-wrap gap-1">
      <TooltipProvider>
        {#each actions as item}
          <Tooltip>
            <TooltipTrigger>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                onclick={item.action}
                aria-label={item.label}
                disabled={view !== "edit"}
              >
                <item.icon class="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{item.label}</p>
            </TooltipContent>
          </Tooltip>
        {/each}
      </TooltipProvider>
    </div>

    <ToggleGroup.Root type="single" bind:value={view} class="h-8 bg-muted/50 p-0.5">
      <ToggleGroup.Item value="edit" class="h-7 px-2 text-xs">
        <FileEdit class="mr-1.5 h-3 w-3" />
        Edit
      </ToggleGroup.Item>
      <ToggleGroup.Item value="preview" class="h-7 px-2 text-xs">
        <Eye class="mr-1.5 h-3 w-3" />
        Preview
      </ToggleGroup.Item>
    </ToggleGroup.Root>
  </div>
  
  {#if view === "edit"}
    <Textarea
      bind:ref={textarea}
      bind:value
      id={id}
      {placeholder}
      class="min-h-[300px] max-h-[400px] overflow-y-auto border-none focus-visible:ring-0"
    />
  {:else}
    <div class="min-h-[300px] max-h-[400px] overflow-y-auto p-4">
      <div class="prose prose-sm dark:prose-invert max-w-none">
        {@html html}
      </div>
    </div>
  {/if}
</div>

<style>
  /* Ensure the textarea doesn't show default borders since container has them */
  :global(.markdown-editor-container textarea) {
    border: none !important;
    border-radius: 0 0 6px 6px !important;
    box-shadow: none !important;
  }
</style>

