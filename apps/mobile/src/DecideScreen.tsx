import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { api } from "./api";
import { FolderDropdown } from "./components/FolderTreePicker";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import {
  draftPlan,
  fadeInfo,
  keepSave,
  letGo,
  markDone,
  platformLabel,
} from "./lifecycle";
import {
  defaultReminderDate,
  deviceTimezone,
  formatReminderTime,
} from "./reminders/format";
import { scheduleLocalReminder } from "./reminders/notifications";
import { displayTitle } from "./text";
import { Ember, LifeDots, MeltIcon, MeltTile, daysLeftOf } from "./doodles";
import { Text, TextInput, colors, handFont, shadow } from "./theme";
import type { Folder, KeepMode, Save } from "./types";

type Props = {
  items: Save[];
  startIndex: number;
  lifespanDays: number;
  /** `changed` is true if any save was decided, so the inbox should reload. */
  onClose: (changed: boolean) => void;
};

type Tally = { done: number; planned: number; distilled: number; let_go: number; later: number };

const EMPTY_TALLY: Tally = { done: 0, planned: 0, distilled: 0, let_go: 0, later: 0 };

export function DecideScreen({ items, startIndex, lifespanDays, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [mode, setMode] = useState<KeepMode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = items[index];
  const decided = tally.done + tally.planned + tally.distilled + tally.let_go;

  function next(kind: keyof Tally) {
    setTally((t) => ({ ...t, [kind]: t[kind] + 1 }));
    setMode(null);
    setError(null);
    setIndex((i) => i + 1);
  }

  async function run(kind: "done" | "let_go") {
    if (!save || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (kind === "done") await markDone(save.id);
      else await letGo(save.id);
      next(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (!save) {
    return (
      <View style={styles.screen}>
        <View style={styles.doneWrap}>
          <Text style={styles.eyebrow}>All sorted</Text>
          <Text style={styles.doneTitle}>
            {decided > 0 ? "Nice. That's your attention back." : "Nothing decided yet"}
          </Text>
          <View style={styles.tallyGrid}>
            {(
              [
                ["Did it", tally.done],
                ["Planned", tally.planned],
                ["Distilled", tally.distilled],
                ["Let go", tally.let_go],
              ] as const
            ).map(([label, n]) => (
              <View key={label} style={styles.tallyTile}>
                <Text style={styles.tallyNum}>{n}</Text>
                <Text style={styles.tallyLabel}>{label}</Text>
              </View>
            ))}
          </View>
          {tally.later > 0 ? (
            <Text style={styles.laterNote}>
              {tally.later} left for later. They keep fading until you decide.
            </Text>
          ) : null}
          <Pressable style={styles.primaryBtn} onPress={() => onClose(decided > 0)}>
            <Text style={styles.primaryBtnText}>Back to inbox</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (mode) {
    return (
      <KeepStep
        key={`${save.id}-${mode}`}
        save={save}
        mode={mode}
        onBack={() => setMode(null)}
        onKept={() => next(mode === "plan" ? "planned" : "distilled")}
      />
    );
  }

  const fade = fadeInfo(save.expires_at, lifespanDays);
  const days = daysLeftOf(save.expires_at);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad}>
        <View style={styles.topRow}>
          <Pressable
            style={styles.roundBtn}
            onPress={() => onClose(decided > 0)}
            accessibilityLabel="Close"
          >
            <Text style={styles.roundBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} of {items.length}
          </Text>
          <View style={styles.roundSpacer} />
        </View>

        <View style={[styles.meltCard, days <= 1 && styles.meltCardHot]}>
          <MeltIcon daysLeft={days} size={150} />
          {days <= 1 ? <Text style={styles.meltNote}>melting!</Text> : null}
        </View>
        <View style={styles.card}>
          <Text style={styles.meta}>{platformLabel(save.platform)}</Text>
          <Text style={styles.title}>{displayTitle(save)}</Text>
          <View style={styles.dotsRow}>
            <LifeDots daysLeft={days} />
          </View>
          <View style={styles.cardFoot}>
            <Text style={[styles.fade, fade.urgent && styles.fadeUrgent]}>
              {fade.label}
            </Text>
            {save.source_url ? (
              <Pressable
                style={styles.openBtn}
                onPress={() => void Linking.openURL(save.source_url!)}
                accessibilityLabel="Open the original post"
              >
                <Text style={styles.openBtnText}>Open post ↗</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Four equal choices: nothing is pre-picked, the user decides. */}
        <Text style={styles.choicePrompt}>What will you do with it?</Text>
        <View style={styles.choiceGrid}>
          <Pressable
            style={styles.choice}
            onPress={() => void run("done")}
            disabled={busy}
          >
            <Text style={styles.choiceTitle}>Did it</Text>
            <Text style={styles.choiceSub}>Already acted</Text>
          </Pressable>
          <Pressable
            style={styles.choice}
            onPress={() => setMode("plan")}
            disabled={busy}
          >
            <Text style={styles.choiceTitle}>Plan it</Text>
            <Text style={styles.choiceSub}>Pick a next step</Text>
          </Pressable>
          <Pressable
            style={styles.choice}
            onPress={() => setMode("distill")}
            disabled={busy}
          >
            <Text style={styles.choiceTitle}>Distill it</Text>
            <Text style={styles.choiceSub}>Keep the lesson</Text>
          </Pressable>
          <Pressable
            style={styles.choice}
            onPress={() => void run("let_go")}
            disabled={busy}
          >
            <Text style={styles.choiceTitle}>Let go</Text>
            <Text style={styles.choiceSub}>Delete for good</Text>
          </Pressable>
        </View>

        {busy ? <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} /> : null}

        <Pressable style={styles.textBtn} onPress={() => next("later")} disabled={busy}>
          <Text style={styles.textBtnText}>Decide later</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------

function KeepStep({
  save,
  mode,
  onBack,
  onKept,
}: {
  save: Save;
  mode: KeepMode;
  onBack: () => void;
  onKept: () => void;
}) {
  const isPlan = mode === "plan";
  // Only plans get an AI draft; a takeaway is the user's own conclusion.
  const [loading, setLoading] = useState(isPlan);
  const [question, setQuestion] = useState(
    isPlan ? "What's the next step, and when?" : "What will you take from this?",
  );
  const [keepLink, setKeepLink] = useState(true);
  const [text, setText] = useState("");
  const [when, setWhen] = useState<Date>(defaultReminderDate());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [showFolders, setShowFolders] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (isPlan) {
      void draftPlan(save.id, deviceTimezone())
        .then((d) => {
          if (!alive) return;
          setQuestion(d.question);
          setText(d.draft);
          if (d.suggested_at) setWhen(new Date(d.suggested_at));
        })
        .catch(() => {
          /* No draft: the user writes it themselves. */
        })
        .finally(() => alive && setLoading(false));
    }
    void api<{ items: Folder[] }>("/folders")
      .then((r) => alive && setFolders(r.items))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [save.id, isPlan]);

  async function createFolder(name: string, parentId: string | null) {
    const folder = await api<Folder>("/folders", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId }),
    });
    setFolders((prev) => [...prev, folder].sort((a, b) => a.path.localeCompare(b.path)));
    setFolderId(folder.id);
  }

  async function submit() {
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await keepSave(save.id, {
        mode,
        ...(isPlan
          ? { plan_text: value, plan_at: when.toISOString() }
          : { takeaway: value, keep_link: keepLink }),
        folder_id: folderId,
        timezone: deviceTimezone(),
      });
      if (isPlan) {
        await scheduleLocalReminder({
          saveId: save.id,
          title: value,
          body: displayTitle(save),
          fireAt: when,
        }).catch(() => false);
      }
      onKept();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't keep this");
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <View style={styles.topRow}>
          <Pressable style={styles.roundBtn} onPress={onBack} accessibilityLabel="Back">
            <Text style={styles.roundBtnText}>←</Text>
          </Pressable>
          <Text style={styles.counter}>{isPlan ? "Plan it" : "Distill it"}</Text>
          <View style={styles.roundSpacer} />
        </View>

        <View style={styles.doodleRow}>
          <Ember pose={isPlan ? "calendar" : "write"} size={118} filled={false} />
          <Text style={styles.doodleNote}>
            {isPlan ? "give it\na date." : "the post\ncan go."}
          </Text>
        </View>

        <View style={styles.miniCard}>
          <MeltTile daysLeft={daysLeftOf(save.expires_at)} size={40} />
          <Text style={styles.miniTitle} numberOfLines={2}>
            {displayTitle(save)}
          </Text>
        </View>

        <View style={styles.questionCard}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{isPlan ? "NEXT STEP" : "TAKEAWAY"}</Text>
          </View>
          <Text style={styles.question}>{question}</Text>
          {!isPlan ? (
            <Text style={styles.hint}>In your own words, the one thing worth keeping.</Text>
          ) : null}
          {loading ? (
            <View style={styles.drafting}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.draftingText}>Drafting a starting point…</Text>
            </View>
          ) : (
            <TextInput
              style={styles.input}
              multiline
              value={text}
              onChangeText={setText}
              placeholder={isPlan ? "e.g. Cook it on Sunday" : "What stuck with you…"}
              accessibilityLabel={isPlan ? "Next step" : "Takeaway"}
            />
          )}
        </View>

        {!isPlan && save.source_url ? (
          <View style={styles.whenCard}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.whenValueSmall}>Keep the link to the original</Text>
              <Text style={styles.whenLabel}>
                {keepLink
                  ? "You can reopen the post from your journal."
                  : "Only your takeaway stays. The post's link is dropped."}
              </Text>
            </View>
            <Switch
              value={keepLink}
              onValueChange={setKeepLink}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#FFFFFF"
              // react-native-web colours the "on" thumb teal unless told otherwise.
              {...({ activeThumbColor: "#FFFFFF" } as object)}
              accessibilityLabel="Keep the link to the original"
            />
          </View>
        ) : null}

        {isPlan ? (
          <View style={styles.whenCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.whenLabel}>When</Text>
              <Text style={styles.whenValue}>{formatReminderTime(when)}</Text>
            </View>
            <Pressable style={styles.pill} onPress={() => setPickerOpen(true)}>
              <Text style={styles.pillText}>Change</Text>
            </Pressable>
          </View>
        ) : null}

        {showFolders ? (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.whenLabel}>Folder</Text>
            <View style={{ height: 8 }} />
            <FolderDropdown
              folders={folders}
              selectedId={folderId}
              onSelect={setFolderId}
              onCreateFolder={createFolder}
              busy={busy}
            />
          </View>
        ) : (
          <Pressable style={styles.textBtn} onPress={() => setShowFolders(true)}>
            <Text style={styles.textBtnText}>+ Add to a folder (optional)</Text>
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.primaryBtn, (!text.trim() || busy) && styles.disabled]}
          onPress={() => void submit()}
          disabled={!text.trim() || busy}
        >
          <Text style={styles.primaryBtnText}>
            {busy ? "Saving…" : isPlan ? "Add to my plans" : "Add to my journal"}
          </Text>
        </Pressable>
      </ScrollView>

      <ReminderPickerModal
        visible={pickerOpen}
        title="When will you do it?"
        initialDate={when}
        onClose={() => setPickerOpen(false)}
        onSave={(date) => {
          setWhen(date);
          setPickerOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  pad: { padding: 20, paddingBottom: 48, flexGrow: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnText: { fontSize: 18, color: colors.ink },
  roundSpacer: { width: 44 },
  counter: { fontSize: 14, fontWeight: "700", color: colors.inkSoft },
  meltCard: {
    height: 190,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  meltCardHot: { backgroundColor: colors.accentTint, borderColor: colors.orange },
  meltNote: {
    position: "absolute",
    right: 20,
    top: 16,
    fontFamily: handFont,
    fontSize: 20,
    color: colors.orangeDeep,
    transform: [{ rotate: "4deg" }],
  },
  card: { paddingTop: 16 },
  dotsRow: { marginTop: 12 },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
  },
  title: {
    marginTop: 4,
    fontSize: 28,
    lineHeight: 31,
    fontWeight: "300",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  cardFoot: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  openBtn: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    justifyContent: "center",
  },
  openBtnText: { fontSize: 14, fontWeight: "700", color: colors.accentText },
  hint: { marginTop: 6, fontSize: 14, lineHeight: 20, color: colors.muted },
  whenValueSmall: { fontSize: 15, fontWeight: "700", color: colors.ink },
  fade: { fontSize: 13, fontWeight: "600", color: colors.muted },
  fadeUrgent: { color: "#B23F0C" },
  choicePrompt: {
    marginTop: 20,
    fontSize: 15,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  choiceGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  choice: {
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 76,
    padding: 14,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: "center",
  },
  choiceTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  choiceSub: { marginTop: 2, fontSize: 12, color: colors.muted },
  textBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
  },
  textBtnText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  error: { marginTop: 12, color: colors.danger, fontSize: 14 },
  primaryBtn: {
    marginTop: 20,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  disabled: { opacity: 0.4 },
  doodleRow: { flexDirection: "row", alignItems: "flex-end", gap: 4 },
  doodleNote: {
    fontFamily: handFont,
    fontSize: 20,
    lineHeight: 21,
    color: colors.orangeDeep,
    paddingBottom: 22,
    transform: [{ rotate: "-4deg" }],
  },
  miniCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  thumb: { width: 48, height: 48, borderRadius: 14, backgroundColor: colors.peach },
  miniTitle: { flex: 1, fontSize: 13, color: colors.muted },
  questionCard: { paddingTop: 4 },
  tag: { alignSelf: "flex-start" },
  tagText: { fontSize: 12, fontWeight: "600", letterSpacing: 1, color: colors.muted },
  question: {
    marginTop: 6,
    fontSize: 30,
    lineHeight: 33,
    fontWeight: "300",
    letterSpacing: -0.9,
    color: colors.ink,
  },
  drafting: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  draftingText: { fontSize: 14, color: colors.muted },
  input: {
    marginTop: 14,
    minHeight: 72,
    paddingVertical: 8,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.ink,
    fontSize: 21,
    lineHeight: 27,
    fontWeight: "300",
    color: colors.ink,
    textAlignVertical: "top",
  },
  whenCard: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  whenLabel: { fontSize: 13, fontWeight: "700", color: colors.muted },
  whenValue: { marginTop: 2, fontSize: 17, fontWeight: "800", color: colors.ink },
  pill: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: { fontSize: 14, fontWeight: "600", color: colors.accentText },
  doneWrap: { flex: 1, padding: 24, justifyContent: "center" },
  eyebrow: { fontSize: 14, fontWeight: "700", color: colors.muted },
  doneTitle: {
    marginTop: 6,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  tallyGrid: { marginTop: 22, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tallyTile: {
    flexBasis: "47%",
    flexGrow: 1,
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
  },
  tallyNum: { fontSize: 30, fontWeight: "800", color: colors.ink },
  tallyLabel: { fontSize: 13, fontWeight: "600", color: colors.muted },
  laterNote: { marginTop: 16, fontSize: 14, lineHeight: 20, color: colors.inkSoft },
});
