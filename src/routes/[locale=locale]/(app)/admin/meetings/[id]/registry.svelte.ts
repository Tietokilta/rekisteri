export type RegistryUser = {
  id: string;
  email: string;
  firstNames: string | null;
  lastName: string | null;
  membershipTypeId: string | null;
};

/**
 * Every registry user, searched in memory by the check-in search and the attendee editor.
 * Reloading (e.g. on window focus) picks up people registered in another tab; a failed reload
 * keeps the previous list.
 */
export class Registry {
  users = $state.raw<RegistryUser[]>([]);
  status = $state<"loading" | "ready" | "error">("loading");

  #url: string;

  constructor(url: string) {
    this.#url = url;
  }

  async load() {
    try {
      const response = await fetch(this.#url);
      if (!response.ok) throw new Error(response.statusText);
      this.users = await response.json();
      this.status = "ready";
    } catch {
      if (this.status !== "ready") this.status = "error";
    }
  }
}
