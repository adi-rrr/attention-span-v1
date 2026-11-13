import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput, colors, handFont, shadow } from "./theme";
import { api } from "./api";
import { confirmDestructive } from "./confirm";
import { displayTitle } from "./text";
import { platformLabel } from "./lifecycle";
import { searchSaves, type SearchResult } from "./search";
import { ActionSheet } from "./components/ActionSheet";
import { FolderPickerModal } from "./components/FolderPickerModal";
import { SaveCard } from "./components/SaveCard";
import { TextPromptModal } from "./components/TextPromptModal";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import { cancelLocalReminder } from "./reminders/notifications";
import { cancelSaveReminder, upsertSaveReminder } from "./reminders/sync";
import type { Folder, Save } from "./types";
import { LIBRARY_STATUSES } from "./types";

type Location =
  | { kind: "root" }
  | { kind: "uncategorized" }
  | { kind: "folder"; id: string };

type Props = {
  onOpenSave: (saveId: string) => void;
};

function selfAndDescendants(folders: Folder[], id: string): string[] {
  const ids = [id];
  const walk = (parentId: string) => {
    for (const child of folders.filter((f) => f.parent_id === parentId)) {
      ids.push(child.id);
      walk(child.id);
    }
  };
  walk(id);
  return ids;
}

export function LibraryScreen({ onOpenSave }: Props) {
  const [location, setLocation] = useState<Location>({ kind: "root" });
  const [folders, setFolders] = useState<Folder[]>([]);
  const [saves, setSaves] = useState<Save[]>([]);
  const [recent, setRecent] = useState<Save[]>([]);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [folderSheet, setFolderSheet] = useState<Folder | null>(null);
  const [saveSheet, setSaveSheet] = useState<Save | null>(null);
  const [prompt, setPrompt] = useState<null | "create" | "rename">(null);
  const [picker, setPicker] = useState<null | "move-folder" | "move-save">(null);
  const [reminderSave, setReminderSave] = useState<Save | null>(null);

  // Search lives at the top of Kept; results replace the folders until cleared.
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

  const currentFolder =
    location.kind === "folder"
      ? folders.find((f) => f.id === location.id) ?? null
      : null;

  const childFolders = useMemo(() => {
    if (location.kind === "root") {
      return folders.filter((f) => f.parent_id === null);
    }
    if (location.kind === "folder") {
      return folders.filter((f) => f.parent_id === location.id);
    }
    return [];
  }, [folders, location]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const folderRes = await api<{ items: Folder[] }>("/folders");
      setFolders(folderRes.items);

      if (location.kind === "root") {
        const [recentRes, uncRes] = await Promise.all([
          api<{ items: Save[] }>(`/saves?status=${LIBRARY_STATUSES}`),
          api<{ items: Save[] }>(
            `/saves?uncategorized=true&status=${LIBRARY_STATUSES}`,
          ),
        ]);
        setRecent(recentRes.items.slice(0, 8));
        setUncategorizedCount(uncRes.items.length);
        setSaves([]);
      } else if (location.kind === "uncategorized") {
        const res = await api<{ items: Save[] }>(
          `/saves?uncategorized=true&status=${LIBRARY_STATUSES}`,
        );
        setSaves(res.items);
        setUncategorizedCount(res.items.length);
        setRecent([]);
      } else {
        const res = await api<{ items: Save[] }>(
          `/saves?folder_id=${location.id}&status=${LIBRARY_STATUSES}`,
        );
        setSaves(res.items);
        setRecent([]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  async function createFolder(name: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/folders", {
        method: "POST",
        body: JSON.stringify({
          name,
          parent_id: location.kind === "folder" ? location.id : null,
        }),
      });
      setPrompt(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder");
    } finally {
      setBusy(false);
    }
  }

  async function renameFolder(name: string) {
    if (!folderSheet) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/folders/${folderSheet.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });
      setPrompt(null);
      setFolderSheet(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setBusy(false);
    }
  }

  async function moveFolderTo(parentId: string | null) {
    if (!folderSheet) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/folders/${folderSheet.id}`, {
        method: "PATCH",
        body: JSON.stringify({ parent_id: parentId }),
      });
      setPicker(null);
      setFolderSheet(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move folder");
    } finally {
      setBusy(false);
    }
  }

  function confirmDeleteFolder(folder: Folder) {
    confirmDestructive(
      `Delete ${folder.name}?`,
      "This deletes the folder, every subfolder, and every save inside. This cannot be undone.",
      "Delete everything",
      () => void deleteFolder(folder),
    );
  }

  async function deleteFolder(folder: Folder) {
    setBusy(true);
    setError(null);
    try {
      await api(`/folders/${folder.id}`, { method: "DELETE" });
      setFolderSheet(null);
      if (location.kind === "folder" && location.id === folder.id) {
        setLocation(
          folder.parent_id
            ? { kind: "folder", id: folder.parent_id }
            : { kind: "root" },
        );
      } else {
        await refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete folder");
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
      setPicker(null);
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

  const heading =
    location.kind === "root"
      ? "Library"
      : location.kind === "uncategorized"
        ? "Uncategorized"
        : (currentFolder?.name ?? "Folder");

  const canAddSubfolder =
    location.kind === "root" ||
    (currentFolder != null && currentFolder.depth < 5);

  if (loading && folders.length === 0) {
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
              <Pressable
                style={styles.pill}
                onPress={() =>
                  setLocation(
                    location.kind === "folder" && currentFolder?.parent_id
                      ? { kind: "folder", id: currentFolder.parent_id }
                      : { kind: "root" },
                  )
                }
              >
                <Text style={styles.pillText}>← Back</Text>
              </Pressable>
            ) : (
              <Text style={styles.section}>YOUR FOLDERS</Text>
            )}
            <View style={styles.navActions}>
              {location.kind === "folder" && currentFolder ? (
                <Pressable style={styles.pill} onPress={() => setFolderSheet(currentFolder)}>
                  <Text style={styles.pillText}>Edit</Text>
                </Pressable>
              ) : null}
              {canAddSubfolder ? (
                <Pressable style={styles.pill} onPress={() => setPrompt("create")}>
                  <Text style={styles.pillText}>+ Folder</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
          {location.kind !== "root" ? (
            <Text style={styles.heading}>{heading}</Text>
          ) : null}
          {currentFolder?.path && location.kind === "folder" ? (
            <Text style={styles.path}>{currentFolder.path}</Text>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView contentContainerStyle={styles.scroll}>
            {childFolders.map((f) => (
              <Pressable
                key={f.id}
                style={styles.folderRow}
                onPress={() => setLocation({ kind: "folder", id: f.id })}
                onLongPress={() => setFolderSheet(f)}
                delayLongPress={350}
              >
                <Text style={styles.folderName} numberOfLines={1}>{f.name}</Text>
                <Text style={styles.folderCount}>{f.save_count || ""}</Text>
                <Text style={styles.folderMeta}>›</Text>
              </Pressable>
            ))}

            {location.kind === "root" ? (
              <Pressable
                style={styles.folderRow}
                onPress={() => setLocation({ kind: "uncategorized" })}
              >
                <Text style={styles.folderName}>Uncategorized</Text>
                <Text style={styles.folderCount}>{uncategorizedCount || ""}</Text>
                <Text style={styles.folderMeta}>›</Text>
              </Pressable>
            ) : null}

            {location.kind === "root" ? (
              <>
                <Text style={[styles.section, styles.sectionGap]}>RECENT</Text>
                {recent.length === 0 ? (
                  <Text style={styles.empty}>
                    Completed reflections will show up here.
                  </Text>
                ) : (
                  recent.map((s) => (
                    <SaveCard
                      key={s.id}
                      save={s}
                      showFolderPath
                      onPress={() => onOpenSave(s.id)}
                      onLongPress={() => setSaveSheet(s)}
                    />
                  ))
                )}
              </>
            ) : saves.length === 0 && childFolders.length === 0 ? (
              <Text style={styles.empty}>Nothing in this folder yet.</Text>
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
        visible={folderSheet !== null && prompt === null && picker === null}
        title={folderSheet?.name}
        actions={[
          { id: "rename", label: "Rename" },
          { id: "move", label: "Move to another folder" },
          { id: "delete", label: "Delete folder", destructive: true },
        ]}
        onClose={() => setFolderSheet(null)}
        onSelect={(id) => {
          if (id === "rename") setPrompt("rename");
          if (id === "move") setPicker("move-folder");
          if (id === "delete" && folderSheet) {
            const folder = folderSheet;
            setFolderSheet(null);
            confirmDeleteFolder(folder);
          }
        }}
      />

      <ActionSheet
        visible={saveSheet !== null && picker === null && reminderSave === null}
        title={saveSheet ? displayTitle(saveSheet) : "Save"}
        actions={[
          { id: "move", label: "Move to folder" },
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
          if (id === "move") setPicker("move-save");
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

      <TextPromptModal
        visible={prompt === "create"}
        title={location.kind === "folder" ? "New subfolder" : "New folder"}
        placeholder="Folder name"
        confirmLabel="Create"
        busy={busy}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => void createFolder(name)}
      />

      <TextPromptModal
        visible={prompt === "rename"}
        title="Rename folder"
        initialValue={folderSheet?.name ?? ""}
        busy={busy}
        onCancel={() => setPrompt(null)}
        onSubmit={(name) => void renameFolder(name)}
      />

      <FolderPickerModal
        visible={picker === "move-folder"}
        title="Move folder under"
        folders={folders}
        allowRoot
        excludeIds={
          folderSheet ? selfAndDescendants(folders, folderSheet.id) : []
        }
        onClose={() => setPicker(null)}
        onSelect={(id) => void moveFolderTo(id)}
        onFoldersChange={setFolders}
        confirmLabel="Move here"
      />

      <FolderPickerModal
        visible={picker === "move-save"}
        title="Move save to"
        folders={folders}
        allowUncategorized
        selectedId={saveSheet?.folder_id ?? null}
        onClose={() => setPicker(null)}
        onSelect={(id) => {
          if (saveSheet) void patchSave(saveSheet.id, { folder_id: id });
        }}
        onFoldersChange={setFolders}
        confirmLabel="Move here"
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
  navActions: { flexDirection: "row", gap: 8, alignItems: "center" },
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
  path: { fontFamily: handFont, fontSize: 18, color: colors.orangeDeep, marginBottom: 8 },
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
