import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { fetchMirror } from "./lifecycle";
import { deviceTimezone, formatReminderTime } from "./reminders/format";
import { displayTitle } from "./text";
import { Text, colors, handFont } from "./theme";
import type { Mirror, MirrorDay, Save } from "./types";

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

/** The count inside a dot, readable on that dot's fill. */
const DOT_TEXT: Record<Exclude<DayState, "blank">, object> = {
  acted: { color: "#FFFFFF" },
  faded: { color: colors.ink },
  quiet: { color: colors.ink },
  today: { color: "#FFFFFF" },
  future: { color: colors.muted },
};

/** Where this month's saves went, in the same colours as the calendar. */
const PARTS = [
  { key: "acted", label: "acted", color: colors.ink },
  { key: "let_go", label: "let go", color: LET_GO_COLOR },
  { key: "faded", label: "faded", color: "#CFC6BB" },
  { key: "waiting", label: "waiting", color: "#F2B98C" },
] as const;

type DayCell = { state: DayState; date: number; info?: MirrorDay };

const BLANK: DayCell = { state: "blank", date: 0 };

/** Monday-first weeks for the month, each cell carrying what happened that day. */
function buildWeeks(data: Mirror): DayCell[][] {
  const [y, m] = data.month_start.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(y, m, 0).getDate();
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const byDay = new Map(data.days.map((d) => [d.day, d]));
  const todayNum = Number(data.today.slice(8, 10));

  const cells: DayCell[] = Array(lead).fill(BLANK);
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${data.month_start.slice(0, 8)}${String(d).padStart(2, "0")}`;
    const info = byDay.get(key);
    const state: DayState =
      d === todayNum
        ? "today"
        : d > todayNum
          ? "future"
          : info?.acted
            ? "acted"
            : info?.faded
              ? "faded"
              : "quiet";
    cells.push({ state, date: d, info });
  }
  while (cells.length % 7) cells.push(BLANK);

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type MirrorStat = "done" | "planned" | "distilled";

type Props = {
  /** Tapping a count shows what's behind it. */
  onOpenStat: (stat: MirrorStat) => void;
  /** Tapping a count in a day's bubble lists that day's saves of that kind. */
  onOpenDay: (stat: MirrorStat, day: string) => void;
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

/** "5 / 29" shrinks as the digits grow so it stays on one line. */
function scoreFontSize(acted: number, saved: number): number {
  const digits = String(acted).length + String(saved).length;
  if (digits <= 3) return 112;
  if (digits <= 4) return 96;
  if (digits <= 5) return 80;
  return 64;
}

/** "2026-11-13" for a day of the Mirror's month. */
function dayKey(monthStart: string, date: number): string {
  return `${monthStart.slice(0, 8)}${String(date).padStart(2, "0")}`;
}

/** "Fri, Nov 13" for a day of the Mirror's month. */
function dayTitle(monthStart: string, date: number): string {
  const [y, m] = monthStart.split("-").map(Number) as [number, number];
  return new Date(y, m - 1, date).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** "Tue, 17 Nov · 3 saved · 1 planned · 2 let go", read out for a day. */
function dayDetail(monthStart: string, cell: DayCell): string {
  const label = dayTitle(monthStart, cell.date);
  const i = cell.info;
  const parts = (
    [
      [i?.saved, "saved"],
      [i?.done, "did it"],
      [i?.planned, "planned"],
      [i?.distilled, "distilled"],
      [i?.let_go, "let go"],
      [i?.faded_n, "faded"],
    ] as const
  )
    .filter(([n]) => (n ?? 0) > 0)
    .map(([n, what]) => `${n} ${what}`);
  return parts.length ? `${label} · ${parts.join(" · ")}` : `${label} · nothing happened`;
}

function isToday(iso: string | null | undefined): boolean {
  if (!iso) return false;
  return new Date(iso).toDateString() === new Date().toDateString();
}

/** This month, honestly: how much of what you saved you acted on. */
export function MirrorScreen({
  onOpenStat,
  onOpenDay,
  onSort,
  onViewReminders,
  onOpenSave,
}: Props) {
  const [data, setData] = useState<Mirror | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Phones have no hover, so tapping a day shows its split under the calendar.
  const [picked, setPicked] = useState<number | null>(null);

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

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text
        style={[styles.bigNum, { fontSize: scoreFontSize(data.acted, data.saved) }]}
        numberOfLines={1}
        accessibilityLabel={`${data.acted} acted on, of ${data.saved} saved`}
      >
        {data.acted}
        <Text style={styles.bigNumSaved}> / {data.saved}</Text>
      </Text>
      <Text style={styles.actedOn}>
        ACTED ON <Text style={styles.savedLabel}>/ SAVED</Text>
      </Text>
      <Text style={styles.month}>{monthLabel}</Text>

      <Breakdown data={data} />

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
        {weeks.map((week, wi) => {
          const rowPicked = week.some((c) => c.state !== "blank" && c.date === picked);
          return (
            // The picked row sits above the others so its bubble isn't covered.
            <View key={wi} style={[styles.weekRow, rowPicked && styles.rowRaised]}>
              {week.map((cell, di) => {
                if (cell.state === "blank") return <View key={di} style={styles.cellCol} />;
                const isPicked = picked === cell.date;
                return (
                  <View key={di} style={[styles.cellCol, isPicked && styles.rowRaised]}>
                    {isPicked ? (
                      <DayBubble
                        cell={cell}
                        col={di}
                        monthStart={data.month_start}
                        onOpen={(stat) => onOpenDay(stat, dayKey(data.month_start, cell.date))}
                      />
                    ) : null}
                    <Pressable
                      disabled={cell.state === "future"}
                      onPress={() => setPicked(isPicked ? null : cell.date)}
                      accessibilityRole="button"
                      accessibilityLabel={dayDetail(data.month_start, cell)}
                    >
                      <Text style={[styles.dateNum, isPicked && styles.dateNumPicked]}>
                        {cell.date}
                      </Text>
                      <View
                        style={[
                          styles.cell,
                          styles.dot,
                          DOT[cell.state],
                          isPicked && styles.dotPicked,
                        ]}
                      >
                        {cell.info?.saved ? (
                          <Text style={[styles.dotCount, DOT_TEXT[cell.state]]}>
                            {cell.info.saved}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          );
        })}
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

const BUBBLE_WIDTH = 196;

/**
 * The tapped day's split in a small bubble just above it. Done, planned and
 * distilled open the saves behind them; let-go and faded saves are deleted
 * by design, so they're counts only.
 */
function DayBubble({
  cell,
  col,
  monthStart,
  onOpen,
}: {
  cell: DayCell;
  /** 0 = Monday. Edge columns anchor the bubble so it stays on screen. */
  col: number;
  monthStart: string;
  onOpen: (stat: MirrorStat) => void;
}) {
  const i = cell.info;
  const rows = (
    [
      { n: i?.saved, label: "saved", stat: null },
      { n: i?.done, label: "did it", stat: "done" },
      { n: i?.planned, label: "planned", stat: "planned" },
      { n: i?.distilled, label: "distilled", stat: "distilled" },
      { n: i?.let_go, label: "let go", stat: null },
      { n: i?.faded_n, label: "faded", stat: null },
    ] as const
  ).filter((r) => (r.n ?? 0) > 0);

  const anchor =
    col <= 1
      ? { left: 0 }
      : col >= 5
        ? { right: 0 }
        : { left: "50%" as const, marginLeft: -BUBBLE_WIDTH / 2 };
  const tail =
    col <= 1
      ? { left: 14 }
      : col >= 5
        ? { right: 14 }
        : { left: "50%" as const, marginLeft: -6 };

  return (
    <View style={[styles.bubble, anchor]}>
      <Text style={styles.bubbleTitle}>{dayTitle(monthStart, cell.date)}</Text>
      {rows.length === 0 ? <Text style={styles.bubbleRow}>Nothing happened</Text> : null}
      {rows.map((r) =>
        r.stat ? (
          <Pressable
            key={r.label}
            style={styles.bubbleLink}
            onPress={() => onOpen(r.stat)}
            accessibilityRole="button"
            accessibilityLabel={`${r.n} ${r.label}. Show them`}
          >
            <Text style={styles.bubbleRow}>
              <Text style={styles.bubbleNum}>{r.n}</Text> {r.label}
            </Text>
            <Text style={styles.bubbleArrow}>›</Text>
          </Pressable>
        ) : (
          <View key={r.label} style={styles.bubbleLink}>
            <Text style={styles.bubbleRow}>
              <Text style={styles.bubbleNum}>{r.n}</Text> {r.label}
            </Text>
          </View>
        ),
      )}
      <View style={[styles.bubbleTail, tail]} />
    </View>
  );
}

/**
 * One bar for where the saves went: acted, let go, faded, still waiting.
 * Waiting is today's inbox, so it can include saves from last month.
 */
function Breakdown({ data }: { data: Mirror }) {
  const counts = {
    acted: data.acted,
    let_go: data.let_go,
    faded: data.faded,
    waiting: data.inbox.total,
  };
  const parts = PARTS.filter((p) => counts[p.key] > 0);
  if (parts.length === 0) return null;

  return (
    <View style={styles.breakdown}>
      <View style={styles.bar}>
        {parts.map((p) => (
          <View key={p.key} style={{ flex: counts[p.key], backgroundColor: p.color }} />
        ))}
      </View>
      <View style={styles.barLegend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: p.color }]} />
            <Text style={styles.legendText}>
              <Text style={styles.barCount}>{counts[p.key]}</Text> {p.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: colors.danger, marginBottom: 8 },
  bigNum: {
    fontWeight: "800",
    letterSpacing: -5,
    color: colors.ink,
    marginLeft: -4,
  },
  // Nested text picks its own font from its own weight, so restate the weight.
  bigNumSaved: { color: "#B7AA9C", fontWeight: "800" },
  actedOn: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5, color: colors.ink },
  savedLabel: { color: "#B7AA9C", fontWeight: "800" },
  month: { fontSize: 28, fontWeight: "400", color: colors.muted, marginTop: -2 },
  breakdown: { marginTop: 14 },
  bar: {
    flexDirection: "row",
    height: 14,
    borderRadius: 7,
    overflow: "hidden",
    gap: 2,
  },
  barLegend: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
    rowGap: 4,
  },
  barCount: { fontWeight: "800", color: colors.ink },
  cellCol: { flex: 1, alignItems: "stretch" },
  dateNum: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    textAlign: "center",
    marginBottom: 3,
  },
  dateNumPicked: { color: LET_GO_COLOR, fontWeight: "800" },
  dotPicked: { borderWidth: 2.5, borderColor: LET_GO_COLOR },
  dotCount: { fontSize: 14, fontWeight: "800" },
  rowRaised: { zIndex: 10, elevation: 10 },
  bubble: {
    position: "absolute",
    bottom: "100%",
    marginBottom: 8,
    width: BUBBLE_WIDTH,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.ink,
    zIndex: 20,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  bubbleTitle: { fontSize: 13, fontWeight: "800", color: "#FFFFFF", marginBottom: 4 },
  bubbleLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 28,
  },
  bubbleRow: { fontSize: 14, color: "#E8DFD5" },
  bubbleNum: { fontWeight: "800", color: "#FFFFFF" },
  bubbleArrow: { fontSize: 18, fontWeight: "700", color: colors.peach },
  bubbleTail: {
    position: "absolute",
    bottom: -6,
    width: 12,
    height: 12,
    backgroundColor: colors.ink,
    transform: [{ rotate: "45deg" }],
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
  cell: { width: "100%", aspectRatio: 1 },
  dot: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
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
