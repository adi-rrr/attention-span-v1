import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { fetchMirror } from "./lifecycle";
import { Text, colors, shadow } from "./theme";
import type { Mirror } from "./types";

/** This month, honestly: what you saved, and what you did with it. */
export function MirrorScreen() {
  const [data, setData] = useState<Mirror | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMirror());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your mirror");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
      </View>
    );
  }

  const month = new Date(data.month_start).toLocaleDateString(undefined, {
    month: "long",
  });
  const acted = data.done + data.planned + data.distilled;
  const decided = acted + data.let_go;
  const shelfPct = data.shelf_limit
    ? Math.min(1, data.shelf_used / data.shelf_limit)
    : 0;

  const tiles: { label: string; value: number; note: string }[] = [
    { label: "Did it", value: data.done, note: "acted on" },
    { label: "Planned", value: data.planned, note: "next step set" },
    { label: "Distilled", value: data.distilled, note: "lesson kept" },
    { label: "Let go", value: data.let_go, note: "a clean choice" },
    { label: "Faded", value: data.faded, note: "slipped by" },
    { label: "In inbox", value: data.inbox.total, note: "still to decide" },
  ];

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>{month} so far</Text>
        <Text style={styles.headline}>
          {data.saved === 0
            ? "Nothing saved yet this month."
            : `You saved ${data.saved} ${data.saved === 1 ? "thing" : "things"} and acted on ${acted}.`}
        </Text>
        {decided > 0 ? (
          <Text style={styles.sub}>
            {data.let_go > 0
              ? `Letting go of ${data.let_go} counts too: that's attention you took back.`
              : "Every decision is attention you took back."}
          </Text>
        ) : null}
      </View>

      <View style={styles.grid}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.tileNum}>{t.value}</Text>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={styles.tileNote}>{t.note}</Text>
          </View>
        ))}
      </View>

      <View style={styles.shelf}>
        <View style={styles.shelfHead}>
          <Text style={styles.shelfTitle}>Your shelf</Text>
          <Text style={styles.shelfCount}>
            {data.shelf_used} / {data.shelf_limit}
          </Text>
        </View>
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(shelfPct * 100)}%` }]} />
        </View>
        <Text style={styles.shelfNote}>
          Plans and takeaways you're keeping. When it's full, let one go to keep
          another.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, marginBottom: 8 },
  hero: {
    padding: 20,
    borderRadius: 28,
    backgroundColor: colors.ink,
  },
  eyebrow: { fontSize: 13, fontWeight: "700", color: "#C9C8E0" },
  headline: {
    marginTop: 6,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    letterSpacing: -0.5,
    color: "#FFFFFF",
  },
  sub: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#DCDBF0" },
  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tile: {
    flexBasis: "30%",
    flexGrow: 1,
    padding: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    ...shadow,
  },
  tileNum: { fontSize: 28, fontWeight: "800", color: colors.ink },
  tileLabel: { fontSize: 13, fontWeight: "700", color: colors.ink },
  tileNote: { fontSize: 12, color: colors.muted, marginTop: 1 },
  shelf: {
    marginTop: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.75)",
  },
  shelfHead: { flexDirection: "row", justifyContent: "space-between" },
  shelfTitle: { fontSize: 15, fontWeight: "800", color: colors.ink },
  shelfCount: { fontSize: 15, fontWeight: "700", color: colors.accentText },
  track: {
    marginTop: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.chip,
    overflow: "hidden",
  },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
  shelfNote: { marginTop: 10, fontSize: 13, lineHeight: 18, color: colors.muted },
});
