import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { fetchMirror } from "./lifecycle";
import { deviceTimezone, formatReminderTime } from "./reminders/format";
import { displayTitle } from "./text";
import { Text, colors, handFont } from "./theme";
import type { Mirror, Save } from "./types";

type DayState = "acted" | "faded" | "quiet" | "today" | "future" | "blank";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const TODAY_COLOR = "#E2551A";
const LET_GO_COLOR = "#B23F0C";

const DOT: Record<Exclude<DayState, "blank">, object> = {
  acted: { backgroundColor: colors.ink },
  faded: { backgroundColor: "#CFC6BB" },
  quiet: { borderWidth: 2, borderColor: "#CFC6BB", backgroundColor: "transparent" },
  today: { backgroundColor: TODAY_COLOR },
  future: { backgroundColor: "#E6DFD5" },
};

/** Monday-first weeks for the month, each cell carrying what happened that day. */
function buildWeeks(data: Mirror): DayState[][] {
  const [y, m] = data.month_start.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const todayNum = Number(data.today.slice(8, 10));

  const cells: DayState[] = Array(lead).fill("blank");
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${data.month_start.slice(0, 8)}${String(d).padStart(2, "0")}`;
    const info = byDay.get(key);
    if (d === todayNum) cells.push("today");
    else if (d > todayNum) cells.push("future");
    else if (info?.acted) cells.push("acted");
    else if (info?.faded) cells.push("faded");
    else cells.push("quiet");
  }
  while (cells.length % 7) cells.push("blank");

  const weeks: DayState[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type MirrorStat = "done" | "planned" | "distilled";

type Props = {
  /** Tapping a count shows what's behind it. */
  onOpenStat: (stat: MirrorStat) => void;
  /** Opens the sorting deck. */
  onSort: () => void;
  /** Opens the tab with every plan and its reminder. */
  onViewReminders: () => void;
  onOpenSave: (saveId: string) => void;
};

/**
 * One honest line under the score: a reality check plus the next step.
 * Never a made-up statistic; only the user's own numbers.
 */
export function pushLine(m: Mirror): string {
  const waiting = m.inbox.total;
  const sortBit = waiting
    ? ` ${waiting} waiting, about ${m.inbox.sort_minutes} min.`
    : "";
  if (m.saved === 0 && waiting === 0) {
    return "Nothing saved this month yet. Share a post when something catches you.";
  }
  if (m.acted === 0) {
    return `Most saves never get opened again. Yours don't have to.${sortBit}`;
  }
  const ratio = m.saved > 0 ? m.acted / m.saved : 1;
  if (ratio < 0.3) {
    return `${m.acted} of ${m.saved} is a start, and normal early on. Sort a few a day for 3–4 days and you're caught up.`;
  }
  if (ratio < 0.6) {
    return `Solid progress. Sort as saves come in and nothing fades on you.${sortBit}`;
  }
  return "You act on most of what you save. That's rare. Keep it going.";
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** This month, honestly: how much of what you saved you acted on. */
export function MirrorScreen({ onOpenStat, onSort, onViewReminders, onOpenSave }: Props) {
  const [data, setData] = useState<Mirror | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchMirror(deviceTimezone()));
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

  const [y, m] = data.month_start.split("-").map(Number) as [number, number];
  const monthLabel = new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const todayCol = (new Date(y, m - 1, Number(data.today.slice(8, 10))).getDay() + 6) % 7;
  const weeks = buildWeeks(data);

  const quietMonth = data.saved + data.acted + data.let_go + data.faded === 0;
  const note = quietMonth
      ? "Nothing saved yet this month. Save freely; decide later."
      : `${data.faded} faded. ${data.let_go} you let go on purpose.\nThat's attention you took back.`;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.bigNum} accessibilityLabel={`${data.acted} acted on`}>
        {data.acted}
      </Text>
      <View style={styles.headRow}>
        <View>
          <Text style={styles.actedOn}>ACTED ON</Text>
          <Text style={styles.month}>{monthLabel}</Text>
        </View>
        <Text style={styles.ofSaved}>
          of {data.saved}
          {"\n"}saved
        </Text>
      </View>

      <Text style={styles.pushLine}>{pushLine(data)}</Text>
      <NextCard
        data={data}
        onSort={onSort}
        onViewReminders={onViewReminders}
        onOpenSave={onOpenSave}
      />

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d, i) => (
          <Text
            key={`${d}-${i}`}
            style={[styles.weekday, i === todayCol && styles.weekdayToday]}
          >
            {d}
          </Text>
        ))}
      </View>
      <View style={styles.grid}>
        {weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((state, di) => (
              <View key={di} style={styles.cell}>
                {state === "blank" ? null : <View style={[styles.dot, DOT[state]]} />}
              </View>
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        {(
          [
            ["acted", "acted"],
            ["faded", "something faded"],
            ["quiet", "quiet"],
            ["today", "today"],
          ] as const
        ).map(([state, label]) => (
          <View key={state} style={styles.legendItem}>
            <View style={[styles.legendDot, DOT[state]]} />
            <Text style={styles.legendText}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rule} />
      <View style={styles.stats}>
        {(
          [
            ["did it", data.done, "done"],
            ["planned", data.planned, "planned"],
            ["distilled", data.distilled, "distilled"],
          ] as const
        ).map(([label, value, stat]) => (
          <Pressable
            key={label}
            style={styles.stat}
            onPress={() => onOpenStat(stat)}
            accessibilityRole="button"
            accessibilityLabel={`${value} ${label}. Show them`}
          >
            <Text style={styles.statNum}>{value}</Text>
            <Text style={styles.statLabel}>{label} ›</Text>
          </Pressable>
        ))}
        {/* Let-go saves are deleted by design, so there's nothing to open. */}
        <View style={styles.stat}>
          <Text style={[styles.statNum, styles.statNumAccent]}>{data.let_go}</Text>
          <Text style={styles.statLabel}>let go</Text>
        </View>
      </View>
      <View style={styles.rule} />

      <View style={styles.noteRow}>
        <Flame />
        <Text style={styles.note}>{note}</Text>
      </View>

      <Text style={styles.shelf}>
        Shelf: {data.shelf_used} of {data.shelf_limit} plans and takeaways kept
      </Text>
    </ScrollView>
  );
}

/**
 * Under the score: today's reminders if there are any; otherwise what's left
 * to sort, with the next plan underneath.
 */
function NextCard({
  data,
  onSort,
  onViewReminders,
  onOpenSave,
}: {
  data: Mirror;
  onSort: () => void;
  onViewReminders: () => void;
  onOpenSave: (saveId: string) => void;
}) {
  const today = data.upcoming.filter((s) => isToday(s.plan_at));
  const waiting = data.inbox.total;

  const planRow = (s: Save) => (
    <Pressable
      key={s.id}
      style={styles.planRow}
      onPress={() => onOpenSave(s.id)}
      accessibilityRole="button"
    >
      <Text style={styles.planWhen}>{s.plan_at ? formatReminderTime(s.plan_at) : ""}</Text>
      <Text style={styles.planText} numberOfLines={1}>
        {s.plan_text || displayTitle(s)}
      </Text>
    </Pressable>
  );

  if (today.length > 0) {
    return (
      <View style={styles.nextCard}>
        <Text style={styles.nextEyebrow}>today</Text>
        {today.map(planRow)}
        <Pressable onPress={onViewReminders} style={styles.nextLink} accessibilityRole="button">
          <Text style={styles.nextLinkText}>View all reminders ›</Text>
        </Pressable>
      </View>
    );
  }

  if (waiting > 0) {
    return (
      <View style={styles.nextCard}>
        <Text style={styles.nextEyebrow}>no reminders today</Text>
        <Pressable onPress={onSort} style={styles.sortRow} accessibilityRole="button">
          <View style={{ flex: 1 }}>
            <Text style={styles.sortTitle}>
              {waiting} {waiting === 1 ? "save" : "saves"} waiting to be sorted
            </Text>
            <Text style={styles.sortSub}>about {data.inbox.sort_minutes} min</Text>
          </View>
          <Text style={styles.sortArrow}>Sort now →</Text>
        </Pressable>
        {data.upcoming[0] ? (
          <>
            <Text style={[styles.nextEyebrow, { marginTop: 12 }]}>next up</Text>
            {planRow(data.upcoming[0])}
            <Pressable onPress={onViewReminders} style={styles.nextLink} accessibilityRole="button">
              <Text style={styles.nextLinkText}>View all reminders ›</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    );
  }

  if (data.upcoming.length > 0) {
    return (
      <View style={styles.nextCard}>
        <Text style={styles.nextEyebrow}>coming up</Text>
        {data.upcoming.map(planRow)}
        <Pressable onPress={onViewReminders} style={styles.nextLink} accessibilityRole="button">
          <Text style={styles.nextLinkText}>View all reminders ›</Text>
        </Pressable>
      </View>
    );
  }
  return null;
}

/** Little hand-drawn flame waving hello. */
function Flame() {
  return (
    <Svg width={56} height={64} viewBox="0 0 64 72" accessibilityElementsHidden>
      <Path
        d="M32 6 C38 18 52 26 50 46 C49 60 40 68 30 68 C18 68 12 58 13 47 C14 37 22 33 24 24 C27 30 30 31 32 26 C34 20 31 12 32 6 Z"
        fill={colors.peach}
        stroke={colors.ink}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <Circle cx={26} cy={48} r={1.8} fill={colors.ink} />
      <Circle cx={36} cy={48} r={1.8} fill={colors.ink} />
      <Path d="M26 55 Q31 59 36 55" stroke={colors.ink} strokeWidth={2} fill="none" strokeLinecap="round" />
      <Path
        d="M49 44 L57 35 M57 35 L60 31 M57 35 L61 36"
        stroke={colors.ink}
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, marginBottom: 8 },
  bigNum: {
    fontSize: 128,
    lineHeight: 132,
    fontWeight: "800",
    letterSpacing: -7,
    color: colors.ink,
    marginLeft: -6,
  },
  headRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  actedOn: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.ink },
  month: { fontSize: 28, fontWeight: "400", color: colors.muted, marginTop: -2 },
  ofSaved: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "right",
    marginBottom: 4,
  },
  weekRow: { flexDirection: "row", gap: 10 },
  weekday: {
    flex: 1,
    marginTop: 26,
    marginBottom: 10,
    textAlign: "center",
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
  },
  weekdayToday: { color: LET_GO_COLOR },
  grid: { gap: 10 },
  cell: { flex: 1, aspectRatio: 1 },
  dot: { flex: 1, borderRadius: 999 },
  legend: {
    marginTop: 18,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 16,
    rowGap: 6,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 14, height: 14, borderRadius: 7 },
  legendText: { fontSize: 14, color: colors.inkSoft },
  rule: { height: 2, backgroundColor: colors.ink, marginVertical: 16 },
  stats: { flexDirection: "row" },
  stat: { flex: 1, minHeight: 56 },
  statNum: { fontSize: 32, fontWeight: "800", color: colors.ink },
  statNumAccent: { color: LET_GO_COLOR },
  statLabel: { fontSize: 14, color: colors.inkSoft },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 4 },
  note: { flex: 1, fontSize: 17, lineHeight: 25, fontWeight: "600", color: colors.ink },
  shelf: { marginTop: 18, fontSize: 13, color: colors.muted },
  pushLine: { marginTop: 14, fontSize: 16, lineHeight: 23, color: colors.inkSoft },
  nextCard: {
    marginTop: 16,
    padding: 16,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
  },
  nextEyebrow: { fontFamily: handFont, fontSize: 18, color: colors.orangeDeep },
  planRow: { minHeight: 44, justifyContent: "center", paddingVertical: 4 },
  planWhen: { fontSize: 12, fontWeight: "600", color: colors.muted },
  planText: { fontSize: 16, fontWeight: "600", color: colors.ink },
  nextLink: { minHeight: 40, justifyContent: "center", marginTop: 4 },
  nextLinkText: { fontSize: 14, fontWeight: "700", color: colors.accentText },
  sortRow: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56 },
  sortTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  sortSub: { fontSize: 13, color: colors.muted },
  sortArrow: { fontSize: 15, fontWeight: "700", color: colors.accentText },
});
