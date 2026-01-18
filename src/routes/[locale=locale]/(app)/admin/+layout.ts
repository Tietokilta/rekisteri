// Admin pages don't need SSR - they're not public-facing and require authentication.
// Disabling SSR also allows svelte:boundary to properly catch async component errors
// (like Stripe API failures) on the client side.
export const ssr = false;
