import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { COUNTRY_NAME, TIMEZONE_COUNTRY } from "./data/timezoneCountry";
import { deviceTimezone } from "./reminders/format";
import type { Save } from "./types";

/**
 * "You've arrived": the phone's time zone sets itself when the user lands
 * somewhere new, so a change of country there means a trip. Checked when
 * the app opens or comes back to the foreground. Only crossing a border
 * counts; moving between cities in one country doesn't change the zone.
 */
const LAST_COUNTRY_KEY = "arrival.lastCountry";

export function currentCountry(): string | null {
  return TIMEZONE_COUNTRY[deviceTimezone()] ?? null;
}

export function countryName(code: string): string {
  return COUNTRY_NAME[code] ?? code;
}

/**
 * The country the user just arrived in, or null if they haven't moved since
 * the last check. The very first check only remembers where they are.
 */
export async function checkArrival(): Promise<string | null> {
  const now = currentCountry();
  if (!now) return null;
  const last = await AsyncStorage.getItem(LAST_COUNTRY_KEY).catch(() => null);
  if (last === now) return null;
  await AsyncStorage.setItem(LAST_COUNTRY_KEY, now).catch(() => {});
  return last ? now : null;
}

/** Place saves in a country that are still waiting for a decision. */
export function fetchPlaces(country: string) {
  return api<{ items: Save[] }>(`/places?country=${encodeURIComponent(country)}`);
}
