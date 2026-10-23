import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { fadeInfo, fadeOpacity, saveMetaLine } from "./lifecycle";
import { displayTitle } from "./text";
import { Text, colors, shadow } from "./theme";
import type { InboxSummary, Save } from "./types";

type Props = {
  items: Save[];
  summary: InboxSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onDecide: (startIndex: number) => void;
};

export function InboxScreen({ items, summary, loading, onRefresh, onDecide }: Props) {
  const lifespan = summary?.lifespan_days ?? 7;
  const fading = summary?.fading_24h ?? 0;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={onRefresh} />
      }
    >
      {items.length > 0 ? (
        <View style={styles.sortCard}>
          <View style={styles.sortText}>
            <Text style={styles.sortTitle}>
              {fading > 0
                ? `${fading} ${fading === 1 ? "save fades" : "saves fade"} within a day`
                : `${items.length} ${items.length === 1 ? "save" : "saves"} waiting`}
            </Text>
            <Text style={styles.sortSub}>
              Did it, plan it, distill it or let it go.
            </Text>
          </View>
          <Pressable style={styles.sortBtn} onPress={() => onDecide(0)}>
            <Text style={styles.sortBtnText}>Sort now</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 24 }} />
      ) : null}

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Inbox zero</Text>
          <Text style={styles.emptyText}>
            Share anything from Instagram, YouTube or Reddit to Attention Span.
            It waits here for {lifespan} days, then fades for good unless you act
            on it.
          </Text>
        </View>
      ) : null}

      {items.map((s, i) => {
        const fade = fadeInfo(s.expires_at, lifespan);
        return (
          <Pressable
            key={s.id}
            style={[styles.card, { opacity: fadeOpacity(fade.fraction) }]}
            onPress={() => onDecide(i)}
          >
            <View style={styles.cardTop}>
              <View style={styles.thumb} />
              <View style={styles.cardBody}>
                <Text style={styles.meta}>
                  {saveMetaLine(s)}
                </Text>
                <Text style={styles.title} numberOfLines={2}>
                  {displayTitle(s)}
                </Text>
              </View>
            </View>
            {s.ai_reason ? (
              <Text style={styles.guess} numberOfLines={2}>
                {s.ai_reason}
              </Text>
            ) : null}
            <View style={styles.lifeRow}>
              <View style={styles.lifeTrack}>
                <View
                  style={[
                    styles.lifeFill,
                    fade.urgent && styles.lifeFillUrgent,
                    { width: `${Math.round(fade.fraction * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.lifeLabel, fade.urgent && styles.lifeLabelUrgent]}>
                {fade.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  sortCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 24,
    backgroundColor: colors.ink,
    marginBottom: 16,
  },
  sortText: { flex: 1 },
  sortTitle: { color: "#FFFFFF", fontSize: 16, fontWeight: "800" },
  sortSub: { color: "#C9C8E0", fontSize: 13, marginTop: 2 },
  sortBtn: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: colors.peach,
    alignItems: "center",
    justifyContent: "center",
  },
  sortBtnText: { color: colors.ink, fontSize: 14, fontWeight: "800" },
  empty: {
    marginTop: 8,
    padding: 20,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.7)",
  },
  emptyTitle: { fontSize: 20, fontWeight: "800", color: colors.ink },
  emptyText: { marginTop: 6, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  card: {
    backgroundColor: colors.surface,
    padding: 12,
    borderRadius: 22,
    marginBottom: 12,
    ...shadow,
  },
  cardTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.peach,
  },
  cardBody: { flex: 1 },
  meta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    marginBottom: 2,
  },
  title: { fontSize: 15, fontWeight: "700", color: colors.ink, lineHeight: 20 },
  guess: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 19,
    color: colors.accentText,
    fontWeight: "500",
  },
  lifeRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  lifeTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.chip,
    overflow: "hidden",
  },
  lifeFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
  lifeFillUrgent: { backgroundColor: "#E8835F" },
  lifeLabel: { fontSize: 12, fontWeight: "600", color: colors.muted },
  lifeLabelUrgent: { color: "#B54A24" },
});
