import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput, colors, handFont, shadow } from "./theme";
import { api } from "./api";
import { labelOf, renameCategoryEverywhere, useCategories } from "./categories";
import { confirmDestructive } from "./confirm";
import { displayTitle } from "./text";
import { fetchCategoryCounts, platformLabel, setCategory } from "./lifecycle";
import { searchSaves, type SearchResult } from "./search";
import { ActionSheet } from "./components/ActionSheet";
import { CategoryPicker } from "./components/CategoryPicker";
import { SaveCard } from "./components/SaveCard";
import { TextPromptModal } from "./components/TextPromptModal";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import { cancelLocalReminder } from "./reminders/notifications";
import { cancelSaveReminder, upsertSaveReminder } from "./reminders/sync";
import type { CategoryKey, Save } from "./types";
import { LIBRARY_STATUSES } from "./types";

/**
 * Kept is grouped by the same categories the user confirms while sorting,
 * so a save lands where they put it. Saves without one sit under "other".
 */
type Location = { kind: "root" } | { kind: "category"; key: CategoryKey };

type Props = {
  onOpenSave: (saveId: string) => void;
};

export function LibraryScreen({ onOpenSave }: Props) {
  const categories = useCategories();
  const [location, setLocation] = useState<Location>({ kind: "root" });
  const [counts, setCounts] = useState<Partial<Record<CategoryKey, number>>>({});
  const [saves, setSaves] = useState<Save[]>([]);
  const [recent, setRecent] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saveSheet, setSaveSheet] = useState<Save | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [categoryPicker, setCategoryPicker] = useState(false);
  const [reminderSave, setReminderSave] = useState<Save | null>(null);

  // Search lives at the top of Kept; results replace the categories until cleared.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function runSearch() {
    const term = query.trim();
    if (!term) return;
    setSearching(true);
    setError(null);
    try {
      setResults(await searchSaves(term));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  function clearSearch() {
    setQuery("");
    setResults(null);
  }

  const refresh = useCallback(async () => {
    setError(null);
    try {
      if (location.kind === "root") {
        const [countRes, recentRes] = await Promise.all([
          fetchCategoryCounts(LIBRARY_STATUSES),
          api<{ items: Save[] }>(`/saves?status=${LIBRARY_STATUSES}`),
        ]);
        setCounts(countRes.counts);
        setRecent(recentRes.items.slice(0, 8));
        setSaves([]);
      } else {
        const res = await api<{ items: Save[] }>(
          `/saves?category=${location.key}&status=${LIBRARY_STATUSES}`,
        );
        setSaves(res.items);
        setRecent([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load your saves");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  async function renameCurrent(label: string) {
    if (location.kind !== "category") return;
    setBusy(true);
    setError(null);
    try {
      await renameCategoryEverywhere(location.key, label);
      setRenaming(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function moveToCategory(key: CategoryKey) {
    if (!saveSheet) return;
    setBusy(true);
    setError(null);
    try {
      await setCategory(saveSheet.id, key);
      setCategoryPicker(false);
      setSaveSheet(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change category");
    } finally {
      setBusy(false);
    }
  }

  async function patchSave(id: string, body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      await api(`/saves/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSaveSheet(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update save");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteSave(save: Save) {
    confirmDestructive(
      "Delete this save?",
      "This cannot be undone.",
      "Delete",
      () => void deleteSave(save),
    );
  }

  async function deleteSave(save: Save) {
    setBusy(true);
    setError(null);
    try {
      await cancelLocalReminder(save.id);
      await api(`/saves/${save.id}`, { method: "DELETE" });
      setSaveSheet(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete save");
    } finally {
      setBusy(false);
    }
  }

  const heading = location.kind === "category" ? labelOf(categories, location.key) : "";

  if (loading && recent.length === 0 && saves.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {location.kind === "root" ? (
        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            placeholder="Search how you'd remember it"
            placeholderTextColor={colors.faint}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void runSearch()}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search your saves"
          />
          {results !== null ? (
            <Pressable style={styles.pill} onPress={clearSearch}>
              <Text style={styles.pillText}>Clear</Text>
            </Pressable>
          ) : (
            <Pressable
              style={[styles.pill, styles.pillSolid, !query.trim() && styles.disabled]}
              onPress={() => void runSearch()}
              disabled={!query.trim() || searching}
            >
              <Text style={[styles.pillText, styles.pillSolidText]}>
                {searching ? "…" : "Search"}
              </Text>
            </Pressable>
          )}
        </View>
      ) : null}

      {results !== null ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.section}>RESULTS FOR “{query.trim()}”</Text>
          {searching ? <ActivityIndicator color={colors.accent} style={{ marginTop: 16 }} /> : null}
          {!searching && results.length === 0 ? (
            <Text style={styles.empty}>
              No matches. Try words from your note or takeaway, like “Tokyo” or “cheap dinner”.
            </Text>
          ) : null}
          {results.map((item) => (
            <Pressable
              key={item.save_id}
              style={styles.result}
              onPress={() => onOpenSave(item.save_id)}
            >
              <Text style={styles.resultMeta}>
                {platformLabel(item.platform)}
                {item.folder_path ? ` · ${item.folder_path}` : ""}
                {item.has_reminder ? " · reminder" : ""}
              </Text>
              <Text style={styles.resultTitle} numberOfLines={2}>
                {displayTitle(item)}
              </Text>
              <Text style={styles.resultSnippet} numberOfLines={3}>
                <Text style={styles.resultField}>{item.match_field}: </Text>
                {item.match_snippet}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <>
          <View style={styles.nav}>
            {location.kind !== "root" ? (
              <Pressable style={styles.pill} onPress={() => setLocation({ kind: "root" })}>
                <Text style={styles.pillText}>← Back</Text>
              </Pressable>
            ) : (
              <Text style={styles.section}>YOUR CATEGORIES</Text>
            )}
            {location.kind === "category" ? (
              <Pressable style={styles.pill} onPress={() => setRenaming(true)}>
                <Text style={styles.pillText}>Rename</Text>
              </Pressable>
            ) : null}
          </View>
          {location.kind !== "root" ? (
            <Text style={styles.heading}>{heading}</Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView contentContainerStyle={styles.scroll}>
            {location.kind === "root"
              ? categories.map((c) => {
                  const n = counts[c.key] ?? 0;
                  return (
                    <Pressable
                      key={c.key}
                      style={styles.folderRow}
                      onPress={() => setLocation({ kind: "category", key: c.key })}
                      accessibilityRole="button"
                      accessibilityLabel={`${c.label}, ${n} saved`}
                    >
                      <Text
                        style={[styles.folderName, n === 0 && styles.folderEmpty]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                      <Text style={styles.folderCount}>{n || ""}</Text>
                      <Text style={styles.folderMeta}>›</Text>
                    </Pressable>
                  );
                })
              : null}

            {location.kind === "root" ? (
              <>
                <Text style={[styles.section, styles.sectionGap]}>RECENT</Text>
                {recent.length === 0 ? (
                  <Text style={styles.empty}>
                    What you plan, distill or do shows up here.
                  </Text>
                ) : (
                  recent.map((s) => (
                    <SaveCard
                      key={s.id}
                      save={s}
                      tag={labelOf(categories, s.category ?? "other")}
                      onPress={() => onOpenSave(s.id)}
                      onLongPress={() => setSaveSheet(s)}
                    />
                  ))
                )}
              </>
            ) : saves.length === 0 ? (
              <Text style={styles.empty}>
                Nothing here yet. Saves you keep as {heading} while sorting land here.
              </Text>
            ) : (
              saves.map((s) => (
                <SaveCard
                  key={s.id}
                  save={s}
                  onPress={() => onOpenSave(s.id)}
                  onLongPress={() => setSaveSheet(s)}
                />
              ))
            )}
          </ScrollView>
        </>
      )}

      <ActionSheet
        visible={saveSheet !== null && !categoryPicker && reminderSave === null}
        title={saveSheet ? displayTitle(saveSheet) : "Save"}
        actions={[
          { id: "category", label: "Change category" },
          { id: "note", label: "Edit note" },
          {
            id: "reminder",
            label: saveSheet?.has_reminder ? "Change reminder" : "Add reminder",
          },
          ...(saveSheet?.status !== "done"
            ? [{ id: "done", label: "Mark Done" }]
            : []),
          { id: "archive", label: "Archive" },
          { id: "delete", label: "Delete", destructive: true },
        ]}
        onClose={() => setSaveSheet(null)}
        onSelect={(id) => {
          if (!saveSheet) return;
          if (id === "category") setCategoryPicker(true);
          if (id === "note") {
            const idToOpen = saveSheet.id;
            setSaveSheet(null);
            onOpenSave(idToOpen);
          }
          if (id === "reminder") setReminderSave(saveSheet);
          if (id === "done") void patchSave(saveSheet.id, { status: "done" });
          if (id === "archive") void patchSave(saveSheet.id, { status: "archived" });
          if (id === "delete") confirmDeleteSave(saveSheet);
        }}
      />

      <CategoryPicker
        visible={categoryPicker}
        selected={saveSheet?.category ?? "other"}
        onPick={(key) => void moveToCategory(key)}
        onClose={() => {
          setCategoryPicker(false);
          setSaveSheet(null);
        }}
      />

      <TextPromptModal
        visible={renaming}
        title={`Rename "${heading}"`}
        initialValue={heading}
        busy={busy}
        onCancel={() => setRenaming(false)}
        onSubmit={(label) => void renameCurrent(label)}
      />

      <ReminderPickerModal
        visible={reminderSave !== null}
        initialDate={
          reminderSave?.reminder_fire_at
            ? new Date(reminderSave.reminder_fire_at)
            : null
        }
        allowClear={Boolean(reminderSave?.has_reminder)}
        busy={busy}
        onClose={() => {
          setReminderSave(null);
          setSaveSheet(null);
        }}
        onSave={(date) => {
          if (!reminderSave) return;
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await upsertSaveReminder({
                saveId: reminderSave.id,
                title: reminderSave.title || reminderSave.source_url || "Saved item",
                body: reminderSave.understand_snippet,
                fireAt: date,
              });
              setReminderSave(null);
              setSaveSheet(null);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not set reminder");
            } finally {
              setBusy(false);
            }
          })();
        }}
        onClear={() => {
          if (!reminderSave) return;
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await cancelSaveReminder(reminderSave.id);
              setReminderSave(null);
              setSaveSheet(null);
              await refresh();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not remove reminder");
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 18 },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.ink,
    fontSize: 18,
    fontWeight: "300",
    color: colors.ink,
  },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: "center",
  },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  pillSolid: { backgroundColor: colors.ink },
  pillSolidText: { color: "#FFFFFF" },
  disabled: { opacity: 0.4 },
  heading: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "300",
    letterSpacing: -0.9,
    color: colors.ink,
  },
  error: { color: colors.danger, marginBottom: 8 },
  scroll: { paddingBottom: 120 },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderTopWidth: 1.5,
    borderTopColor: colors.ink,
  },
  folderName: {
    flex: 1,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "300",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  folderCount: { fontFamily: handFont, fontSize: 20, color: colors.orangeDeep },
  folderMeta: { fontSize: 18, color: colors.faint },
  folderEmpty: { color: colors.faint },
  section: { fontSize: 12, fontWeight: "600", letterSpacing: 1, color: colors.muted },
  sectionGap: { marginTop: 26, marginBottom: 12 },
  empty: { fontSize: 15, lineHeight: 22, fontWeight: "300", color: colors.inkSoft, marginTop: 8 },
  result: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    marginTop: 12,
    ...shadow,
  },
  resultMeta: { fontSize: 12, fontWeight: "600", color: colors.muted },
  resultTitle: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: "700", color: colors.ink },
  resultSnippet: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "300", color: colors.inkSoft },
  resultField: { fontFamily: handFont, fontSize: 16, color: colors.orangeDeep },
});
