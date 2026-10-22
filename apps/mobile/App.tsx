import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import * as Linking from "expo-linking";
import * as Notifications from "expo-notifications";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  SafeAreaView,
  StatusBar as RNStatusBar,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, colors, fontAssets, shadow } from "./src/theme";
import { api } from "./src/api";
import { displayTitle } from "./src/text";
import { UnderstandScreen } from "./src/UnderstandScreen";
import { SearchScreen } from "./src/SearchScreen";
import { LibraryScreen } from "./src/LibraryScreen";
import { SaveDetailScreen } from "./src/SaveDetailScreen";
import { DuplicateSaveModal } from "./src/components/DuplicateSaveModal";
import { useShareHandoff } from "./src/share/useShareHandoff";
import { parseSaveDeepLink } from "./src/share/platform";
import {
  saveIdFromNotificationData,
  setupNotificationHandler,
} from "./src/reminders/notifications";
import type { Save } from "./src/types";

setupNotificationHandler();

type Tab = "inbox" | "library" | "search" | "map";

const TABS: { id: Tab; label: string }[] = [
  { id: "inbox", label: "Inbox" },
  { id: "library", label: "Library" },
  { id: "search", label: "Search" },
  { id: "map", label: "Map" },
];

const DEV_USER = "00000000-0000-4000-8000-000000000001";

export default function App() {
  const [fontsLoaded] = useFonts(fontAssets);
  const [tab, setTab] = useState<Tab>("inbox");
  const [inbox, setInbox] = useState<Save[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSave, setActiveSave] = useState<Save | null>(null);
  const [detailSaveId, setDetailSaveId] = useState<string | null>(null);

  const openUnderstand = useCallback((save: Save) => {
    setActiveSave(save);
    setError(null);
  }, []);

  const {
    duplicate,
    busy: shareBusy,
    error: shareError,
    cancelDuplicate,
    replaceDuplicate,
    clearError: clearShareError,
  } = useShareHandoff(openUnderstand);

  const displayError = error ?? shareError;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const inboxRes = await api<{ items: Save[] }>("/saves?inbox=true");
      setInbox(inboxRes.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    function openFromReminder(saveId: string) {
      setActiveSave(null);
      setDetailSaveId(saveId);
    }

    function handleUrl(url: string) {
      const saveId = parseSaveDeepLink(url);
      if (saveId) openFromReminder(saveId);
    }

    void Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const linkSub = Linking.addEventListener("url", ({ url }) => handleUrl(url));

    const notifSub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const saveId = saveIdFromNotificationData(
          response.notification.request.content.data,
        );
        if (saveId) openFromReminder(saveId);
      },
    );

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      const saveId = saveIdFromNotificationData(
        response?.notification.request.content.data,
      );
      if (saveId) {
        Notifications.clearLastNotificationResponse();
        openFromReminder(saveId);
      }
    });

    return () => {
      linkSub.remove();
      notifSub.remove();
    };
  }, []);

  async function createDemoSave() {
    setLoading(true);
    setError(null);
    try {
      // Stable YouTube URL so preview oEmbed works; replace if already saved
      const save = await api<Save>("/saves", {
        method: "POST",
        body: JSON.stringify({
          platform: "youtube",
          source_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          replace_existing: true,
        }),
      });
      setActiveSave(save);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setLoading(false);
    }
  }

  if (!fontsLoaded) {
    return <View style={styles.safe} />;
  }

  if (activeSave) {
    return (
      <SafeAreaView style={styles.safe}>
        <UnderstandScreen
          saveId={activeSave.id}
          saveTitle={displayTitle(activeSave)}
          onDone={() => {
            setActiveSave(null);
            void refresh();
            setTab("library");
          }}
          onCancel={() => {
            setActiveSave(null);
            void refresh();
          }}
        />
        <DuplicateSaveModal
          visible={duplicate !== null}
          savedAt={duplicate?.savedAt}
          onCancel={cancelDuplicate}
          onReplace={() => void replaceDuplicate()}
          busy={shareBusy}
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
      <View pointerEvents="none" style={styles.blobPeach} />
      <View pointerEvents="none" style={styles.blobLilac} />
      <View style={styles.header}>
        <Text style={styles.brand}>Attention Span</Text>
        <Text style={styles.sub}>Saved with a reason, brought back on time.</Text>
      </View>

      <View style={styles.body}>
        {[
          displayError ? (
            <Pressable key="err" onPress={clearShareError}>
              <Text style={styles.error}>{displayError}</Text>
            </Pressable>
          ) : null,
          loading && !inbox.length && tab === "inbox" ? (
            <ActivityIndicator key="load" />
          ) : null,
          tab === "inbox" ? (
            <ScrollView key="inbox">
              <Text style={styles.sectionLabel}>Waiting for your why</Text>
              {inbox.length === 0 ? (
                <Text style={styles.placeholder}>
                  Nothing waiting. Share a post from Instagram, YouTube or Reddit
                  to Attention Span to get started.
                </Text>
              ) : (
                inbox.map((s) => (
                  <Pressable
                    key={s.id}
                    style={styles.card}
                    onPress={() => setActiveSave(s)}
                  >
                    <View style={styles.thumb} />
                    <View style={styles.cardBody}>
                      <Text style={styles.cardMeta}>{s.platform}</Text>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {displayTitle(s)}
                      </Text>
                    </View>
                    <View style={styles.reflectPill}>
                      <Text style={styles.reflectPillText}>Reflect</Text>
                    </View>
                  </Pressable>
                ))
              )}
              <Pressable
                style={styles.demoBtn}
                onPress={() => void createDemoSave()}
              >
                <Text style={styles.demoBtnText}>+ Try a demo save</Text>
              </Pressable>
            </ScrollView>
          ) : null,
          tab === "library" ? (
            <LibraryScreen key="library" onOpenSave={setDetailSaveId} />
          ) : null,
          tab === "search" ? (
            <SearchScreen key="search" onOpenSave={setDetailSaveId} />
          ) : null,
          tab === "map" ? (
            <Text key="map" style={styles.placeholder}>
              Map — place-type pins only (P4).
            </Text>
          ) : null,
        ]}
      </View>
      <DuplicateSaveModal
        visible={duplicate !== null}
        savedAt={duplicate?.savedAt}
        onCancel={cancelDuplicate}
        onReplace={() => void replaceDuplicate()}
        busy={shareBusy}
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 12,
  },
  placeholder: { fontSize: 16, lineHeight: 24, color: colors.inkSoft, marginTop: 4 },
  error: { color: colors.danger, marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: 10,
    borderRadius: 22,
    marginBottom: 12,
    ...shadow,
  },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.peach,
  },
  cardBody: { flex: 1, marginHorizontal: 12 },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, lineHeight: 20 },
  cardMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    textTransform: "capitalize",
    marginBottom: 2,
  },
  reflectPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
  },
  reflectPillText: { fontSize: 13, fontWeight: "700", color: colors.accentText },
  demoBtn: {
    alignSelf: "flex-start",
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#A9AAE0",
  },
  demoBtnText: { fontSize: 14, fontWeight: "600", color: colors.accentText },
  tabBar: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 6,
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
  tabLabel: { fontSize: 13, fontWeight: "600", color: colors.faint },
  tabLabelActive: { color: "#FFFFFF", fontWeight: "700" },
});
