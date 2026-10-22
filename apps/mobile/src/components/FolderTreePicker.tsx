import { useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "../theme";
import type { Folder } from "../types";
import {
  childrenOf,
  createParentId,
  folderBreadcrumbLabel,
  folderById,
} from "../folderTree";

type Props = {
  folders: Folder[];
  selectedId?: string | null;
  onSelect: (folderId: string | null) => void;
  /** Saves: null = Uncategorized */
  allowUncategorized?: boolean;
  /** Move folder: null = Library top level */
  allowRoot?: boolean;
  excludeIds?: string[];
  /** Create folder; parentId null = root. Omit to hide create UI. */
  onCreateFolder?: (name: string, parentId: string | null) => Promise<void> | void;
  busy?: boolean;
  maxDepth?: number;
  /** Cap list height when embedded in a modal */
  maxListHeight?: number;
};

type VisibleRow = {
  folder: Folder;
  depth: number;
  hasChildren: boolean;
};

function buildVisibleRows(
  folders: Folder[],
  expanded: Set<string>,
  exclude: Set<string>,
): VisibleRow[] {
  const rows: VisibleRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const folder of childrenOf(folders, parentId)) {
      if (exclude.has(folder.id)) continue;
      const kids = childrenOf(folders, folder.id).filter(
        (c) => !exclude.has(c.id),
      );
      rows.push({
        folder,
        depth,
        hasChildren: kids.length > 0,
      });
      if (expanded.has(folder.id) && kids.length > 0) {
        walk(folder.id, depth + 1);
      }
    }
  };
  walk(null, 0);
  return rows;
}

export function FolderTreePicker({
  folders,
  selectedId = null,
  onSelect,
  allowUncategorized,
  allowRoot,
  excludeIds = [],
  onCreateFolder,
  busy,
  maxDepth = 5,
  maxListHeight = 280,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const exclude = useMemo(() => new Set(excludeIds), [excludeIds]);
  const visible = useMemo(
    () => buildVisibleRows(folders, expanded, exclude),
    [folders, expanded, exclude],
  );

  const parentForCreate = createParentId(folders, selectedId, maxDepth);
  const selectedFolder = folderById(folders, selectedId);
  const createHint =
    parentForCreate === false
      ? `Max depth (${maxDepth}) — pick a higher folder`
      : parentForCreate == null
        ? "New folder at top level"
        : `New subfolder under ${selectedFolder?.name ?? "…"}`;

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!onCreateFolder || !newName.trim() || parentForCreate === false) return;
    setCreating(true);
    try {
      await onCreateFolder(newName.trim(), parentForCreate);
      setNewName("");
      if (parentForCreate) {
        setExpanded((prev) => new Set(prev).add(parentForCreate));
      }
    } finally {
      setCreating(false);
    }
  }

  const nullSelected =
    selectedId === null || selectedId === undefined;

  return (
    <View>
      <ScrollView
        style={{ maxHeight: maxListHeight }}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >
        {allowRoot ? (
          <Pressable
            style={[styles.row, nullSelected && styles.rowOn]}
            onPress={() => onSelect(null)}
          >
            <View style={styles.chevronSlot} />
            <Text style={styles.rowText}>Library (top level)</Text>
          </Pressable>
        ) : null}

        {allowUncategorized ? (
          <Pressable
            style={[styles.row, nullSelected && styles.rowOn]}
            onPress={() => onSelect(null)}
          >
            <View style={styles.chevronSlot} />
            <Text style={styles.rowText}>Uncategorized</Text>
          </Pressable>
        ) : null}

        {visible.map(({ folder, depth, hasChildren }) => {
          const isOpen = expanded.has(folder.id);
          const isSelected = selectedId === folder.id;
          return (
            <View
              key={folder.id}
              style={[
                styles.row,
                isSelected && styles.rowOn,
                { paddingLeft: 8 + depth * 16 },
              ]}
            >
              {hasChildren ? (
                <Pressable
                  style={styles.chevronHit}
                  onPress={() => toggleExpand(folder.id)}
                  hitSlop={8}
                >
                  <Text style={styles.chevron}>{isOpen ? "▾" : "▸"}</Text>
                </Pressable>
              ) : (
                <View style={styles.chevronSlot} />
              )}
              <Pressable
                style={styles.nameHit}
                onPress={() => onSelect(folder.id)}
              >
                <Text style={styles.rowText}>{folder.name}</Text>
              </Pressable>
            </View>
          );
        })}
      </ScrollView>

      {onCreateFolder ? (
        <View style={styles.createBlock}>
          <Text style={styles.createHint}>{createHint}</Text>
          <View style={styles.createRow}>
            <TextInput
              style={styles.input}
              placeholder="Folder name"
              placeholderTextColor="#6B6990"
              value={newName}
              onChangeText={setNewName}
              editable={!busy && !creating && parentForCreate !== false}
            />
            <Pressable
              style={[
                styles.addBtn,
                (!newName.trim() ||
                  busy ||
                  creating ||
                  parentForCreate === false) &&
                  styles.addBtnDisabled,
              ]}
              onPress={() => void handleCreate()}
              disabled={
                !newName.trim() ||
                busy ||
                creating ||
                parentForCreate === false
              }
            >
              <Text style={styles.addBtnText}>
                {creating ? "…" : "Add"}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Closed trigger that expands an inline tree (Understand complete screen). */
type DropdownProps = {
  folders: Folder[];
  selectedId: string | null;
  onSelect: (folderId: string | null) => void;
  onCreateFolder?: (name: string, parentId: string | null) => Promise<void> | void;
  busy?: boolean;
  placeholder?: string;
};

export function FolderDropdown({
  folders,
  selectedId,
  onSelect,
  onCreateFolder,
  busy,
  placeholder = "Uncategorized",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const label = folderBreadcrumbLabel(folders, selectedId, placeholder);

  return (
    <View>
      <Pressable
        style={[styles.trigger, open && styles.triggerOpen]}
        onPress={() => setOpen((v) => !v)}
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.triggerChevron}>{open ? "▴" : "▾"}</Text>
      </Pressable>

      {open ? (
        <View style={styles.panel}>
          <FolderTreePicker
            folders={folders}
            selectedId={selectedId}
            allowUncategorized
            onSelect={onSelect}
            onCreateFolder={onCreateFolder}
            busy={busy}
            maxListHeight={240}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingRight: 10,
    borderRadius: 14,
    marginBottom: 2,
  },
  rowOn: { backgroundColor: "#E7E8FA" },
  chevronSlot: { width: 28, alignItems: "center" },
  chevronHit: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  chevron: { fontSize: 14, color: "#5D5A7A", fontWeight: "700" },
  nameHit: { flex: 1, paddingVertical: 4 },
  rowText: { fontSize: 16, color: "#1E1B3A" },
  createBlock: { marginTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#D6D8F0", paddingTop: 12 },
  createHint: { fontSize: 12, color: "#5D5A7A", marginBottom: 8 },
  createRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#D6D8F0",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFF",
    fontSize: 16,
    color: "#1E1B3A",
  },
  addBtn: {
    backgroundColor: "#5B5BD6",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
  },
  addBtnDisabled: { opacity: 0.4 },
  addBtnText: { color: "#FFF", fontWeight: "600" },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#E7E8FA",
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  triggerOpen: { borderColor: "#5B5BD6", borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  triggerText: { flex: 1, fontSize: 16, color: "#1E1B3A", fontWeight: "500" },
  triggerChevron: { fontSize: 14, color: "#5D5A7A", marginLeft: 8 },
  panel: {
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: "#5B5BD6",
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 10,
  },
});
