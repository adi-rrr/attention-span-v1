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
import { fetchOutcomes, platformLabel, type OutcomeKind } from "./lifecycle";
import { deviceTimezone, formatReminderTime } from "./reminders/format";
import { displayTitle } from "./text";
import { Text, colors, shadow } from "./theme";
import type { Save } from "./types";

type Props = {
  kind: OutcomeKind;
  onBack: () => void;
  onOpenSave: (saveId: string) => void;
};

const COPY: Record<OutcomeKind, { title: string; empty: string }> = {
  done: {
    title: "What you did",
    empty: "Nothing marked done yet this month. When you act on a save, choose “Did it”.",
  },
  planned: {
    title: "What you planned",
    empty: "No plans yet this month. “Plan it” turns a save into a next step with a date.",
  },
};

function shortDate(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** The saves behind a Mirror count, this month. */
export function OutcomeListScreen({ kind, onBack, onOpenSave }: Props) {
  const [items, setItems] = useState<Save[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems((await fetchOutcomes(kind, deviceTimezone())).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load this list");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <View style={styles.screen}>
      <View style={styles.topRow}>
        <Pressable style={styles.roundBtn} onPress={onBack} accessibilityLabel="Back">
          <Text style={styles.roundBtnText}>←</Text>
        </Pressable>
        <Text style={styles.heading}>{COPY[kind].title}</Text>
        <View style={styles.roundSpacer} />
      </View>
      <Text style={styles.sub}>This month · {items.length}</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
      >
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {loading && items.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
        ) : null}
        {!loading && items.length === 0 ? (
          <Text style={styles.empty}>{COPY[kind].empty}</Text>
        ) : null}

        {items.map((s) => (
          <Pressable key={s.id} style={styles.card} onPress={() => onOpenSave(s.id)}>
            <Text style={styles.meta}>
              {platformLabel(s.platform)}
              {kind === "done" && s.decided_at ? ` · done ${shortDate(s.decided_at)}` : ""}
            </Text>
            <Text style={styles.title} numberOfLines={2}>
              {displayTitle(s)}
            </Text>
            {kind === "planned" && s.plan_text ? (
              <View style={styles.plan}>
                <Text style={styles.planText}>{s.plan_text}</Text>
                {s.plan_at ? (
                  <Text style={styles.planWhen}>{formatReminderTime(s.plan_at)}</Text>
                ) : null}
              </View>
            ) : null}
            {s.source_url ? (
              <Pressable
                style={styles.openBtn}
                onPress={() => void Linking.openURL(s.source_url!)}
                accessibilityLabel="Open the original post"
              >
                <Text style={styles.openBtnText}>Open post ↗</Text>
              </Pressable>
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  roundBtnText: { fontSize: 20, color: colors.ink },
  roundSpacer: { width: 44 },
  heading: { fontSize: 18, fontWeight: "800", color: colors.ink },
  sub: { marginTop: 6, marginBottom: 12, textAlign: "center", fontSize: 13, color: colors.muted },
  scroll: { paddingBottom: 40 },
  error: { color: colors.danger, marginBottom: 8 },
  empty: { marginTop: 8, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    marginBottom: 12,
    ...shadow,
  },
  meta: { fontSize: 12, fontWeight: "600", color: colors.muted },
  title: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: "700", color: colors.ink },
  plan: {
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.accentTint,
  },
  planText: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: colors.ink },
  planWhen: { marginTop: 2, fontSize: 13, fontWeight: "600", color: colors.accentText },
  openBtn: {
    alignSelf: "flex-start",
    marginTop: 10,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.accentTint,
    justifyContent: "center",
  },
  openBtnText: { fontSize: 13, fontWeight: "700", color: colors.accentText },
});
