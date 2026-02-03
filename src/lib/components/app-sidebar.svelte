<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { page } from "$app/state";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { signOut } from "$lib/api/auth.remote";
  import { stripLocaleFromPathname, type Locale } from "$lib/i18n/routing";
  import { getMainNavItems, getSettingsNavItems, getAdminNavItems } from "$lib/navigation";
  import RatasLogo from "$lib/icons/ratas-logo.svelte";

  // Icons from @lucide/svelte
  import User from "@lucide/svelte/icons/user";
  import LogOut from "@lucide/svelte/icons/log-out";
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

  // Navigation items from shared module
  const mainNavItems = $derived(getMainNavItems($locale, $LL));
  const settingsNavItems = $derived(getSettingsNavItems($locale, $LL));
  const adminNavItems = $derived(getAdminNavItems($locale, $LL));

  function isActive(href: string): boolean {
    return page.url.pathname === href;
  }

  function languageHref(newLanguage: Locale) {
    const canonicalPath = stripLocaleFromPathname(page.url.pathname);
    return `/${newLanguage}${canonicalPath}`;
  }

  // Get user display name
  const displayName = $derived.by(() => {
    if (user.firstNames && user.lastName) {
      return `${user.firstNames} ${user.lastName}`;
    }
    if (user.firstNames) {
      return user.firstNames;
    }
    return user.email;
  });
</script>

<Sidebar.Sidebar>
  <!-- Header with logo -->
  <Sidebar.SidebarHeader>
    <Sidebar.SidebarMenu>
      <Sidebar.SidebarMenuItem>
        <Sidebar.SidebarMenuButton size="lg" tooltipContent={$LL.app.title()}>
          {#snippet child({ props })}
            <a href={route("/[locale=locale]", { locale: $locale })} {...props}>
              <RatasLogo class="size-8" />
              <div class="flex flex-col gap-0.5 leading-none">
                <span class="font-mono font-semibold">{$LL.app.title()}</span>
              </div>
            </a>
          {/snippet}
        </Sidebar.SidebarMenuButton>
      </Sidebar.SidebarMenuItem>
    </Sidebar.SidebarMenu>
  </Sidebar.SidebarHeader>

  <Sidebar.SidebarContent>
    <!-- Main navigation -->
    <Sidebar.SidebarGroup>
      <Sidebar.SidebarGroupContent>
        <Sidebar.SidebarMenu>
          {#each mainNavItems as item (item.href)}
            <Sidebar.SidebarMenuItem>
              <Sidebar.SidebarMenuButton isActive={isActive(item.href)} tooltipContent={item.title}>
                {#snippet child({ props })}
                  <a href={item.href} {...props}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                {/snippet}
              </Sidebar.SidebarMenuButton>
            </Sidebar.SidebarMenuItem>
          {/each}
        </Sidebar.SidebarMenu>
      </Sidebar.SidebarGroupContent>
    </Sidebar.SidebarGroup>

    <!-- Settings section -->
    <Sidebar.SidebarGroup>
      <Sidebar.SidebarGroupLabel>{$LL.nav.settings()}</Sidebar.SidebarGroupLabel>
      <Sidebar.SidebarGroupContent>
        <Sidebar.SidebarMenu>
          {#each settingsNavItems as item (item.href)}
            <Sidebar.SidebarMenuItem>
              <Sidebar.SidebarMenuButton isActive={isActive(item.href)} tooltipContent={item.title}>
                {#snippet child({ props })}
                  <a href={item.href} {...props}>
                    <item.icon />
                    <span>{item.title}</span>
                  </a>
                {/snippet}
              </Sidebar.SidebarMenuButton>
            </Sidebar.SidebarMenuItem>
          {/each}
        </Sidebar.SidebarMenu>
      </Sidebar.SidebarGroupContent>
    </Sidebar.SidebarGroup>

    <!-- Admin section (only visible if isAdmin) -->
    {#if user.isAdmin}
      <Sidebar.SidebarGroup>
        <Sidebar.SidebarGroupLabel>{$LL.nav.admin.title()}</Sidebar.SidebarGroupLabel>
        <Sidebar.SidebarGroupContent>
          <Sidebar.SidebarMenu>
            {#each adminNavItems as item (item.href)}
              <Sidebar.SidebarMenuItem>
                <Sidebar.SidebarMenuButton isActive={isActive(item.href)} tooltipContent={item.title}>
                  {#snippet child({ props })}
                    <a href={item.href} {...props}>
                      <item.icon />
                      <span>{item.title}</span>
                    </a>
                  {/snippet}
                </Sidebar.SidebarMenuButton>
              </Sidebar.SidebarMenuItem>
            {/each}
          </Sidebar.SidebarMenu>
        </Sidebar.SidebarGroupContent>
      </Sidebar.SidebarGroup>
    {/if}
  </Sidebar.SidebarContent>

  <Sidebar.SidebarFooter>
    <Sidebar.SidebarMenu>
      <!-- Language toggle -->
      <Sidebar.SidebarMenuItem>
        <div class="flex items-center gap-2 px-2 py-1.5">
          <Languages class="size-4 text-muted-foreground" />
          <ToggleGroup.Root type="single" value={$locale} class="justify-start" data-sveltekit-reload>
            <ToggleGroup.Item value="fi" class="h-7 px-2 text-xs">
              {#snippet child({ props })}
                <a {...props} href={languageHref("fi")}>FI</a>
              {/snippet}
            </ToggleGroup.Item>
            <ToggleGroup.Item value="en" class="h-7 px-2 text-xs">
              {#snippet child({ props })}
                <a {...props} href={languageHref("en")}>EN</a>
              {/snippet}
            </ToggleGroup.Item>
          </ToggleGroup.Root>
        </div>
      </Sidebar.SidebarMenuItem>

      <!-- User info -->
      <Sidebar.SidebarMenuItem>
        <Sidebar.SidebarMenuButton tooltipContent={displayName}>
          <User />
          <span class="truncate">{displayName}</span>
        </Sidebar.SidebarMenuButton>
      </Sidebar.SidebarMenuItem>

      <!-- Sign out -->
      <Sidebar.SidebarMenuItem>
        <form class="contents" {...signOut}>
          <Sidebar.SidebarMenuButton tooltipContent={$LL.nav.signOut()}>
            {#snippet child({ props })}
              <button {...props} type="submit">
                <LogOut />
                <span>{$LL.nav.signOut()}</span>
              </button>
            {/snippet}
          </Sidebar.SidebarMenuButton>
        </form>
      </Sidebar.SidebarMenuItem>
    </Sidebar.SidebarMenu>
  </Sidebar.SidebarFooter>
</Sidebar.Sidebar>
