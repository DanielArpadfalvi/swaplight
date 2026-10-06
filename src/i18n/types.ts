/** Plural forms of a message. `other` is required; `one` falls back to `other`. */
export interface PluralForms {
  one?: string;
  other: string;
}

/** A dictionary shaped like `T` (the English source) with string / plural leaves. */
export type DictionaryOf<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends { other: string }
      ? PluralForms
      : DictionaryOf<T[K]>;
};

/** Dot-separated paths to every leaf of `T`, e.g. `"menu.run"`. */
export type LeafPaths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | { other: string }
    ? `${P}${K}`
    : LeafPaths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type TranslationParams = Record<string, string | number>;
