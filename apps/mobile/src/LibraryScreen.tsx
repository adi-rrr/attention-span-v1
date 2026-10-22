import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "./theme";
import { api } from "./api";
import { confirmDestructive } from "./confirm";
import { displayTitle } from "./text";
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
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.nav}>
        {location.kind !== "root" ? (
          <Pressable
            onPress={() =>
              setLocation(
                location.kind === "folder" && currentFolder?.parent_id
                  ? { kind: "folder", id: currentFolder.parent_id }
                  : { kind: "root" },
              )
            }
          >
            <Text style={styles.back}>← Back</Text>
          </Pressable>
        ) : (
          <Text style={styles.navTitle}>{heading}</Text>
        )}
        <View style={styles.navActions}>
          {location.kind === "folder" && currentFolder ? (
            <Pressable onPress={() => setFolderSheet(currentFolder)}>
              <Text style={styles.navBtn}>⚙</Text>
            </Pressable>
          ) : null}
          {canAddSubfolder ? (
            <Pressable onPress={() => setPrompt("create")}>
              <Text style={styles.navBtn}>+</Text>
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
            <Text style={styles.folderName}>📁  {f.name}</Text>
            <Text style={styles.folderMeta}>
              {f.save_count ? `${f.save_count}  ` : ""}›
            </Text>
          </Pressable>
        ))}

        {location.kind === "root" ? (
          <Pressable
            style={styles.folderRow}
            onPress={() => setLocation({ kind: "uncategorized" })}
          >
            <Text style={styles.folderName}>📁  Uncategorized</Text>
            <Text style={styles.folderMeta}>
              {uncategorizedCount ? `${uncategorizedCount}  ` : ""}›
            </Text>
          </Pressable>
        ) : null}

        {location.kind === "root" ? (
          <>
            <Text style={styles.section}>Recent</Text>
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
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  navTitle: { fontSize: 18, fontWeight: "700", color: "#1E1B3A" },
  back: { fontSize: 16, color: "#1E1B3A", fontWeight: "600" },
  navActions: { flexDirection: "row", gap: 16, alignItems: "center" },
  navBtn: { fontSize: 22, color: "#1E1B3A", fontWeight: "600" },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E1B3A",
    marginBottom: 2,
  },
  path: { fontSize: 13, color: "#5D5A7A", marginBottom: 8 },
  error: { color: "#C2364A", marginBottom: 8 },
  scroll: { paddingBottom: 32 },
  folderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 18,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#E7E8FA",
  },
  folderName: { fontSize: 16, fontWeight: "600", color: "#1E1B3A", flex: 1 },
  folderMeta: { fontSize: 15, color: "#6B6990" },
  section: {
    marginTop: 18,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
    color: "#5D5A7A",

  },
  empty: { fontSize: 15, lineHeight: 22, color: "#5D5A7A", marginTop: 8 },
});
