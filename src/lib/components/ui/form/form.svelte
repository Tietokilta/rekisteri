<script lang="ts" module>
	import type { Snippet } from "svelte";
	import type { HTMLFormAttributes } from "svelte/elements";
	import type { RemoteFormIssue as SvelteKitFormIssue } from "@sveltejs/kit";

	// Re-export the SvelteKit type
	export type FormIssue = SvelteKitFormIssue;

	/**
	 * Structural type for a RemoteForm field.
	 * We use this instead of importing the generic RemoteForm type
	 * to avoid complex generic type constraints that don't work well
	 * with a dynamic wrapper component.
	 */
	interface FormField {
		/** Call with input type and optional value to get spread props */
		as(type: string, value?: unknown): Record<string, unknown>;
		/** Get validation issues for this field */
		issues(): FormIssue[] | undefined;
	}

	/**
	 * Structural type representing a SvelteKit RemoteForm.
	 * This captures the shape we need without the complex generics.
	 *
	 * We use a loose `fields` type because RemoteForm.fields has both
	 * field accessors (e.g., `email`) and methods (e.g., `value()`, `set()`).
	 */
	interface RemoteFormLike {
		fields: {
			[key: string]: unknown;
		};
		validate(): void;
		preflight(schema: unknown): {
			enhance(callback: (opts: { submit: () => Promise<void> }) => Promise<void>): Record<string, unknown>;
		} & Record<string, unknown>;
	}

	function isFormField(value: unknown): value is FormField {
		return (
			typeof value === "object" &&
			value !== null &&
			"as" in value &&
			typeof (value as Record<string, unknown>).as === "function" &&
			"issues" in value &&
			typeof (value as Record<string, unknown>).issues === "function"
		);
	}

	export type FormHelpers = {
		/**
		 * Get input props with validation handlers attached
		 * @param fieldName - The name of the field (e.g., "email")
		 * @param type - The input type (e.g., "email", "text", "password")
		 * @param value - Optional value for hidden/preset fields
		 */
		input: (fieldName: string, type: string, value?: unknown) => Record<string, unknown>;
		/**
		 * Get validation errors for a field
		 * @param fieldName - The name of the field
		 */
		errors: (fieldName: string) => FormIssue[];
		/**
		 * Raw blur handler (for custom components that need manual attachment)
		 */
		handleBlur: () => void;
		/**
		 * Raw input handler (for custom components that need manual attachment)
		 */
		handleInput: () => void;
	};

	export type FormProps = {
		/**
		 * The remote form object from SvelteKit
		 */
		form: RemoteFormLike;
		/**
		 * The Zod/Valibot schema for validation
		 */
		schema: unknown;
		/**
		 * Optional enhance callback for form submission
		 */
		onsubmit?: (opts: { submit: () => Promise<void> }) => Promise<void>;
		/**
		 * Children snippet receives form helpers
		 */
		children: Snippet<[FormHelpers]>;
		/**
		 * Additional class names
		 */
		class?: string;
	} & Omit<HTMLFormAttributes, "children" | "class">;
</script>

<script lang="ts">
	import { cn } from "$lib/utils.js";

	let { form, schema, onsubmit, children, class: className, ...restProps }: FormProps = $props();

	// Track if form has been validated (after first blur or submit attempt)
	// "Reward early, validate late" pattern
	let hasValidated = $state(false);

	function handleBlur() {
		hasValidated = true;
		form.validate();
	}

	function handleInput() {
		// Only validate on input after initial validation
		if (hasValidated) {
			form.validate();
		}
	}

	/**
	 * Get input props with validation handlers attached
	 */
	function input(fieldName: string, type: string, value?: unknown): Record<string, unknown> {
		const field = form.fields[fieldName];
		if (!isFormField(field)) {
			console.warn(`Form field "${fieldName}" not found`);
			return { onblur: handleBlur, oninput: handleInput };
		}
		return {
			...field.as(type, value),
			onblur: handleBlur,
			oninput: handleInput,
		};
	}

	/**
	 * Get validation errors for a field
	 */
	function errors(fieldName: string): FormIssue[] {
		const field = form.fields[fieldName];
		if (!isFormField(field)) {
			return [];
		}
		return field.issues() ?? [];
	}

	// Build form attributes based on whether onsubmit is provided
	const formAttrs = $derived.by(() => {
		const preflight = form.preflight(schema);
		if (onsubmit) {
			return preflight.enhance(onsubmit);
		}
		return preflight;
	});

	const helpers: FormHelpers = {
		input,
		errors,
		handleBlur,
		handleInput,
	};
</script>

<form {...formAttrs} class={cn(className)} {...restProps}>
	{@render children(helpers)}
</form>
