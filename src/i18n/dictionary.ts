import type { en } from './en';
import type { DictionaryOf, LeafPaths } from './types';

/** Shape every language dictionary must satisfy (derived from `en`). */
export type Dictionary = DictionaryOf<typeof en>;

/** Every valid translation key, e.g. `"menu.run"` or `"run.sparksAmount"`. */
export type TranslationKey = LeafPaths<typeof en>;
