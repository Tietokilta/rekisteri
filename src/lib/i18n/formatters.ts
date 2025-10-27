import type { FormattersInitializer } from "typesafe-i18n";
import type { Locales, Formatters } from "./i18n-types";

export const initFormatters: FormattersInitializer<Locales, Formatters> = (locale: Locales) => {
	const formatters: Formatters = {
		// Pluralization is handled via double curly braces in translation strings
		// Syntax: '{count} {{singular|plural}}'
		// Example: '{count} {{member|members}}' or '{count} {{jäsen|jäsentä}}'
		// This uses Intl.PluralRules under the hood with 0 mapped to 'zero'
		// Add custom formatters here if needed for dates, numbers, etc.
	};

	return formatters;
};
