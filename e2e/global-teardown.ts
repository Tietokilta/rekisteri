import { type FullConfig } from "@playwright/test";
import { loadContainerState, cleanupContainerState } from "./testcontainer";

async function globalTeardown(_config: FullConfig) {
  const state = loadContainerState();

  if (state) {
    console.log("✓ Stopping test container...");
    try {
      // Use docker stop directly since we only have the container ID
      const { execSync } = await import("node:child_process");
      execSync(`docker stop ${state.containerId}`, { stdio: "inherit" });
      console.log("✓ Test container stopped");
    } catch {
      // Container might already be stopped
      console.log("✓ Test container already stopped or not found");
    }

    cleanupContainerState();
    console.log("✓ Cleaned up container state");
  } else {
    console.log("✓ No container state found, nothing to clean up");
  }
}

export default globalTeardown;
