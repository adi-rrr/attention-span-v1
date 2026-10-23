import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../theme";
import type { Folder } from "../types";
import { FolderTreePicker } from "./FolderTreePicker";
import { folderBreadcrumbLabel } from "../folderTree";
import { api } from "../api";

type Props = {
  visible: boolean;
  folders: Folder[];
  title?: string;
  allowUncategorized?: boolean;
  allowRoot?: boolean;
  excludeIds?: string[];
  selectedId?: string | null;
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
  /** When set, enables create + refreshes via callback */
  onFoldersChange?: (folders: Folder[]) => void;
  /** Confirm button label */
  confirmLabel?: string;
};

export function FolderPickerModal({
  visible,
  folders,
  title = "Move to",
  allowUncategorized,
  allowRoot,
  excludeIds = [],
  selectedId = null,
  onSelect,
  onClose,
  onFoldersChange,
  confirmLabel = "Move here",
}: Props) {
  const [picked, setPicked] = useState<string | null>(selectedId ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setPicked(selectedId ?? null);
      setError(null);
    }
  }, [visible, selectedId]);

  const emptyLabel = allowRoot ? "Library (top level)" : "Uncategorized";
  const preview = folderBreadcrumbLabel(folders, picked, emptyLabel);

  async function createFolder(name: string, parentId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const folder = await api<Folder>("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parent_id: parentId }),
      });
      const next = [...folders, folder].sort((a, b) =>
        a.path.localeCompare(b.path),
      );
      onFoldersChange?.(next);
      setPicked(folder.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.preview} numberOfLines={2}>
            {preview}
          </Text>

          <FolderTreePicker
            folders={folders}
            selectedId={picked}
            allowUncategorized={allowUncategorized}
            allowRoot={allowRoot}
            excludeIds={excludeIds}
            onSelect={setPicked}
            onCreateFolder={
              onFoldersChange
                ? (name, parentId) => createFolder(name, parentId)
                : undefined
            }
            busy={busy}
            maxListHeight={300}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={onClose}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primary, busy && styles.disabled]}
              onPress={() => onSelect(picked)}
              disabled={busy}
            >
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 23, 20, 0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    maxHeight: "80%",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1C1410",
    marginBottom: 6,
  },
  preview: { fontSize: 14, color: "#6B5A50", marginBottom: 12 },
  error: { color: "#B3261E", marginTop: 8 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 14,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    minWidth: 96,
    alignItems: "center",
  },
  ghost: { backgroundColor: "#E6DFD5" },
  ghostText: { color: "#1C1410", fontWeight: "600" },
  primary: { backgroundColor: "#1C1410" },
  primaryText: { color: "#FFF", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
