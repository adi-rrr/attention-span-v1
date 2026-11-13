import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  Modal,
  PanResponder,
  type PanResponderGestureState,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "./api";
import { labelOf, useCategories } from "./categories";
import { CategoryPicker } from "./components/CategoryPicker";
import { FolderDropdown } from "./components/FolderTreePicker";
import { ReminderPickerModal } from "./components/ReminderPickerModal";
import {
  draftPlan,
  fadeInfo,
  keepSave,
  letGo,
  markDone,
  platformLabel,
  setCategory,
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
import type { CategoryKey, Folder, KeepMode, Save } from "./types";

type Props = {
  items: Save[];
  startIndex: number;
  lifespanDays: number;
  /** `changed` is true if any save was decided, so the inbox should reload. */
  onClose: (changed: boolean) => void;
};

type Tally = { done: number; planned: number; distilled: number; let_go: number; later: number };

const EMPTY_TALLY: Tally = { done: 0, planned: 0, distilled: 0, let_go: 0, later: 0 };

type Direction = "left" | "right" | "up" | "down";

/** The four swipes, as agreed: left lets go, right did it, up plans, down distills. */
const SWIPES: Record<Direction, { label: string; arrow: string }> = {
  left: { label: "Let go", arrow: "←" },
  up: { label: "Plan it", arrow: "↑" },
  down: { label: "Distill it", arrow: "↓" },
  right: { label: "Did it", arrow: "→" },
};

/** How far a card must travel (or how fast) before a swipe counts. */
const SWIPE_DISTANCE = 110;
const SWIPE_SPEED = 0.8;
/** Let go and Did it wait this long before they're sent, so they can be undone. */
const UNDO_MS = 5000;

const GUIDE_KEY = "guide.swipe.v1";

type Pending = { save: Save; kind: "done" | "let_go"; ms: number; index: number };

/**
 * Time spent on the current card, paused while the app is in the background.
 * Restarts whenever `cardKey` changes.
 */
function useDecisionClock(cardKey: string | undefined) {
  const startedAt = useRef(Date.now());
  const banked = useRef(0);

  useEffect(() => {
    startedAt.current = Date.now();
    banked.current = 0;
  }, [cardKey]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        if (!startedAt.current) startedAt.current = Date.now();
      } else if (startedAt.current) {
        banked.current += Date.now() - startedAt.current;
        startedAt.current = 0;
      }
    });
    return () => sub.remove();
  }, []);

  return useCallback(
    () => banked.current + (startedAt.current ? Date.now() - startedAt.current : 0),
    [],
  );
}

function directionOf(g: PanResponderGestureState): Direction | null {
  const ax = Math.abs(g.dx);
  const ay = Math.abs(g.dy);
  if (ax >= ay) {
    if (ax > SWIPE_DISTANCE || (Math.abs(g.vx) > SWIPE_SPEED && ax > 40)) {
      return g.dx > 0 ? "right" : "left";
    }
  } else if (ay > SWIPE_DISTANCE || (Math.abs(g.vy) > SWIPE_SPEED && ay > 40)) {
    return g.dy > 0 ? "down" : "up";
  }
  return null;
}

/** "Stays until you're there" for places, the event day for events. */
function lifeLabel(save: Save, lifespanDays: number): { label: string; urgent: boolean } {
  if (save.category === "place" && !save.expires_at) {
    return { label: "Stays until you're there", urgent: false };
  }
  const fade = fadeInfo(save.expires_at, lifespanDays);
  if (save.category === "event" && save.event_at) {
    const day = new Date(save.event_at).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
    });
    return { label: `Event on ${day} · ${fade.label.toLowerCase()}`, urgent: fade.urgent };
  }
  return { label: fade.label, urgent: fade.urgent };
}

