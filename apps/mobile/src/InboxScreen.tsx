import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { AddLink } from "./components/AddLink";
import { PostViewer, canViewPost } from "./components/PostViewer";
import { StageGuide } from "./components/StageGuide";
import { Ember, LifeDots, MeltWord, daysLeftOf } from "./doodles";
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

/** Set once the stage explainer has been seen, so it only opens by itself once. */
const STAGE_GUIDE_KEY = "guide.stages.v1";

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
  const [viewing, setViewing] = useState<Save | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const lifespan = summary?.lifespan_days ?? 7;

  // The first time there's something melting, explain the stage names once.
  const hasItems = items.length > 0;
  useEffect(() => {
    if (!hasItems) return;
    void AsyncStorage.getItem(STAGE_GUIDE_KEY)
      .then((seen) => {
        if (!seen) setGuideOpen(true);
      })
      .catch(() => {});
  }, [hasItems]);

  function closeGuide() {
    setGuideOpen(false);
    void AsyncStorage.setItem(STAGE_GUIDE_KEY, "1").catch(() => {});
  }
  const rows = items.map((save, index) => ({
    save,
    index,
    days: daysLeftOf(save.expires_at),
  }));
  // Places don't fade; they wait until the user is there.
  const places = rows.filter((r) => !r.save.expires_at);
  const fading = rows.filter((r) => r.save.expires_at);
  const today = fading.filter((r) => r.days <= 1);
  const week = fading.filter((r) => r.days > 1);

  function renderRow({ save, index, days }: (typeof rows)[number]) {
    const urgent = days <= 1;
    return (
      <Pressable
        key={save.id}
        style={styles.row}
        onPress={() => onDecide(index)}
        accessibilityHint="Opens the decision for this save"
      >
        <View style={styles.stage}>
          <MeltWord daysLeft={days} />
        </View>
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
          {canViewPost(save) ? (
            <Pressable
              hitSlop={8}
              onPress={() => setViewing(save)}
              accessibilityLabel="View the post"
            >
              <Text style={styles.open}>View</Text>
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
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>
              {items.length === 1 ? "SAVE MELTING" : "SAVES MELTING"}
            </Text>
            <Pressable
              style={styles.help}
              onPress={() => setGuideOpen(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="What fresh, dripping and last day mean"
            >
              <Text style={styles.helpText}>?</Text>
            </Pressable>
          </View>
          <Text style={styles.heroDate}>{todayLabel()}</Text>
        </View>
        <View style={styles.heroEmber}>
          <Ember pose="peek" size={64} />
        </View>
      </View>

      {/* Web only: paste a link, since a computer has no share sheet. */}
      <AddLink onSaved={onRefresh} />

      {today.length > 0 ? (
        <Pressable
          style={styles.banner}
          onPress={() => onDecide(today[0].index)}
          accessibilityRole="button"
        >
          {/* Badge above the line, so the wide "last day" badge doesn't squeeze it. */}
          <View style={styles.bannerText}>
            <MeltWord daysLeft={0} size={24} />
            <Text style={[styles.bannerTitle, styles.bannerTitleGap]}>
              {today.length} {today.length === 1 ? "save needs" : "saves need"} you
            </Text>
          </View>
          <View style={styles.bannerBtn}>
            <Text style={styles.bannerBtnText}>Save them →</Text>
          </View>
        </Pressable>
      ) : items.length > 0 ? (
        <Pressable style={styles.sortLink} onPress={() => onDecide(0)}>
          <Text style={styles.sortLinkText}>
            Sort now · about {summary?.sort_minutes || 1} min
          </Text>
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
            Share a post from Instagram. You get {lifespan} days
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

      {places.length > 0 ? (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>PLACES</Text>
            <Text style={styles.sectionNote}>back when you're there</Text>
          </View>
          {places.map(renderRow)}
        </>
      ) : null}
      <PostViewer save={viewing} onClose={() => setViewing(null)} />
      <StageGuide visible={guideOpen} onClose={closeGuide} />
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
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  heroLabel: { fontSize: 19, fontWeight: "700", letterSpacing: 0.4, color: colors.ink },
  help: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  helpText: { fontSize: 13, fontWeight: "800", color: colors.ink, lineHeight: 15 },
  heroDate: { fontSize: 16, fontWeight: "300", color: colors.muted },
  heroEmber: { marginLeft: "auto", paddingBottom: 4 },
  // Wide enough for the "last day" badge on one line.
  stage: { width: 100 },
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
  bannerTitleGap: { marginTop: 6 },
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
