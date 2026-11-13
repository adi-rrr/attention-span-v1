import { useEffect, useState } from "react";
import { fetchCategories, renameCategory } from "./lifecycle";
import type { Category, CategoryKey } from "./types";

/** Defaults until the user's own labels load (and if they never do). */
const DEFAULTS: Category[] = (
  [
    ["place", "Place"],
    ["recipe", "Recipe"],
    ["watch", "Watch"],
    ["read", "Read"],
    ["learn", "Learn"],
    ["tool", "Tool"],
    ["buy", "Buy"],
    ["routine", "Routine"],
    ["quote", "Quote"],
    ["meme", "Meme"],
    ["event", "Event"],
    ["other", "Other"],
  ] as const
).map(([key, label]) => ({ key, label, default_label: label }));

// One shared copy, so a rename shows up on every screen at once.
let current: Category[] = DEFAULTS;
let loaded = false;
const listeners = new Set<(c: Category[]) => void>();

function publish(next: Category[]) {
  current = next;
  for (const l of listeners) l(next);
}

/** The user's categories with their own labels. Loads once per app run. */
export function useCategories(): Category[] {
  const [categories, setCategories] = useState(current);
  useEffect(() => {
    listeners.add(setCategories);
    if (!loaded) {
      loaded = true;
      void fetchCategories()
        .then((r) => publish(r.items))
        .catch(() => {
          loaded = false;
        });
    }
    return () => {
      listeners.delete(setCategories);
    };
  }, []);
  return categories;
}

export function labelOf(categories: Category[], key: CategoryKey | null | undefined): string {
  if (!key) return "Uncategorized";
  return categories.find((c) => c.key === key)?.label ?? key;
}

/** Rename for this user; an empty label resets to the default. */
export async function renameCategoryEverywhere(key: CategoryKey, label: string) {
  const res = await renameCategory(key, label);
  publish(res.items);
}
