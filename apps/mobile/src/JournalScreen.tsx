import * as Linking from "expo-linking";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { confirmDestructive } from "./confirm";
import { fetchJournal, letGo } from "./lifecycle";
import { displayTitle } from "./text";
import { Text, colors, shadow } from "./theme";
import type { Save } from "./types";

/** Everything kept as a takeaway: what you actually took from what you saved. */
export function JournalScreen() {
  const [items, setItems] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await fetchJournal()).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your journal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function release(save: Save) {
    confirmDestructive(
      "Let this go?",
      "The takeaway and the saved post are deleted for good.",
      "Let go",
      () => {
        void letGo(save.id)
          .then(load)
          .catch((e) => setError(e instanceof Error ? e.message : "Couldn't let go"));
      },
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : null}
      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing distilled yet</Text>
          <Text style={styles.emptyText}>
            When you choose “Distill it” on a save, the one thing you want to
            remember lands here. The post can go; the lesson stays.
          </Text>
        </View>
      ) : null}
      {items.map((s) => (
        <View key={s.id} style={styles.card}>
          <Text style={styles.takeaway}>“{s.takeaway}”</Text>
          {s.title || s.source_url ? (
            <View style={styles.sourceRow}>
              <View style={styles.dot} />
              <Text style={styles.source} numberOfLines={1}>
                {displayTitle(s)}
              </Text>
            </View>
          ) : null}
          <View style={styles.actions}>
            {s.source_url ? (
              <Pressable
                style={styles.pill}
                onPress={() => void Linking.openURL(s.source_url!)}
              >
                <Text style={styles.pillText}>Open original</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.ghost} onPress={() => release(s)}>
              <Text style={styles.ghostText}>Let go</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: {
    marginTop: 8,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  emptyText: { marginTop: 6, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  card: {
    padding: 18,
    borderRadius: 24,
    backgroundColor: colors.surface,
    marginBottom: 12,
    ...shadow,
  },
  takeaway: {
    fontSize: 19,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    color: colors.ink,
  },
  sourceRow: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.peach },
  source: { flex: 1, fontSize: 13, color: colors.muted },
  actions: { marginTop: 12, flexDirection: "row", gap: 8 },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    justifyContent: "center",
  },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.accentText },
  ghost: { minHeight: 40, paddingHorizontal: 10, justifyContent: "center" },
  ghostText: { fontSize: 13, fontWeight: "600", color: colors.muted },
});
