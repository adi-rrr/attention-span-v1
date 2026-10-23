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
import { deviceTimezone } from "./reminders/format";
import { Text, colors } from "./theme";
import type { Mirror } from "./types";

type DayState = "acted" | "faded" | "quiet" | "today" | "future" | "blank";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const TODAY_COLOR = "#E8835F";
const LET_GO_COLOR = "#B54A24";

const DOT: Record<Exclude<DayState, "blank">, object> = {
  acted: { backgroundColor: colors.ink },
  faded: { backgroundColor: "#B9B8D6" },
  quiet: { borderWidth: 2, borderColor: "#C7C8EE", backgroundColor: "transparent" },
  today: { backgroundColor: TODAY_COLOR },
  future: { backgroundColor: "#E2E3F5" },
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
};

/** This month, honestly: how much of what you saved you acted on. */
export function MirrorScreen({ onOpenStat }: Props) {
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
});
