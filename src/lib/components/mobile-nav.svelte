<script lang="ts">
  import * as Drawer from "$lib/components/ui/drawer/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { page } from "$app/state";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { signOut } from "$lib/api/auth.remote";
  import { stripLocaleFromPathname, type Locale } from "$lib/i18n/routing";
  import { getMainNavItems, getSettingsNavItems, getAdminNavItems } from "$lib/navigation";

  // Icons from @lucide/svelte
  import Menu from "@lucide/svelte/icons/menu";
  import Settings from "@lucide/svelte/icons/settings";
  import Shield from "@lucide/svelte/icons/shield";
  import LogOut from "@lucide/svelte/icons/log-out";
  import X from "@lucide/svelte/icons/x";
  import Languages from "@lucide/svelte/icons/languages";

  interface Props {
    user: {
      email: string;
      firstNames?: string | null;
      lastName?: string | null;
      isAdmin: boolean;
    };
  }

  let { user }: Props = $props();

  let open = $state(false);

  // Navigation items from shared module
  const mainNavItems = $derived(getMainNavItems($locale, $LL));
  const settingsNavItems = $derived(getSettingsNavItems($locale, $LL));
  const adminNavItems = $derived(getAdminNavItems($locale, $LL));

  function isActive(href: string): boolean {
    return page.url.pathname === href;
  }

  function handleNavClick() {
    open = false;
  }

  function languageHref(newLanguage: Locale) {
    const canonicalPath = stripLocaleFromPathname(page.url.pathname);
    return `/${newLanguage}${canonicalPath}`;
  }
</script>

<!-- FAB Button - only visible on mobile, respects safe area insets -->
<div
  class="fixed z-50 md:hidden"
  style="right: calc(1.5rem + env(safe-area-inset-right, 0px)); bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));"
>
  <Drawer.Root bind:open direction="bottom">
    <Drawer.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="secondary"
          class="h-14 w-14 rounded-full border border-border/50 shadow-lg"
          aria-label="Open navigation menu"
        >
          <Menu class="!size-5" />
        </Button>
      {/snippet}
    </Drawer.Trigger>
    <Drawer.Content>
      <Drawer.Header class="flex flex-row items-center justify-between border-b">
        <Drawer.Title>{$LL.nav.title()}</Drawer.Title>
        <Drawer.Close>
          {#snippet child({ props })}
            <Button {...props} variant="ghost" size="icon" class="h-8 w-8">
              <X class="size-4" />
              <span class="sr-only">Close</span>
            </Button>
          {/snippet}
        </Drawer.Close>
      </Drawer.Header>

      <!-- Scrollable navigation links -->
      <nav class="flex-1 overflow-y-auto p-4">
        <div class="flex flex-col gap-2">
          <!-- Main navigation -->
          <ul class="flex flex-col gap-1">
            {#each mainNavItems as item (item.href)}
              <li>
                <a
                  href={item.href}
                  onclick={handleNavClick}
                  class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent {isActive(
                    item.href,
                  )
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground'}"
                >
                  <item.icon class="size-5" />
                  <span>{item.title}</span>
                </a>
              </li>
            {/each}
          </ul>

          <!-- Settings section -->
          <div class="mt-2">
            <div
              class="flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
            >
              <Settings class="size-4" />
              <span>{$LL.nav.settings()}</span>
            </div>
            <ul class="flex flex-col gap-1">
              {#each settingsNavItems as item (item.href)}
                <li>
                  <a
                    href={item.href}
                    onclick={handleNavClick}
                    class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent {isActive(
                      item.href,
                    )
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground'}"
                  >
                    <item.icon class="size-5" />
                    <span>{item.title}</span>
                  </a>
                </li>
              {/each}
            </ul>
          </div>

          <!-- Admin section (only visible if isAdmin) -->
          {#if user.isAdmin}
            <div class="mt-2">
              <div
                class="flex items-center gap-2 px-3 py-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase"
              >
                <Shield class="size-4" />
                <span>{$LL.nav.admin.title()}</span>
              </div>
              <ul class="flex flex-col gap-1">
                {#each adminNavItems as item (item.href)}
                  <li>
                    <a
                      href={item.href}
                      onclick={handleNavClick}
                      class="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent {isActive(
                        item.href,
                      )
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground'}"
                    >
                      <item.icon class="size-5" />
                      <span>{item.title}</span>
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          {/if}
        </div>
      </nav>

      <!-- Pinned footer: language toggle and sign out (always visible) -->
      <div
        class="flex items-center justify-between border-t p-4"
        style="padding-bottom: calc(1rem + env(safe-area-inset-bottom, 0px));"
      >
        <div class="flex items-center gap-2">
          <Languages class="size-5 text-muted-foreground" />
          <ToggleGroup.Root type="single" value={$locale} data-sveltekit-reload>
            <ToggleGroup.Item value="fi" class="h-8 px-3">
              {#snippet child({ props })}
                <a {...props} href={languageHref("fi")}>FI</a>
              {/snippet}
            </ToggleGroup.Item>
            <ToggleGroup.Item value="en" class="h-8 px-3">
              {#snippet child({ props })}
                <a {...props} href={languageHref("en")}>EN</a>
              {/snippet}
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
        <form class="contents" {...signOut}>
          <button
            type="submit"
            onclick={handleNavClick}
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <LogOut class="size-5" />
            <span>{$LL.nav.signOut()}</span>
          </button>
        </form>
      </div>
    </Drawer.Content>
  </Drawer.Root>
</div>