export function DecideScreen({ items, startIndex, lifespanDays, onClose }: Props) {
  const [index, setIndex] = useState(startIndex);
  const [tally, setTally] = useState<Tally>(EMPTY_TALLY);
  const [mode, setMode] = useState<KeepMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Category changes made while sorting, so the deck shows them right away.
  const [patches, setPatches] = useState<Record<string, Partial<Save>>>({});
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const categories = useCategories();
  const pan = useRef(new Animated.ValueXY()).current;

  const base = items[index];
  const save = base ? { ...base, ...patches[base.id] } : undefined;
  const decided = tally.done + tally.planned + tally.distilled + tally.let_go;
  const elapsed = useDecisionClock(save?.id);

  // First time in the deck: show which way does what.
  useEffect(() => {
    void AsyncStorage.getItem(GUIDE_KEY)
      .then((seen) => {
        if (!seen) setGuideOpen(true);
      })
      .catch(() => {});
  }, []);

  function closeGuide() {
    setGuideOpen(false);
    void AsyncStorage.setItem(GUIDE_KEY, "1").catch(() => {});
  }

  function count(kind: keyof Tally, by = 1) {
    setTally((t) => ({ ...t, [kind]: t[kind] + by }));
  }

  function next(kind: keyof Tally) {
    count(kind);
    setMode(null);
    setError(null);
    setIndex((i) => i + 1);
  }

  /** Send a waiting Let go / Did it now. */
  function flush(): Promise<void> {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (!p) return Promise.resolve();
    const send = p.kind === "done" ? markDone(p.save.id, p.ms) : letGo(p.save.id, p.ms);
    return send.then(
      () => undefined,
      (e) => {
        setError(
          `Couldn't save "${displayTitle(p.save)}": ${e instanceof Error ? e.message : "try again"}`,
        );
      },
    );
  }

  // Leaving the deck sends anything still waiting.
  useEffect(() => () => void flush(), []);

  function decideQuick(kind: "done" | "let_go") {
    if (!save) return;
    void flush();
    const p: Pending = { save, kind, ms: elapsed(), index };
    pendingRef.current = p;
    setPending(p);
    undoTimer.current = setTimeout(() => void flush(), UNDO_MS);
    next(kind);
  }

  function undo() {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = null;
    const p = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (!p) return;
    count(p.kind, -1);
    setIndex(p.index);
  }

  function act(dir: Direction) {
    if (dir === "left") decideQuick("let_go");
    else if (dir === "right") decideQuick("done");
    else setMode(dir === "up" ? "plan" : "distill");
  }

  /** Throw the card off in a direction, then act on it. Buttons use this too. */
  function fling(dir: Direction) {
    const to = {
      left: { x: -width * 1.5, y: 0 },
      right: { x: width * 1.5, y: 0 },
      up: { x: 0, y: -height },
      down: { x: 0, y: height },
    }[dir];
    Animated.timing(pan, { toValue: to, duration: 180, useNativeDriver: false }).start(() => {
      pan.setValue({ x: 0, y: 0 });
      act(dir);
    });
  }

  // The responder is made once; it reaches the latest fling through this ref.
  const flingRef = useRef(fling);
  flingRef.current = fling;
  const responder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8,
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_, g) => {
        const dir = directionOf(g);
        if (dir) flingRef.current(dir);
        else Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
      },
    }),
  ).current;

  async function pickCategory(key: CategoryKey) {
    if (!save) return;
    setPickerOpen(false);
    const id = save.id;
    setPatches((p) => ({ ...p, [id]: { ...p[id], category: key, category_source: "user" } }));
    try {
      const res = await setCategory(id, key);
      setPatches((p) => ({ ...p, [id]: { ...p[id], expires_at: res.expires_at } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't change the category");
    }
  }

  async function close() {
    await flush();
    onClose(decided > 0);
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
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.primaryBtn} onPress={() => void close()}>
            <Text style={styles.primaryBtnText}>Back to inbox</Text>
          </Pressable>
        </View>
        {pending ? <UndoBar pending={pending} onUndo={undo} /> : null}
      </View>
    );
  }

  const days = daysLeftOf(save.expires_at);
  const life = lifeLabel(save, lifespanDays);
  const rotate = pan.x.interpolate({
    inputRange: [-width, 0, width],
    outputRange: ["-12deg", "0deg", "12deg"],
  });
  const hint = (dir: Direction) =>
    dir === "left"
      ? pan.x.interpolate({ inputRange: [-SWIPE_DISTANCE, 0], outputRange: [1, 0], extrapolate: "clamp" })
      : dir === "right"
        ? pan.x.interpolate({ inputRange: [0, SWIPE_DISTANCE], outputRange: [0, 1], extrapolate: "clamp" })
        : dir === "up"
          ? pan.y.interpolate({ inputRange: [-SWIPE_DISTANCE, 0], outputRange: [1, 0], extrapolate: "clamp" })
          : pan.y.interpolate({ inputRange: [0, SWIPE_DISTANCE], outputRange: [0, 1], extrapolate: "clamp" });

  return (
    <View style={styles.screen}>
      <View style={styles.deckPad}>
        <View style={styles.topRow}>
          <Pressable style={styles.roundBtn} onPress={() => void close()} accessibilityLabel="Close">
            <Text style={styles.roundBtnText}>✕</Text>
          </Pressable>
          <Text style={styles.counter}>
            {index + 1} of {items.length}
          </Text>
          <Pressable
            style={styles.roundBtn}
            onPress={() => setGuideOpen(true)}
            accessibilityLabel="How swiping works"
          >
            <Text style={styles.roundBtnText}>?</Text>
          </Pressable>
        </View>

        <View style={styles.deckArea}>
          <Animated.View
            {...responder.panHandlers}
            style={[
              styles.swipeCard,
              { transform: [{ translateX: pan.x }, { translateY: pan.y }, { rotate }] },
            ]}
          >
            <View style={styles.chipRow}>
              <Pressable
                style={styles.categoryChip}
                onPress={() => setPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Category: ${labelOf(categories, save.category)}. Change`}
              >
                <Text style={styles.categoryChipText}>
                  {labelOf(categories, save.category)} ▾
                </Text>
              </Pressable>
              <Text style={styles.chipNote}>
                {save.category_source === "ai"
                  ? save.category === "other"
                    ? "not sure, tap to pick"
                    : "suggested"
                  : ""}
              </Text>
            </View>

            <View style={[styles.meltCard, days <= 1 && styles.meltCardHot]}>
              <MeltIcon daysLeft={days} size={120} />
              {days <= 1 ? <Text style={styles.meltNote}>melting!</Text> : null}
            </View>
            <Text style={styles.meta}>
              {platformLabel(save.platform)}
              {save.place_name ? ` · ${save.place_name}` : ""}
            </Text>
            <Text style={styles.title} numberOfLines={3}>
              {displayTitle(save)}
            </Text>
            <View style={styles.dotsRow}>
              <LifeDots daysLeft={days} />
            </View>
            <View style={styles.cardFoot}>
              <Text style={[styles.fade, life.urgent && styles.fadeUrgent]}>{life.label}</Text>
              {save.source_url ? (
                <Pressable
                  style={styles.openBtn}
                  onPress={() => void Linking.openURL(save.source_url!)}
                  accessibilityLabel="Open the original post"
                >
                  <Text style={styles.openBtnText}>View post ↗</Text>
                </Pressable>
              ) : null}
            </View>

            {(Object.keys(SWIPES) as Direction[]).map((dir) => (
              <Animated.View
                key={dir}
                pointerEvents="none"
                style={[styles.stamp, styles[`stamp_${dir}`], { opacity: hint(dir) }]}
              >
                <Text style={styles.stampText}>
                  {SWIPES[dir].arrow} {SWIPES[dir].label}
                </Text>
              </Animated.View>
            ))}
          </Animated.View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actionRow}>
          {(["left", "up", "down", "right"] as Direction[]).map((dir) => (
            <Pressable
              key={dir}
              style={styles.actionBtn}
              onPress={() => fling(dir)}
              accessibilityRole="button"
              accessibilityLabel={SWIPES[dir].label}
            >
              <Text style={styles.actionArrow}>{SWIPES[dir].arrow}</Text>
              <Text style={styles.actionLabel}>{SWIPES[dir].label}</Text>
            </Pressable>
          ))}
        </View>
        <Pressable style={styles.textBtn} onPress={() => next("later")}>
          <Text style={styles.textBtnText}>Decide later</Text>
        </Pressable>
      </View>

      {pending ? <UndoBar pending={pending} onUndo={undo} /> : null}
      {guideOpen ? <SwipeGuide onClose={closeGuide} /> : null}

      <CategoryPicker
        visible={pickerOpen}
        selected={save.category}
        onPick={(key) => void pickCategory(key)}
        onClose={() => setPickerOpen(false)}
      />

      {/* Plan and distill open over the deck; closing comes straight back to it. */}
      <Modal
        visible={mode !== null}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setMode(null)}
      >
        <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {mode ? (
            <KeepStep
              key={`${save.id}-${mode}`}
              save={save}
              mode={mode}
              decisionMs={elapsed}
              onBack={() => setMode(null)}
              onKept={() => next(mode === "plan" ? "planned" : "distilled")}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

function UndoBar({ pending, onUndo }: { pending: Pending; onUndo: () => void }) {
  return (
    <View style={styles.undoBar} accessibilityRole="alert">
      <Text style={styles.undoText} numberOfLines={1}>
        {pending.kind === "let_go" ? "Let go" : "Marked done"} · {displayTitle(pending.save)}
      </Text>
      <Pressable style={styles.undoBtn} onPress={onUndo} accessibilityRole="button">
        <Text style={styles.undoBtnText}>Undo</Text>
      </Pressable>
    </View>
  );
}

/** First-run guide: which way does what. Reopened with the "?" button. */
function SwipeGuide({ onClose }: { onClose: () => void }) {
  return (
    <View style={styles.guide}>
      <Text style={[styles.guideEdge, styles.guideTop]}>↑{"\n"}Plan it{"\n"}
        <Text style={styles.guideSub}>pick a next step and a date</Text>
      </Text>
      <View style={styles.guideMiddle}>
        <Text style={styles.guideSide}>←{"\n"}Let go{"\n"}
          <Text style={styles.guideSub}>delete it</Text>
        </Text>
        <View style={styles.guideCard}>
          <Text style={styles.guideCardText}>Swipe the card</Text>
        </View>
        <Text style={styles.guideSide}>→{"\n"}Did it{"\n"}
          <Text style={styles.guideSub}>already acted</Text>
        </Text>
      </View>
      <Text style={styles.guideEdge}>
        <Text style={styles.guideSub}>keep the one lesson{"\n"}</Text>Distill it{"\n"}↓
      </Text>
      <Text style={styles.guideNote}>
        The buttons under the card do the same. Let go and Did it can be undone for 5 seconds.
      </Text>
      <Pressable style={styles.guideBtn} onPress={onClose} accessibilityRole="button">
        <Text style={styles.guideBtnText}>Got it</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

function KeepStep({
  save,
  mode,
  decisionMs,
  onBack,
  onKept,
}: {
  save: Save;
  mode: KeepMode;
  /** Time spent deciding so far, sent with the decision. */
  decisionMs: () => number;
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
        decision_ms: Math.round(decisionMs()),
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
    height: 150,
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
  deckPad: { flex: 1, padding: 20, paddingBottom: 8 },
  deckArea: { flex: 1, justifyContent: "center" },
  swipeCard: {
    padding: 18,
    borderRadius: 32,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  chipRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  categoryChip: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.ink,
    justifyContent: "center",
  },
  categoryChipText: { fontSize: 14, fontWeight: "600", color: "#FDF0DE" },
  chipNote: { fontFamily: handFont, fontSize: 17, color: colors.orangeDeep },
  stamp: {
    position: "absolute",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.orangeDeep,
    backgroundColor: colors.bg,
  },
  stamp_left: { top: 20, right: 20, transform: [{ rotate: "8deg" }] },
  stamp_right: { top: 20, left: 20, transform: [{ rotate: "-8deg" }] },
  stamp_up: { bottom: 20, alignSelf: "center" },
  stamp_down: { top: 20, alignSelf: "center" },
  stampText: { fontSize: 18, fontWeight: "800", color: colors.orangeDeep },
  actionRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  actionBtn: {
    flex: 1,
    minHeight: 60,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  actionArrow: { fontSize: 18, fontWeight: "700", color: colors.ink },
  actionLabel: { fontSize: 12, fontWeight: "600", color: colors.inkSoft },
  undoBar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.ink,
  },
  undoText: { flex: 1, fontSize: 14, color: "#FDF0DE" },
  undoBtn: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: colors.accentTint,
    justifyContent: "center",
  },
  undoBtnText: { fontSize: 14, fontWeight: "700", color: colors.accentText },
  guide: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(28,20,16,0.88)",
    padding: 24,
    justifyContent: "center",
    gap: 22,
  },
  guideEdge: {
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    color: "#FDF0DE",
  },
  guideTop: {},
  guideMiddle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  guideSide: {
    width: 92,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 26,
    color: "#FDF0DE",
  },
  guideSub: { fontSize: 13, fontWeight: "400", color: "#BDB0A4" },
  guideCard: {
    flex: 1,
    height: 140,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: "#FDF0DE",
    alignItems: "center",
    justifyContent: "center",
  },
  guideCardText: { fontFamily: handFont, fontSize: 20, color: "#FDF0DE" },
  guideNote: { textAlign: "center", fontSize: 13, lineHeight: 19, color: "#BDB0A4" },
  guideBtn: {
    alignSelf: "center",
    minHeight: 52,
    paddingHorizontal: 32,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    justifyContent: "center",
  },
  guideBtnText: { fontSize: 16, fontWeight: "700", color: colors.accentText },
});
