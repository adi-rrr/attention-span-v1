import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import {
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  StyleSheet,
  View,
} from "react-native";
import { Text, colors, fontAssets, shadow } from "./src/theme";
import { InboxScreen } from "./src/InboxScreen";
import { DecideScreen } from "./src/DecideScreen";
import { JournalScreen } from "./src/JournalScreen";
import { MirrorScreen } from "./src/MirrorScreen";
import { SearchScreen } from "./src/SearchScreen";
import { LibraryScreen } from "./src/LibraryScreen";
import { SaveDetailScreen } from "./src/SaveDetailScreen";
import { Toast } from "./src/components/Toast";
import { fetchInbox } from "./src/lifecycle";
import { useShareHandoff } from "./src/share/useShareHandoff";
import { parseSaveDeepLink } from "./src/share/platform";
import type { SaveOutcome } from "./src/share/saveMessages";
import {
  initReminderNotifications,
  listenForReminderTaps,
} from "./src/reminders/listen";
import { scheduleDailyDigest } from "./src/reminders/digest";
import { onPasscodeRequired, setPasscode } from "./src/passcode";
import { PasscodeScreen } from "./src/PasscodeScreen";
import type { InboxSummary, Save } from "./src/types";

initReminderNotifications();

type Tab = "inbox" | "library" | "journal" | "mirror" | "search";

const TABS: { id: Tab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "mirror", label: "Mirror" },
  { id: "library", label: "Kept" },
  { id: "journal", label: "Journal" },
  { id: "search", label: "Search" },
];

const SUBTITLE: Record<Tab, string> = {
  inbox: "Save freely. Decide what earns your attention.",
  library: "Plans, takeaways and what you've done.",
  journal: "What you actually took from what you saved.",
  mirror: "What you consumed, honestly.",
  search: "Find anything by your own words.",
};

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [tab, setTab] = useState<Tab>("inbox");
  const [inbox, setInbox] = useState<Save[]>([]);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decideFrom, setDecideFrom] = useState<number | null>(null);
  const [decideRequested, setDecideRequested] = useState(false);
  const [detailSaveId, setDetailSaveId] = useState<string | null>(null);
  const [toast, setToast] = useState<SaveOutcome | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => onPasscodeRequired(() => setLocked(true)), []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchInbox();
      setInbox(res.items);
      setSummary(res.summary);
      void scheduleDailyDigest(res.items, res.summary.digest_hour).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onShareResult = useCallback(
    (outcome: SaveOutcome) => {
      setToast(outcome);
      void refresh();
    },
    [refresh],
  );
  useShareHandoff(onShareResult);

  // A tapped digest opens the decision session once the inbox has loaded.
  useEffect(() => {
    if (!decideRequested || loading) return;
    setDecideRequested(false);
    if (inbox.length > 0) setDecideFrom(0);
  }, [decideRequested, loading, inbox.length]);

  useEffect(() => {
    function openFromReminder(saveId: string) {
      setDecideFrom(null);
      setDetailSaveId(saveId);
    }

    function openDigest() {
      setDetailSaveId(null);
      setTab("inbox");
      setDecideRequested(true);
      void refresh();
    }

    function handleUrl(url: string) {
      const saveId = parseSaveDeepLink(url);
      if (saveId) openFromReminder(saveId);
    }

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const linkSub = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    const stopReminderTaps = listenForReminderTaps(openFromReminder, openDigest);

    return () => {
      linkSub.remove();
      stopReminderTaps();
    };
  }, [refresh]);

  if (!fontsLoaded) {
    return <View style={styles.safe} />;
  }

  if (locked) {
    return (
      <SafeAreaView style={styles.safe}>
        <PasscodeScreen
          onSubmit={(code) => {
            setPasscode(code);
            setLocked(false);
            void refresh();
          }}
        />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (decideFrom !== null) {
    return (
      <SafeAreaView style={styles.safe}>
        <DecideScreen
          items={inbox}
          startIndex={decideFrom}
          lifespanDays={summary?.lifespan_days ?? 7}
          onClose={() => {
            setDecideFrom(null);
            void refresh();
          }}
        />
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  if (detailSaveId) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.body}>
          <SaveDetailScreen
            saveId={detailSaveId}
            onClose={() => {
              setDetailSaveId(null);
              void refresh();
            }}
          />
        </View>
        <StatusBar style="dark" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      {/* Clipped layer, so the overhanging shapes can't widen (and shift) the page. */}
      <View pointerEvents="none" style={styles.backdrop}>
        <View style={styles.blobPeach} />
        <View style={styles.blobLilac} />
      </View>
      <View style={styles.header}>
        <Text style={styles.brand}>Attention Span</Text>
        <Text style={styles.sub}>{SUBTITLE[tab]}</Text>
      </View>

      <View style={styles.body}>
        {error ? (
          <Pressable onPress={() => void refresh()}>
            <Text style={styles.error}>{error} · Tap to retry</Text>
          </Pressable>
        ) : null}
        {tab === "inbox" ? (
          <InboxScreen
            items={inbox}
            summary={summary}
            loading={loading}
            onRefresh={() => void refresh()}
            onDecide={setDecideFrom}
          />
        ) : null}
        {tab === "library" ? <LibraryScreen onOpenSave={setDetailSaveId} /> : null}
        {tab === "journal" ? <JournalScreen /> : null}
        {tab === "mirror" ? <MirrorScreen /> : null}
        {tab === "search" ? <SearchScreen onOpenSave={setDetailSaveId} /> : null}
      </View>

      <Toast
        message={toast?.message ?? null}
        ok={toast?.ok}
        onHide={() => setToast(null)}
      />

      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable
            key={t.id}
            onPress={() => setTab(t.id)}
            style={[styles.tab, tab === t.id && styles.tabActive]}
          >
            <Text
              style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}
              numberOfLines={1}
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <StatusBar style="dark" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
    // SafeAreaView only insets on iOS; push content below the Android status bar.
    paddingTop: Platform.OS === "android" ? RNStatusBar.currentHeight : 0,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: "hidden",
  },
  blobPeach: {
    position: "absolute",
    top: -90,
    right: -110,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.peach,
    opacity: 0.55,
  },
  blobLilac: {
    position: "absolute",
    top: 320,
    left: -150,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.lilac,
    opacity: 0.45,
  },
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  brand: {
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  sub: { marginTop: 4, fontSize: 14, color: colors.muted },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  error: { color: colors.danger, marginBottom: 8 },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 5,
    borderRadius: 999,
    backgroundColor: colors.surface,
    ...shadow,
  },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  tabActive: { backgroundColor: colors.accent },
  tabLabel: { fontSize: 12, fontWeight: "600", color: colors.faint },
  tabLabelActive: { color: "#FFFFFF", fontWeight: "700" },
});
