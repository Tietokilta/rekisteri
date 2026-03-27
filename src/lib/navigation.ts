import { route } from "$lib/ROUTES";
import type { TranslationFunctions } from "$lib/i18n/i18n-types";
import type { Locale } from "$lib/i18n/routing";
import type { Component } from "svelte";

// Icons from @lucide/svelte
import IdCard from "@lucide/svelte/icons/id-card";
import History from "@lucide/svelte/icons/history";
import User from "@lucide/svelte/icons/user";
import Key from "@lucide/svelte/icons/key";
import Mail from "@lucide/svelte/icons/mail";
import BookUser from "@lucide/svelte/icons/book-user";
import Calendar from "@lucide/svelte/icons/calendar";
import Tag from "@lucide/svelte/icons/tag";
import UserCog from "@lucide/svelte/icons/user-cog";
import QrCode from "@lucide/svelte/icons/qr-code";
import PaintBrush from "@lucide/svelte/icons/paintbrush";

export interface NavItem {
  title: string;
  href: string;
  icon: Component;
}

export function getMainNavItems(locale: Locale, LL: TranslationFunctions): NavItem[] {
  return [
    {
      title: LL.nav.dashboard(),
      href: route("/[locale=locale]", { locale }),
      icon: IdCard,
    },
    {
      title: LL.nav.membership(),
      href: route("/[locale=locale]/membership", { locale }),
      icon: History,
    },
  ];
}

export function getSettingsNavItems(locale: Locale, LL: TranslationFunctions): NavItem[] {
  return [
    {
      title: LL.nav.profile(),
      href: route("/[locale=locale]/settings/profile", { locale }),
      icon: User,
    },
    {
      title: LL.nav.passkeys(),
      href: route("/[locale=locale]/settings/passkeys", { locale }),
      icon: Key,
    },
    {
      title: LL.nav.emails(),
      href: route("/[locale=locale]/settings/emails", { locale }),
      icon: Mail,
    },
  ];
}

export function getAdminNavItems(locale: Locale, LL: TranslationFunctions): NavItem[] {
  return [
    {
      title: LL.nav.admin.members(),
      href: route("/[locale=locale]/admin/members", { locale }),
      icon: BookUser,
    },
    {
      title: LL.nav.admin.memberships(),
      href: route("/[locale=locale]/admin/memberships", { locale }),
      icon: Calendar,
    },
    {
      title: LL.nav.admin.membershipTypes(),
      href: route("/[locale=locale]/admin/membership-types", { locale }),
      icon: Tag,
    },
    {
      title: LL.nav.admin.verifyQr(),
      href: route("/[locale=locale]/admin/verify-qr", { locale }),
      icon: QrCode,
    },
    {
      title: LL.nav.admin.users(),
      href: route("/[locale=locale]/admin/users", { locale }),
      icon: UserCog,
    },
    {
      title: LL.nav.admin.customise(),
      href: route("/[locale=locale]/admin/customise", { locale }),
      icon: PaintBrush,
    },
  ];
}
