import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { renameCategoryEverywhere, useCategories } from "../categories";
import { Text, colors } from "../theme";
import type { Category, CategoryKey } from "../types";
import { TextPromptModal } from "./TextPromptModal";

type Props = {
  visible: boolean;
  selected: CategoryKey | null | undefined;
  onPick: (key: CategoryKey) => void;
  onClose: () => void;
};

/** Pick a save's category, or rename categories to your own words. */
export function CategoryPicker({ visible, selected, onPick, onClose }: Props) {
  const categories = useCategories();
  const [renaming, setRenaming] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function rename(value: string) {
    if (!editing) return;
    setError(null);
    try {
      await renameCategoryEverywhere(editing.key, value);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't rename");
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.headRow}>
          <Text style={styles.title}>{renaming ? "Rename categories" : "What is this?"}</Text>
          <Pressable
            style={styles.modeBtn}
            onPress={() => setRenaming((r) => !r)}
            accessibilityRole="button"
          >
            <Text style={styles.modeText}>{renaming ? "Done" : "Rename"}</Text>
          </Pressable>
        </View>
        <Text style={styles.sub}>
          {renaming
            ? "Tap one to call it what you like. The rules stay the same."
            : "Places stay until you're there. Events fade after the day. Everything else gets 7 days."}
        </Text>

        <View style={styles.grid}>
          {categories.map((c) => {
            const on = !renaming && c.key === selected;
            return (
              <Pressable
                key={c.key}
                style={[styles.chip, on && styles.chipOn]}
                onPress={() => (renaming ? setEditing(c) : onPick(c.key))}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {renaming ? `${c.label} ✎` : c.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>

      <TextPromptModal
        visible={editing !== null}
        title={`Rename "${editing?.label ?? ""}"`}
        placeholder={editing?.default_label}
        initialValue={editing?.label ?? ""}
        onCancel={() => setEditing(null)}
        onSubmit={(value) => void rename(value)}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(28,20,16,0.35)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
    marginBottom: 14,
  },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 24, fontWeight: "300", letterSpacing: -0.6, color: colors.ink },
  modeBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    justifyContent: "center",
  },
  modeText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  sub: { marginTop: 6, fontSize: 13, lineHeight: 18, color: colors.muted },
  grid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.ink },
  chipText: { fontSize: 15, fontWeight: "600", color: colors.ink },
  chipTextOn: { color: "#FDF0DE" },
  error: { marginTop: 12, color: colors.danger, fontSize: 14 },
});
