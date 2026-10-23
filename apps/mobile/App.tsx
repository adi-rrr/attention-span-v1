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
import { Text, colors, fontAssets } from "./src/theme";
import { InboxScreen } from "./src/InboxScreen";
import { DecideScreen } from "./src/DecideScreen";
import { JournalScreen } from "./src/JournalScreen";
import { MirrorScreen } from "./src/MirrorScreen";
import { OutcomeListScreen } from "./src/OutcomeListScreen";
import type { OutcomeKind } from "./src/lifecycle";
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
import {
  authEnabled,
  getSession,
  onSessionChange,
  onSignInRequired,
  signOut,
} from "./src/session";
import { SignInScreen } from "./src/SignInScreen";
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

const TITLE: Record<Tab, string> = {
  inbox: "Inbox",
  library: "Kept",
  journal: "Journal",
  mirror: "Mirror",
  search: "Search",
};

const SUBTITLE: Record<Tab, string> = {
  inbox: "Save freely. Decide what earns your attention.",
  library: "Plans, takeaways and what you've done.",
  journal: "What you actually took from what you saved.",
  mirror: "What you consumed, honestly.",
  search: "Find anything by your own words.",
};

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [tab, setTabState] = useState<Tab>("inbox");
  // A Mirror count opened as a list ("what you did / planned").
  const [outcomeKind, setOutcomeKind] = useState<OutcomeKind | null>(null);
  const setTab = useCallback((next: Tab) => {
    setOutcomeKind(null);
    setTabState(next);
  }, []);
  const [inbox, setInbox] = useState<Save[]>([]);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decideFrom, setDecideFrom] = useState<number | null>(null);
  const [decideRequested, setDecideRequested] = useState(false);
  const [detailSaveId, setDetailSaveId] = useState<string | null>(null);
  const [toast, setToast] = useState<SaveOutcome | null>(null);
  // null while checking for a saved session; always true in local dev mode.
  const [signedIn, setSignedIn] = useState<boolean | null>(authEnabled ? null : true);

  useEffect(() => {
    if (!authEnabled) return;
    void getSession().then((s) => setSignedIn(Boolean(s)));
    const stopSession = onSessionChange((s) => setSignedIn(Boolean(s)));
    // The API said the session is gone (expired or revoked): sign in again.
    const stopRequired = onSignInRequired(() => {
      void signOut();
      setSignedIn(false);
    });
    return () => {
      stopSession();
      stopRequired();
    };
  }, []);

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
    if (signedIn) void refresh();
    else {
      setInbox([]);
      setSummary(null);
    }
  }, [refresh, signedIn]);

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

  if (signedIn === null) {
    return <View style={styles.safe} />;
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        <SignInScreen />
        <Toast
          message={toast?.message ?? null}
          ok={toast?.ok}
          onHide={() => setToast(null)}
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
      {/* The inbox draws its own big-number header. */}
      {tab !== "inbox" ? (
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.pageTitle}>{TITLE[tab]}</Text>
            {authEnabled ? (
              <Pressable
                style={styles.signOut}
                onPress={() => void signOut()}
                accessibilityRole="button"
              >
                <Text style={styles.signOutText}>Sign out</Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.sub}>{SUBTITLE[tab]}</Text>
        </View>
      ) : null}

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
        {tab === "mirror" && outcomeKind ? (
          <OutcomeListScreen
            kind={outcomeKind}
            onBack={() => setOutcomeKind(null)}
            onOpenSave={setDetailSaveId}
          />
        ) : null}
        {tab === "mirror" && !outcomeKind ? (
          <MirrorScreen
            onOpenStat={(stat) =>
              stat === "distilled" ? setTab("journal") : setOutcomeKind(stat)
            }
          />
        ) : null}
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
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
          >
            <View style={[styles.tabDot, tab === t.id && styles.tabDotOn]} />
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
  header: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 6 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  signOut: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    justifyContent: "center",
  },
  signOutText: { fontSize: 13, fontWeight: "600", color: colors.muted },
  pageTitle: {
    fontSize: 44,
    lineHeight: 46,
    fontWeight: "300",
    letterSpacing: -1.6,
    color: colors.ink,
  },
  sub: { marginTop: 4, fontSize: 15, fontWeight: "300", color: colors.muted },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
  error: { color: colors.danger, marginBottom: 8 },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 14,
    paddingHorizontal: 6,
    height: 62,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
  },
  tab: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  tabDot: { width: 6, height: 6, borderRadius: 3 },
  tabDotOn: { backgroundColor: "#F08A3A" },
  tabLabel: { fontSize: 13, fontWeight: "400", color: "#BDB0A4" },
  tabLabelActive: { color: "#FDF0DE", fontWeight: "600" },
});
