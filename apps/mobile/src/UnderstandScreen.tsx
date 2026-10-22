import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput, colors, shadow } from "./theme";
import { api } from "./api";
import { FolderDropdown } from "./components/FolderTreePicker";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import {
  deviceTimezone,
  formatReminderTime,
  parseSuggestedFireAt,
} from "./reminders/format";
import { scheduleLocalReminder } from "./reminders/notifications";
import type { Folder } from "./types";

type Props = {
  saveId: string;
  saveTitle?: string;
  onDone: () => void;
  onCancel: () => void;
};

type Phase = "loading" | "question" | "complete" | "error";

const MAX_QUESTIONS = 4;

export function UnderstandScreen({
  saveId,
  saveTitle,
  onDone,
  onCancel,
}: Props) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [skipsRemaining, setSkipsRemaining] = useState(0);
  const [canSkip, setCanSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contentKind, setContentKind] = useState<"place" | "content" | "other">(
    "other",
  );
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [reminderAt, setReminderAt] = useState<Date | null>(null);
  const [suggestedReminder, setSuggestedReminder] = useState<{
    suggested_fire_at: string;
    label: string;
  } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [questionNumber, setQuestionNumber] = useState(1);
  const [previous, setPrevious] = useState<{
    question: string;
    answer: string;
  } | null>(null);

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const res = await api<{
        question: string;
        skips_remaining: number;
        can_skip: boolean;
        ai_turn_count?: number;
        ready_to_complete?: boolean;
        inferred_content_kind?: "place" | "content" | "other";
      }>(`/saves/${saveId}/understand/start`, { method: "POST" });

      if (res.ready_to_complete) {
        if (res.inferred_content_kind) setContentKind(res.inferred_content_kind);
        const folderRes = await api<{ items: Folder[] }>("/folders");
        setFolders(folderRes.items);
        setPhase("complete");
        return;
      }

      setQuestion(res.question);
      setQuestionNumber(res.ai_turn_count ?? 1);
      setSkipsRemaining(res.skips_remaining);
      setCanSkip(res.can_skip);
      setPhase("question");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start");
      setPhase("error");
    }
  }, [saveId]);

  useEffect(() => {
    void start();
  }, [start]);

  async function submitAnswer() {
    const trimmed = answer.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        done: boolean;
        next_question: string | null;
        inferred_content_kind?: "place" | "content" | "other";
        suggestions?: {
          reminder?: { suggested_fire_at: string; label: string } | null;
        };
      }>(`/saves/${saveId}/understand/answer`, {
        method: "POST",
        body: JSON.stringify({ answer: trimmed }),
      });
      setAnswer("");
      if (res.inferred_content_kind) setContentKind(res.inferred_content_kind);
      if (res.done || !res.next_question) {
        if (res.suggestions?.reminder) {
          setSuggestedReminder(res.suggestions.reminder);
          const parsed = parseSuggestedFireAt(
            res.suggestions.reminder.suggested_fire_at,
          );
          if (parsed) setReminderAt(parsed);
        }
        const folderRes = await api<{ items: Folder[] }>("/folders");
        setFolders(folderRes.items);
        setPhase("complete");
      } else {
        setPrevious({ question, answer: trimmed });
        setQuestion(res.next_question);
        setQuestionNumber((n) => Math.min(n + 1, MAX_QUESTIONS));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to answer");
    } finally {
      setBusy(false);
    }
  }

  async function skip() {
    if (!canSkip || busy) return;
    setBusy(true);
    try {
      await api(`/saves/${saveId}/understand/skip`, { method: "POST" });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Skip failed");
      setBusy(false);
    }
  }

  async function createFolder(name: string, parentId: string | null) {
    setBusy(true);
    setError(null);
    try {
      const folder = await api<Folder>("/folders", {
        method: "POST",
        body: JSON.stringify({ name, parent_id: parentId }),
      });
      setFolders((prev) =>
        [...prev, folder].sort((a, b) => a.path.localeCompare(b.path)),
      );
      setFolderId(folder.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create folder");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      await api(`/saves/${saveId}/understand/complete`, {
        method: "POST",
        body: JSON.stringify({
          folder_id: folderId,
          content_kind: contentKind,
          reminder:
            reminderOn && reminderAt
              ? {
                  fire_at: reminderAt.toISOString(),
                  timezone: deviceTimezone(),
                  delivery: "in_app",
                }
              : null,
        }),
      });
      if (reminderOn && reminderAt) {
        await scheduleLocalReminder({
          saveId,
          title: saveTitle || "Saved item",
          body: suggestedReminder?.label,
          fireAt: reminderAt,
        });
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
      setBusy(false);
    }
  }

  const blobs = (
    <>
      <View pointerEvents="none" style={styles.blobPeach} />
      <View pointerEvents="none" style={styles.blobLilac} />
    </>
  );

  const saveCard = saveTitle ? (
    <View style={styles.saveCard}>
      <View style={styles.thumb} />
      <Text style={styles.saveTitle} numberOfLines={2}>
        {saveTitle}
      </Text>
    </View>
  ) : null;

  if (phase === "loading") {
    return (
      <View style={styles.center}>
        {blobs}
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.muted, { marginTop: 12 }]}>
          Thinking of a good question…
        </Text>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={styles.center}>
        {blobs}
        <Text style={styles.error}>{error}</Text>
        <Pressable style={styles.primaryBtn} onPress={() => void start()}>
          <Text style={styles.primaryBtnText}>Try again</Text>
        </Pressable>
        <Pressable style={styles.textBtn} onPress={onCancel}>
          <Text style={styles.textBtnText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "complete") {
    return (
      <View style={styles.screen}>
        {blobs}
        <ScrollView contentContainerStyle={styles.pad}>
          <Text style={styles.eyebrow}>Nearly there</Text>
          <Text style={styles.h1}>Give it a home</Text>
          {saveCard}

          <Text style={styles.label}>This looks like</Text>
          <View style={styles.pillRow}>
            {(["place", "content", "other"] as const).map((k) => (
              <Pressable
                key={k}
                onPress={() => setContentKind(k)}
                style={[styles.pill, contentKind === k && styles.pillOn]}
              >
                <Text
                  style={[styles.pillText, contentKind === k && styles.pillOnText]}
                >
                  {k}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Folder</Text>
          <FolderDropdown
            folders={folders}
            selectedId={folderId}
            onSelect={setFolderId}
            onCreateFolder={createFolder}
            busy={busy}
          />

          <View style={styles.nudgeCard}>
            <View style={styles.nudgeHead}>
              <Text style={styles.nudgeLabel}>Gentle nudge</Text>
              {reminderOn ? (
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    setReminderOn(false);
                    setReminderAt(null);
                  }}
                >
                  <Text style={styles.nudgeOff}>Turn off</Text>
                </Pressable>
              ) : null}
            </View>
            <Text style={styles.nudgeTime}>
              {reminderOn && reminderAt
                ? formatReminderTime(reminderAt)
                : "No reminder yet"}
            </Text>
            {suggestedReminder ? (
              <Text style={styles.nudgeWhy}>
                Suggested from your answers: {suggestedReminder.label}
              </Text>
            ) : null}
            <View style={styles.pillRow}>
              {suggestedReminder && !reminderOn ? (
                <Pressable
                  style={[styles.pill, styles.pillOn]}
                  onPress={() => {
                    const parsed = parseSuggestedFireAt(
                      suggestedReminder.suggested_fire_at,
                    );
                    if (parsed) {
                      setReminderAt(parsed);
                      setReminderOn(true);
                    } else {
                      setPickerOpen(true);
                    }
                  }}
                >
                  <Text style={[styles.pillText, styles.pillOnText]}>
                    Use suggestion
                  </Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.pill} onPress={() => setPickerOpen(true)}>
                <Text style={styles.pillText}>
                  {reminderOn ? "Change" : "Pick a time"}
                </Text>
              </Pressable>
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.inkBtn, busy && styles.btnDisabled]}
            onPress={() => void finish()}
            disabled={busy}
          >
            <Text style={styles.inkBtnText}>{busy ? "Saving…" : "Save it"}</Text>
          </Pressable>

          <ReminderPickerModal
            visible={pickerOpen}
            initialDate={reminderAt}
            suggestedLabel={suggestedReminder?.label}
            onClose={() => setPickerOpen(false)}
            onSave={(date) => {
              setReminderAt(date);
              setReminderOn(true);
              setPickerOpen(false);
            }}
          />
        </ScrollView>
      </View>
    );
  }

  const canSend = answer.trim().length > 0 && !busy;

  return (
    <View style={styles.screen}>
      {blobs}
      <ScrollView
        contentContainerStyle={styles.pad}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topRow}>
          <Pressable
            style={styles.roundBtn}
            onPress={onCancel}
            accessibilityLabel="Back"
          >
            <Text style={styles.roundBtnText}>←</Text>
          </Pressable>
          <View
            style={styles.dots}
            accessibilityLabel={`Question ${questionNumber} of up to ${MAX_QUESTIONS}`}
          >
            {Array.from({ length: MAX_QUESTIONS }, (_, i) => (
              <View
                key={i}
                style={[styles.dot, i < questionNumber && styles.dotOn]}
              />
            ))}
          </View>
          <View style={styles.roundSpacer} />
        </View>

        {saveCard}

        {previous ? (
          <View style={styles.thread}>
            <View style={styles.bubbleAi}>
              <Text style={styles.bubbleAiText}>{previous.question}</Text>
            </View>
            <View style={styles.bubbleMe}>
              <Text style={styles.bubbleMeText}>{previous.answer}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.questionCard}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>
              {questionNumber > 1 ? "Follow-up" : "Why this?"}
            </Text>
          </View>
          <Text style={styles.question}>{question}</Text>
        </View>

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            multiline
            placeholder="Say it in your own words…"
            value={answer}
            onChangeText={setAnswer}
            autoFocus
            accessibilityLabel="Your answer"
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.btnDisabled]}
            onPress={() => void submitAnswer()}
            disabled={!canSend}
            accessibilityLabel="Send answer"
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendBtnText}>↑</Text>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {canSkip ? (
          <Pressable
            style={styles.textBtn}
            onPress={() => void skip()}
            disabled={busy}
          >
            <Text style={styles.textBtnText}>
              Answer later · {skipsRemaining} left
            </Text>
          </Pressable>
        ) : (
          <Text style={[styles.muted, styles.centerText]}>No skips left</Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, overflow: "hidden" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  blobPeach: {
    position: "absolute",
    top: -70,
    right: -90,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.peach,
    opacity: 0.6,
  },
  blobLilac: {
    position: "absolute",
    top: 300,
    left: -130,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.lilac,
    opacity: 0.5,
  },
  pad: { padding: 20, paddingBottom: 48, flexGrow: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnText: { fontSize: 20, color: colors.ink },
  roundSpacer: { width: 44 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#C7C8EE" },
  dotOn: { width: 22, backgroundColor: colors.accent },
  saveCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.8)",
    marginBottom: 20,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.peach,
  },
  saveTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    color: colors.ink,
  },
  thread: { gap: 10, marginBottom: 20 },
  bubbleAi: {
    alignSelf: "flex-start",
    maxWidth: "85%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderBottomLeftRadius: 8,
    backgroundColor: "rgba(255,255,255,0.85)",
  },
  bubbleAiText: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  bubbleMe: {
    alignSelf: "flex-end",
    maxWidth: "85%",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 22,
    borderBottomRightRadius: 8,
    backgroundColor: "#E2E3FF",
  },
  bubbleMeText: {
    fontSize: 15,
    fontWeight: "500",
    color: colors.ink,
    lineHeight: 21,
  },
  questionCard: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: colors.surface,
    marginBottom: 16,
    ...shadow,
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
  },
  tagText: { fontSize: 12, fontWeight: "600", color: colors.accentText },
  question: {
    marginTop: 12,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: colors.ink,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingLeft: 18,
    padding: 8,
    borderRadius: 28,
    backgroundColor: colors.surface,
    ...shadow,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 160,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    textAlignVertical: "top",
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  btnDisabled: { opacity: 0.4 },
  textBtn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  textBtnText: { fontSize: 14, fontWeight: "600", color: colors.muted },
  eyebrow: { fontSize: 14, fontWeight: "700", color: colors.muted },
  h1: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  label: {
    marginTop: 8,
    marginBottom: 10,
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
  },
  pillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  pillOn: { backgroundColor: colors.accent },
  pillText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    textTransform: "capitalize",
  },
  pillOnText: { color: "#FFFFFF" },
  nudgeCard: {
    marginTop: 12,
    padding: 20,
    paddingBottom: 8,
    borderRadius: 28,
    backgroundColor: colors.surface,
    ...shadow,
  },
  nudgeHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  nudgeLabel: { fontSize: 13, fontWeight: "700", color: colors.muted },
  nudgeOff: { fontSize: 13, fontWeight: "600", color: colors.accentText },
  nudgeTime: {
    marginTop: 8,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  nudgeWhy: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  muted: { color: colors.muted, marginBottom: 8 },
  centerText: { textAlign: "center", marginTop: 12 },
  error: { color: colors.danger, marginVertical: 8 },
  primaryBtn: {
    marginTop: 16,
    minHeight: 52,
    paddingHorizontal: 28,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  inkBtn: {
    marginTop: 24,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  inkBtnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
