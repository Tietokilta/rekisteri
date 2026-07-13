<script lang="ts">
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";
  import { page } from "$app/state";
  import LanguageToggle from "$lib/components/language-toggle.svelte";
  import { LL, locale } from "$lib/i18n/i18n-svelte";
  import { route } from "$lib/ROUTES";
  import { signOut } from "$lib/api/auth.remote";
  import { getMainNavItems, getSettingsNavItems, getAdminNavItems, type NavItem } from "$lib/navigation";
  import { formatFullName } from "$lib/utils";
  import { hasAdminAccess, type AdminRole } from "$lib/shared/enums";

  // Icons from @lucide/svelte
  import User from "@lucide/svelte/icons/user";
  import LogOut from "@lucide/svelte/icons/log-out";
  import Languages from "@lucide/svelte/icons/languages";

  interface Props {
    user: {
      email: string;
      firstNames?: string | null;
      lastName?: string | null;
      adminRole: AdminRole;
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

  // Get user display name
  const displayName = $derived(formatFullName(user, user.email));

  const logoUrl = $derived(page.data.customizations.logoUrl ?? page.data.customizations.logoDarkUrl);
  const logoDarkUrl = $derived(page.data.customizations.logoDarkUrl ?? page.data.customizations.logoUrl);
</script>

{#snippet navigationMenu(items: NavItem[])}
  <Sidebar.SidebarMenu>
    {#each items as item (item.href)}
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
{/snippet}

<Sidebar.Sidebar>
  <!-- Header with logo -->
  <Sidebar.SidebarHeader>
    <Sidebar.SidebarMenu>
      <Sidebar.SidebarMenuItem>
        <Sidebar.SidebarMenuButton size="lg" tooltipContent={page.data.customizations.appName[$locale]}>
          {#snippet child({ props })}
            <a href={route("/[locale=locale]", { locale: $locale })} {...props}>
              {#if logoUrl || logoDarkUrl}
                <img src={logoUrl} alt="App logo" class="size-8 dark:hidden" />
                <img src={logoDarkUrl} alt="App logo" class="hidden size-8 dark:block" />
              {/if}
              <div class="flex flex-col gap-0.5 leading-none">
                <span class="font-mono font-semibold">{page.data.customizations.appName[$locale]}</span>
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
        {@render navigationMenu(mainNavItems)}
      </Sidebar.SidebarGroupContent>
    </Sidebar.SidebarGroup>

    <!-- Settings section -->
    <Sidebar.SidebarGroup>
      <Sidebar.SidebarGroupLabel>{$LL.nav.settings()}</Sidebar.SidebarGroupLabel>
      <Sidebar.SidebarGroupContent>
        {@render navigationMenu(settingsNavItems)}
      </Sidebar.SidebarGroupContent>
    </Sidebar.SidebarGroup>

    <!-- Admin section (only visible for admin or readonly admin) -->
    {#if hasAdminAccess(user.adminRole)}
      <Sidebar.SidebarGroup>
        <Sidebar.SidebarGroupLabel>{$LL.nav.admin.title()}</Sidebar.SidebarGroupLabel>
        <Sidebar.SidebarGroupContent>
          {@render navigationMenu(adminNavItems)}
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
          <LanguageToggle class="justify-start" itemClass="h-7 px-2 text-xs" />
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
