import * as Linking from "expo-linking";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Ember, LifeDots, MeltIcon, MeltTile, daysLeftOf } from "./doodles";
import { platformLabel } from "./lifecycle";
import { displayTitle } from "./text";
import { Text, colors, handFont } from "./theme";
import type { InboxSummary, Save } from "./types";

type Props = {
  items: Save[];
  summary: InboxSummary | null;
  loading: boolean;
  onRefresh: () => void;
  onDecide: (startIndex: number) => void;
};

const HOUR = 60 * 60 * 1000;

/** "5 h left" on the last day, otherwise "3 days". */
function timeLeft(expiresAt: string | null | undefined): string {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= HOUR) return "under 1 h";
  if (ms < 24 * HOUR) return `${Math.round(ms / HOUR)} h left`;
  const d = Math.round(ms / (24 * HOUR));
  return d === 1 ? "1 day" : `${d} days`;
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

export function InboxScreen({ items, summary, loading, onRefresh, onDecide }: Props) {
  const lifespan = summary?.lifespan_days ?? 7;
  const rows = items.map((save, index) => ({
    save,
    index,
    days: daysLeftOf(save.expires_at),
  }));
  const today = rows.filter((r) => r.days <= 1);
  const week = rows.filter((r) => r.days > 1);

  function renderRow({ save, index, days }: (typeof rows)[number]) {
    const urgent = days <= 1;
    return (
      <Pressable
        key={save.id}
        style={styles.row}
        onPress={() => onDecide(index)}
        accessibilityHint="Opens the decision for this save"
      >
        <MeltTile daysLeft={days} />
        <View style={styles.rowBody}>
          <Text style={styles.title} numberOfLines={1}>
            {displayTitle(save)}
          </Text>
          <Text style={styles.meta}>{platformLabel(save.platform)}</Text>
          <View style={styles.dotsRow}>
            <LifeDots daysLeft={days} />
          </View>
        </View>
        <View style={styles.rowEnd}>
          <Text style={[styles.left, urgent && styles.leftUrgent]}>
            {timeLeft(save.expires_at)}
          </Text>
          {save.source_url ? (
            <Pressable
              hitSlop={8}
              onPress={() => void Linking.openURL(save.source_url!)}
              accessibilityLabel="Open the original post"
            >
              <Text style={styles.open}>Open ↗</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
    >
      <View style={styles.hero}>
        <Text style={styles.bigNum}>{items.length}</Text>
        <View style={styles.heroText}>
          <Text style={styles.heroLabel}>
            {items.length === 1 ? "SAVE MELTING" : "SAVES MELTING"}
          </Text>
          <Text style={styles.heroDate}>{todayLabel()}</Text>
        </View>
        <View style={styles.heroEmber}>
          <Ember pose="peek" size={64} />
        </View>
      </View>

      {today.length > 0 ? (
        <Pressable
          style={styles.banner}
          onPress={() => onDecide(today[0].index)}
          accessibilityRole="button"
        >
          <MeltIcon daysLeft={0} size={54} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerEyebrow}>melting today</Text>
            <Text style={styles.bannerTitle}>
              {today.length} {today.length === 1 ? "save needs" : "saves need"} you
            </Text>
          </View>
          <View style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>Save them →</Text>
          </View>
        </Pressable>
      ) : items.length > 0 ? (
        <Pressable style={styles.sortLink} onPress={() => onDecide(0)}>
          <Text style={styles.sortLinkText}>Sort now · 2 min</Text>
          <Text style={styles.sortLinkArrow}>→</Text>
        </Pressable>
      ) : null}

      {loading && items.length === 0 ? (
        <ActivityIndicator color={colors.ink} style={{ marginTop: 24 }} />
      ) : null}

      {!loading && items.length === 0 ? (
        <View style={styles.empty}>
          <Ember pose="peek" size={90} />
          <Text style={styles.emptyTitle}>Nothing melting.</Text>
          <Text style={styles.emptyText}>
            Share anything from Instagram, YouTube or Reddit. You get {lifespan} days
            to plan it, learn from it, or let it go.
          </Text>
        </View>
      ) : null}

      {today.length > 0 ? (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionLabel, styles.sectionHot]}>MELTING TODAY</Text>
            <Text style={[styles.sectionNote, styles.sectionHot]}>act or let go</Text>
          </View>
          {today.map(renderRow)}
        </>
      ) : null}

      {week.length > 0 ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>THIS WEEK</Text>
            <Text style={styles.sectionNote}>no rush yet</Text>
          </View>
          {week.map(renderRow)}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 10, paddingBottom: 120 },
  hero: { flexDirection: "row", alignItems: "flex-end", gap: 14 },
  bigNum: {
    fontSize: 104,
    lineHeight: 96,
    fontWeight: "700",
    letterSpacing: -6,
    color: colors.ink,
  },
  heroText: { paddingBottom: 8, flexShrink: 1 },
  heroLabel: { fontSize: 19, fontWeight: "700", letterSpacing: 0.4, color: colors.ink },
  heroDate: { fontSize: 16, fontWeight: "300", color: colors.muted },
  heroEmber: { marginLeft: "auto", paddingBottom: 4 },
  banner: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.orange,
    backgroundColor: colors.accentTint,
  },
  bannerText: { flex: 1, minWidth: 0 },
  bannerEyebrow: { fontSize: 13, fontWeight: "600", color: colors.orangeDeep },
  bannerTitle: {
    fontSize: 21,
    lineHeight: 24,
    fontWeight: "300",
    letterSpacing: -0.4,
    color: colors.ink,
  },
  bannerBtn: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.ink,
    justifyContent: "center",
  },
  bannerBtnText: { fontSize: 14, fontWeight: "600", color: "#FDF0DE" },
  sortLink: {
    marginTop: 18,
    minHeight: 54,
    paddingHorizontal: 20,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sortLinkText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  sortLinkArrow: { fontSize: 18, color: colors.ink },
  section: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 1, color: colors.muted },
  sectionNote: { fontSize: 17, fontFamily: handFont, color: colors.muted },
  sectionHot: { color: colors.orangeDeep },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowBody: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, fontWeight: "500", color: colors.ink },
  meta: { marginTop: 2, fontSize: 12, color: colors.muted },
  dotsRow: { marginTop: 6 },
  rowEnd: { alignItems: "flex-end", gap: 6 },
  left: { fontSize: 13, fontWeight: "500", color: colors.muted },
  leftUrgent: { fontWeight: "700", color: colors.orangeDeep },
  open: { fontSize: 13, fontWeight: "600", color: colors.ink },
  empty: { marginTop: 24, alignItems: "center", paddingHorizontal: 12 },
  emptyTitle: {
    marginTop: 12,
    fontSize: 30,
    fontWeight: "300",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "300",
    textAlign: "center",
    color: colors.inkSoft,
  },
});
