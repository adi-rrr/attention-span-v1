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
import { Ember } from "./doodles";
import { Text, colors, handFont } from "./theme";
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
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : null}
      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Ember pose="write" size={96} filled={false} />
          <Text style={styles.emptyTitle}>Nothing distilled yet</Text>
          <Text style={styles.emptyText}>
            When you choose “Distill it” on a save, the one thing you want to
            remember lands here. The post can go; the lesson stays.
          </Text>
        </View>
      ) : null}
      {items.map((s) => (
        <View key={s.id} style={styles.card}>
          {s.decided_at ? (
            <Text style={styles.when}>
              {new Date(s.decided_at)
                .toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })
                .toLowerCase()}
            </Text>
          ) : null}
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
  scroll: { paddingTop: 8, paddingBottom: 120 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: { marginTop: 8, paddingTop: 16, borderTopWidth: 1.5, borderTopColor: colors.ink },
  emptyTitle: { fontSize: 26, fontWeight: "300", letterSpacing: -0.6, color: colors.ink },
  emptyText: { marginTop: 6, fontSize: 15, lineHeight: 22, fontWeight: "300", color: colors.inkSoft },
  card: {
    paddingVertical: 16,
    borderTopWidth: 1.5,
    borderTopColor: colors.ink,
  },
  when: { fontFamily: handFont, fontSize: 18, color: colors.orangeDeep, marginBottom: 4 },
  takeaway: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "300",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  sourceRow: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.orange },
  source: { flex: 1, fontSize: 13, color: colors.muted },
  actions: { marginTop: 10, flexDirection: "row", gap: 8 },
  pill: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    justifyContent: "center",
  },
  pillText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  ghost: { minHeight: 40, paddingHorizontal: 10, justifyContent: "center" },
  ghostText: { fontSize: 13, fontWeight: "600", color: colors.muted },
});
