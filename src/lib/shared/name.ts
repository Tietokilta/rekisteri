import * as v from "valibot";

/** Collapses newlines and other whitespace runs to single spaces, so a name always stays on one line. */
export function singleLine(text: string) {
  return text.replaceAll(/\s+/g, " ").trim();
}

export const nameSchema = v.pipe(v.string(), v.transform(singleLine));
