<script lang="ts">
  import type { LayoutServerData } from "./$types";
  import { SidebarProvider, SidebarInset } from "$lib/components/ui/sidebar";
  import AppSidebar from "$lib/components/app-sidebar.svelte";
  import MobileNav from "$lib/components/mobile-nav.svelte";
  import Footer from "$lib/components/footer.svelte";

  let { children, data }: { children: import("svelte").Snippet; data: LayoutServerData } = $props();
</script>

<SidebarProvider>
  <AppSidebar user={data.user} />
  <SidebarInset>
    <div class="flex min-h-svh flex-col">
      <main class="flex-1">
        {@render children()}
      </main>
      <Footer />
    </div>
  </SidebarInset>
</SidebarProvider>
<!-- FAB placed outside SidebarProvider to avoid stacking context issues -->
<MobileNav user={data.user} />
