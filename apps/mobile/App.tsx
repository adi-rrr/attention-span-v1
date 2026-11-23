import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Image,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Text, colors, fontAssets } from "./src/theme";
import { InboxScreen } from "./src/InboxScreen";
import { DecideScreen } from "./src/DecideScreen";
import { JournalScreen } from "./src/JournalScreen";
import { MirrorScreen } from "./src/MirrorScreen";
import { OutcomeListScreen } from "./src/OutcomeListScreen";
import type { OutcomeKind } from "./src/lifecycle";
import { LibraryScreen } from "./src/LibraryScreen";
import { SaveDetailScreen } from "./src/SaveDetailScreen";
import { Toast } from "./src/components/Toast";
import { ArrivalSheet } from "./src/components/ArrivalSheet";
import { checkArrival, countryName, fetchPlaces } from "./src/arrival";
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
import { WelcomeScreen } from "./src/WelcomeScreen";
import { ensureShareKey, forgetShareKey, releaseShareKey } from "./src/share/shareKey";
import type { InboxSummary, Save } from "./src/types";

initReminderNotifications();

type Tab = "inbox" | "library" | "journal" | "mirror";

const TABS: { id: Tab; label: string }[] = [
  { id: "mirror", label: "Mirror" },
  { id: "inbox", label: "Inbox" },
  { id: "library", label: "Kept" },
  { id: "journal", label: "Journal" },
];

const TITLE: Record<Tab, string> = {
  inbox: "Inbox",
  library: "Kept",
  journal: "Journal",
  mirror: "Mirror",
};

const SUBTITLE: Record<Tab, string> = {
  inbox: "Save freely. Decide what earns your attention.",
  library: "What you kept, and a way to find it again.",
  journal: "What you actually took from what you saved.",
  mirror: "What you consumed, honestly.",
};

/** Real per-device insets: status bar, camera cutout and gesture bar. */
export default function App() {
  return (
    <SafeAreaProvider>
      <AppScreens />
    </SafeAreaProvider>
  );
}

/** How long the Intent logo stays up when the app starts. */
const INTRO_MS = 1500;

function AppScreens() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(t);
  }, []);
  const [tab, setTabState] = useState<Tab>("inbox");
  // A Mirror count opened as a list ("what you did / planned"), for the month
  // or for one tapped calendar day.
  const [outcome, setOutcome] = useState<{ kind: OutcomeKind; day?: string } | null>(null);
  const setTab = useCallback((next: Tab) => {
    setOutcome(null);
    setTabState(next);
  }, []);
  const [inbox, setInbox] = useState<Save[]>([]);
  const [summary, setSummary] = useState<InboxSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decideFrom, setDecideFrom] = useState<number | null>(null);
  // The deck's cards when it isn't the whole inbox (e.g. places on arrival).
  const [decideItems, setDecideItems] = useState<Save[] | null>(null);
  const [arrival, setArrival] = useState<{ country: string; items: Save[] } | null>(null);
  const [decideRequested, setDecideRequested] = useState(false);
  const [detailSaveId, setDetailSaveId] = useState<string | null>(null);
  const [toast, setToast] = useState<SaveOutcome | null>(null);
  const homeChosen = useRef(false);
  // null while checking for a saved session; always true in local dev mode.
  const [signedIn, setSignedIn] = useState<boolean | null>(authEnabled ? null : true);
  // Signed out: the welcome page first, then log in / sign up.
  const [authView, setAuthView] = useState<"welcome" | "signin">("welcome");
  useEffect(() => {
    // After signing out, start again from the welcome page.
    if (signedIn) setAuthView("welcome");
  }, [signedIn]);

  useEffect(() => {
    if (!authEnabled) return;
    void getSession().then((s) => setSignedIn(Boolean(s)));
    const stopSession = onSessionChange((s) => setSignedIn(Boolean(s)));
    // The API said the session is gone (expired or revoked): sign in again.
    const stopRequired = onSignInRequired(() => {
      forgetShareKey();
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
      // Home: new users start on their saves; once they've decided anything,
      // they land on Mirror to see where they stand. Chosen once per launch.
      if (!homeChosen.current) {
        homeChosen.current = true;
        if (res.summary.decisions_total > 0) setTabState("mirror");
      }
      void scheduleDailyDigest(res.items, res.summary.digest_hour).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Signed in: the background share receiver gets its own device key.
    if (signedIn) void ensureShareKey().catch(() => {});
  }, [signedIn]);

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

  // Landed in another country? Offer the place saves from there.
  useEffect(() => {
    if (!signedIn) return;
    async function check() {
      const country = await checkArrival();
      if (!country) return;
      const { items } = await fetchPlaces(country);
      if (items.length > 0) setArrival({ country: countryName(country), items });
    }
    void check().catch(() => {});
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void check().catch(() => {});
    });
    return () => sub.remove();
  }, [signedIn]);

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

  // The Intent logo shows for at least 1.5 s on launch, and longer only if
  // fonts or the saved session are still loading.
  if (!introDone || !fontsLoaded || signedIn === null) {
    return (
      <View style={styles.intro}>
        <Image
          source={require("./assets/splash-icon.png")}
          style={styles.introLogo}
          resizeMode="contain"
          accessibilityLabel="Intent"
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safe}>
        {authView === "welcome" ? (
          <WelcomeScreen onStart={() => setAuthView("signin")} />
        ) : (
          <SignInScreen initialMode="signup" onBack={() => setAuthView("welcome")} />
        )}
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
          items={decideItems ?? inbox}
          startIndex={decideFrom}
          lifespanDays={summary?.lifespan_days ?? 7}
          onClose={() => {
            setDecideFrom(null);
            setDecideItems(null);
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
                onPress={() => void releaseShareKey().finally(() => void signOut())}
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
        {tab === "mirror" && outcome ? (
          <OutcomeListScreen
            kind={outcome.kind}
            day={outcome.day}
            onBack={() => setOutcome(null)}
            onOpenSave={setDetailSaveId}
          />
        ) : null}
        {tab === "mirror" && !outcome ? (
          <MirrorScreen
            onOpenStat={(stat) =>
              stat === "distilled" ? setTab("journal") : setOutcome({ kind: stat })
            }
            onOpenDay={(kind, day) => setOutcome({ kind, day })}
            onSort={() => (inbox.length > 0 ? setDecideFrom(0) : setTab("inbox"))}
            onViewReminders={() => setTab("library")}
            onOpenSave={setDetailSaveId}
          />
        ) : null}
      </View>

      <Toast
        message={toast?.message ?? null}
        ok={toast?.ok}
        onHide={() => setToast(null)}
      />

      <ArrivalSheet
        arrival={arrival}
        onGo={() => {
          setDecideItems(arrival?.items ?? null);
          setArrival(null);
          setDecideFrom(0);
        }}
        onLater={() => setArrival(null)}
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
  // Matches the white background of the app icon.
  intro: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  // Same size as the native launch screen (expo-splash-screen imageWidth in
  // app.json), so the hand-off from the phone's screen to ours doesn't jump.
  // splash-icon.png is 1962 × 989.
  introLogo: { width: 240, height: Math.round((240 * 989) / 1962) },
  safe: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
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
