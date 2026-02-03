<script lang="ts">
	import type { Snippet } from "svelte";
	import type { LocalizedString } from "typesafe-i18n";

	interface Props {
		message: LocalizedString;
		children: Snippet<[string]>;
	}

	let { message, children }: Props = $props();

	const parts = $derived.by(() => {
		const [prefix, infix, postfix] = message.split("<>");
		// If no delimiters found, treat whole message as infix
		if (!infix && !postfix) {
			return { prefix: "", infix: prefix ?? "", postfix: "" };
		}
		return { prefix: prefix ?? "", infix: infix ?? "", postfix: postfix ?? "" };
	});
</script>

{parts.prefix}{@render children(parts.infix)}{parts.postfix}
