import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput, shadow } from "./theme";
import { api } from "./api";
import { confirmDestructive } from "./confirm";
import { displayTitle } from "./text";
import { FolderPickerModal } from "./components/FolderPickerModal";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import { formatReminderTime } from "./reminders/format";
import { cancelLocalReminder } from "./reminders/notifications";
import { cancelSaveReminder, upsertSaveReminder } from "./reminders/sync";
import type { Folder, SaveDetail } from "./types";

type Props = {
  saveId: string;
  onClose: () => void;
};

export function SaveDetailScreen({ saveId, onClose }: Props) {
  const [save, setSave] = useState<SaveDetail | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [reminderPicker, setReminderPicker] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [detail, folderRes] = await Promise.all([
        api<SaveDetail>(`/saves/${saveId}`),
        api<{ items: Folder[] }>("/folders"),
      ]);
      setSave(detail);
      setNote(detail.user_note ?? "");
      setFolders(folderRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load save");
    } finally {
      setLoading(false);
    }
  }, [saveId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function patch(body: Record<string, unknown>, thenClose = false) {
    setBusy(true);
    setError(null);
    try {
      await api(`/saves/${saveId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (thenClose) onClose();
      else await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete() {
    confirmDestructive(
      "Delete this save?",
      "This cannot be undone.",
      "Delete",
      () => {
          void (async () => {
            setBusy(true);
            try {
              await cancelLocalReminder(saveId);
              await api(`/saves/${saveId}`, { method: "DELETE" });
              onClose();
            } catch (e) {
              setError(e instanceof Error ? e.message : "Delete failed");
              setBusy(false);
            }
          })();
      },
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!save) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Not found"}</Text>
        <Pressable onPress={onClose}>
          <Text style={styles.link}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const qa = (save.qa_pairs ?? []).filter((p) => p.question || p.answer);
  const [firstAnswer, ...moreQa] = qa;

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.glow} />
      <View style={styles.nav}>
        <Pressable
          style={styles.roundBtn}
          onPress={onClose}
          accessibilityLabel="Back"
        >
          <Text style={styles.roundBtnText}>←</Text>
        </Pressable>
        {save.reminder?.fire_at ? (
          <View style={styles.whenPill}>
            <Text style={styles.whenPillText}>
              {formatReminderTime(save.reminder.fire_at)}
            </Text>
          </View>
        ) : null}
        <View style={styles.roundSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {firstAnswer?.answer ? (
          <>
            <Text style={styles.quoteLead}>You saved this because</Text>
            <Text style={styles.quote}>“{firstAnswer.answer}”</Text>
          </>
        ) : null}

        <View style={styles.saveCard}>
          <View style={styles.thumb} />
          <View style={styles.saveCardBody}>
            <Text style={styles.title} numberOfLines={3}>
              {displayTitle(save)}
            </Text>
            <Text style={styles.meta}>
              {save.platform}
              {save.content_kind ? ` · ${save.content_kind}` : ""}
              {save.status === "done" ? " · Done" : ""}
            </Text>
            <Text style={styles.meta}>
              {save.folder_path || "Uncategorized"}
            </Text>
          </View>
        </View>

        {moreQa.length > 0 ? (
          <View style={styles.qaCard}>
            {moreQa.map((p, i) => (
              <View key={`${p.question}-${i}`} style={styles.qa}>
                <Text style={styles.q}>{p.question}</Text>
                <Text style={styles.a}>{p.answer || "—"}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {save.source_url ? (
          <Pressable
            style={styles.linkBtn}
            onPress={() => void Linking.openURL(save.source_url!)}
          >
            <Text style={styles.linkBtnText}>Open original</Text>
          </Pressable>
        ) : null}

        <Text style={styles.section}>Note</Text>
        <TextInput
          style={styles.note}
          value={note}
          onChangeText={setNote}
          placeholder="Add a note…"
          placeholderTextColor="#6B6990"
          multiline
        />
        <Pressable
          style={[styles.btn, styles.btnGhost, busy && styles.disabled]}
          onPress={() => void patch({ user_note: note.trim() || null })}
          disabled={busy}
        >
          <Text style={styles.btnGhostText}>Save note</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => setPicker(true)}
        >
          <Text style={styles.btnGhostText}>Move to folder</Text>
        </Pressable>

        <Text style={styles.section}>Reminder</Text>
        <Text style={styles.meta}>
          {save.reminder?.fire_at
            ? formatReminderTime(save.reminder.fire_at)
            : "None"}
        </Text>
        <Pressable
          style={[styles.btn, styles.btnGhost, busy && styles.disabled]}
          onPress={() => setReminderPicker(true)}
          disabled={busy}
        >
          <Text style={styles.btnGhostText}>
            {save.reminder ? "Change reminder" : "Add reminder"}
          </Text>
        </Pressable>

        {save.status !== "done" ? (
          <Pressable
            style={[styles.btn, styles.btnPrimary, busy && styles.disabled]}
            onPress={() => void patch({ status: "done" })}
            disabled={busy}
          >
            <Text style={styles.btnPrimaryText}>I did it</Text>
          </Pressable>
        ) : null}

        <Pressable
          style={[styles.btn, styles.btnGhost, busy && styles.disabled]}
          onPress={() => void patch({ status: "archived" }, true)}
          disabled={busy}
        >
          <Text style={styles.btnGhostText}>Archive</Text>
        </Pressable>

        <Pressable
          style={[styles.btn, styles.btnDanger, busy && styles.disabled]}
          onPress={confirmDelete}
          disabled={busy}
        >
          <Text style={styles.btnDangerText}>Delete</Text>
        </Pressable>
      </ScrollView>

      <FolderPickerModal
        visible={picker}
        title="Move save to"
        folders={folders}
        allowUncategorized
        selectedId={save.folder_id ?? null}
        onClose={() => setPicker(false)}
        onSelect={(id) => {
          setPicker(false);
          void patch({ folder_id: id });
        }}
        onFoldersChange={setFolders}
        confirmLabel="Move here"
      />
      <ReminderPickerModal
        visible={reminderPicker}
        initialDate={
          save.reminder?.fire_at ? new Date(save.reminder.fire_at) : null
        }
        allowClear={Boolean(save.reminder)}
        busy={busy}
        onClose={() => setReminderPicker(false)}
        onSave={(date) => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const { notified } = await upsertSaveReminder({
                saveId,
                title: save.title || save.source_url || "Saved item",
                body: save.user_note,
                fireAt: date,
              });
              setReminderPicker(false);
              await load();
              if (!notified) {
                setError(
                  "Reminder saved, but notifications are off on this device.",
                );
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : "Could not set reminder");
            } finally {
              setBusy(false);
            }
          })();
        }}
        onClear={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              await cancelSaveReminder(saveId);
              setReminderPicker(false);
              await load();
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
  wrap: { flex: 1, overflow: "hidden" },
  glow: {
    position: "absolute",
    top: 40,
    alignSelf: "center",
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#F7C9DA",
    opacity: 0.45,
  },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnText: { fontSize: 20, color: "#1E1B3A" },
  roundSpacer: { width: 44 },
  whenPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  whenPillText: { fontSize: 13, fontWeight: "700", color: "#1E1B3A" },
  scroll: { paddingBottom: 40 },
  quoteLead: {
    marginTop: 28,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "600",
    color: "#3E3B5C",
  },
  quote: {
    marginTop: 12,
    marginBottom: 28,
    marginHorizontal: 4,
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: "#1E1B3A",
  },
  saveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 24,
    backgroundColor: "#FFFFFF",
    ...shadow,
  },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: "#FFD3B8",
  },
  saveCardBody: { flex: 1 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: "700", color: "#1E1B3A" },
  meta: {
    marginTop: 2,
    fontSize: 12,
    color: "#5D5A7A",
    textTransform: "capitalize",
  },
  qaCard: {
    marginTop: 12,
    padding: 16,
    paddingBottom: 4,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.65)",
  },
  error: { color: "#C2364A", marginBottom: 8 },
  link: { marginTop: 12, color: "#1E1B3A", fontWeight: "600" },
  linkBtn: {
    marginTop: 14,
    backgroundColor: "#FFFFFF",
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  linkBtnText: { color: "#1E1B3A", fontWeight: "600", fontSize: 15 },
  section: {
    marginTop: 22,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: "#5D5A7A",

  },
  qa: { marginBottom: 12 },
  q: { fontSize: 14, fontWeight: "600", color: "#5D5A7A", marginBottom: 4 },
  a: { fontSize: 16, lineHeight: 22, color: "#1E1B3A" },
  note: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: "#D6D8F0",
    borderRadius: 18,
    padding: 12,
    backgroundColor: "#FFF",
    fontSize: 16,
    color: "#1E1B3A",
    textAlignVertical: "top",
  },
  btn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#5B5BD6", minHeight: 56 },
  btnPrimaryText: { color: "#FFF", fontWeight: "700", fontSize: 16 },
  btnGhost: { backgroundColor: "#FFFFFF" },
  btnGhostText: { color: "#1E1B3A", fontWeight: "600" },
  btnDanger: { backgroundColor: "#FCE4E8" },
  btnDangerText: { color: "#C2364A", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
