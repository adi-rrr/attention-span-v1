import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect } from "react-native-svg";
import { Text, colors, handFont } from "./theme";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Days of life left, on a 7..0 scale. 0 means "last
 * hours" (under 12 h); 0 and 1 are the "last day" stage.
 */
export function daysLeftOf(expiresAt: string | null | undefined, now = Date.now()): number {
  if (!expiresAt) return 7;
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 12 * HOUR) return 0;
  return Math.max(1, Math.min(7, Math.ceil(left / DAY)));
}

export type MeltStage = "fresh" | "dripping" | "last_day";

type StageStyle = {
  /** What the user reads. */
  label: string;
  color: string;
  title: string;
  hint: string;
  /**
   * Badge behind the word: a steady base colour with a brighter glow on top
   * that fades in and out every `pulseMs`. The base keeps the word readable
   * at the dim end of the pulse.
   */
  badge?: { base: string; glow: string; pulseMs: number };
};

/** The three named stages a save melts through, each more urgent than the last. */
export const MELT_STAGES: Record<MeltStage, StageStyle> = {
  fresh: {
    label: "fresh",
    color: colors.inkSoft,
    title: "No rush",
    hint: "Plenty of time. Enjoy it this week.",
  },
  dripping: {
    label: "dripping",
    color: "#9A5B12",
    title: "It won't last. Better act on it now.",
    hint: "",
    // A slow glow, once every 2.5 s: noticeable, not alarming.
    badge: { base: "#FFF0B8", glow: "#FFD43B", pulseMs: 2500 },
  },
  last_day: {
    label: "last day",
    color: "#FFE14D",
    // Without a save to time, e.g. in the stage explainer; stageCopy() has the hours.
    title: "Expiring today. Decide now or it fades.",
    hint: "",
    // A fast blink, once a second (0.5 s in, 0.5 s out): urgent.
    badge: { base: "#B3261E", glow: "#FF3B2F", pulseMs: 1000 },
  },
};

export function meltStage(daysLeft: number): MeltStage {
  return daysLeft >= 6 ? "fresh" : daysLeft >= 2 ? "dripping" : "last_day";
}

/**
 * The stage's line for one save. On the last day it counts the real hours
 * left: "Expiring in 9 h. Decide now, or it fades."
 */
export function stageCopy(
  stage: MeltStage,
  expiresAt?: string | null,
): { title: string; hint: string } {
  const base = MELT_STAGES[stage];
  if (stage !== "last_day" || !expiresAt) return { title: base.title, hint: base.hint };
  const hours = (new Date(expiresAt).getTime() - Date.now()) / HOUR;
  const when = hours < 1 ? "under 1 h" : `${Math.ceil(hours)} h`;
  return { title: `Expiring in ${when}. Decide now or it fades.`, hint: "" };
}

// One shared pulse per stage, so every badge on screen glows in step
// instead of each one blinking on its own beat.
const pulses: Partial<Record<MeltStage, Animated.Value>> = {};

function pulseFor(stage: MeltStage, periodMs: number): Animated.Value {
  const existing = pulses[stage];
  if (existing) return existing;
  const value = new Animated.Value(0);
  const half = periodMs / 2;
  const step = (toValue: number) =>
    Animated.timing(value, {
      toValue,
      duration: half,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: Platform.OS !== "web",
    });
  Animated.loop(Animated.sequence([step(1), step(0)])).start();
  pulses[stage] = value;
  return value;
}

/** True when the phone asks apps to cut down on motion. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduce);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

/**
 * The stage name in the hand font. Fresh is plain text; dripping sits on a
 * slowly glowing yellow badge and last day on a fast-blinking red one.
 */
export function MeltWord({
  daysLeft,
  size = 22,
  center = false,
}: {
  daysLeft: number;
  size?: number;
  /** Centre the badge in its parent instead of hugging the left edge. */
  center?: boolean;
}) {
  const stage = meltStage(daysLeft);
  const s = MELT_STAGES[stage];
  const reduceMotion = useReduceMotion();

  const word = (
    <Text
      style={[
        styles.word,
        { fontSize: size, lineHeight: size * 1.15, color: s.color },
        // The badge already carries the tilt.
        s.badge && styles.untilted,
      ]}
      accessibilityLabel={`${s.label}: ${s.title}`}
      numberOfLines={1}
    >
      {s.label}
    </Text>
  );
  if (!s.badge) return word;

  const glowOpacity = reduceMotion ? 1 : pulseFor(stage, s.badge.pulseMs);
  return (
    <View
      style={[
        styles.badge,
        center && styles.badgeCenter,
        {
          backgroundColor: s.badge.base,
          borderRadius: size * 0.45,
          paddingHorizontal: size * 0.4,
          paddingVertical: size * 0.06,
        },
      ]}
    >
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: s.badge.glow, opacity: glowOpacity }]}
      />
      {word}
    </View>
  );
}

/** Seven calendar dots: one goes hollow for each day that has passed. */
export function LifeDots({ daysLeft, size = 10 }: { daysLeft: number; size?: number }) {
  const glow = Math.max(daysLeft, 1);
  const urgent = daysLeft <= 1;
  return (
    <View
      style={styles.dots}
      accessibilityLabel={`${glow} of 7 days left`}
      accessible
    >
      {Array.from({ length: 7 }, (_, i) => {
        const gone = i < 7 - glow;
        const hot = !gone && i === 7 - glow && urgent;
        return (
          <View
            key={i}
            style={[
              { width: size, height: size, borderRadius: size / 2 },
              gone ? styles.dotGone : hot ? styles.dotHot : styles.dotOn,
            ]}
          />
        );
      })}
    </View>
  );
}

type EmberPose = "peek" | "calendar" | "write";

/** Ember, the flame mascot, as a one-line doodle. */
export function Ember({
  pose = "peek",
  size = 60,
  filled = true,
}: {
  pose?: EmberPose;
  size?: number;
  filled?: boolean;
}) {
  const ink = colors.ink;
  if (pose === "calendar") {
    return (
      <Svg width={size * 1.3} height={size} viewBox="0 0 220 170" accessibilityLabel="Ember holding a calendar">
        <G fill="none" stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M70 18 C 88 42, 108 60, 106 90 C 104 120, 88 134, 70 134 C 52 134, 36 120, 34 90 C 32 70, 46 58, 54 46 C 56 60, 62 68, 68 70 C 64 52, 62 36, 70 18 Z" fill={filled ? colors.ember : "none"} />
          <Path d="M63 110 Q70 115 77 110" />
          <Path d="M36 104 Q22 110 24 124" />
          <Path d="M104 100 Q120 98 128 86" />
          <Rect x={124} y={46} width={70} height={62} rx={8} />
          <Path d="M124 64 L194 64 M142 40 L142 52 M176 40 L176 52" />
          <Path d="M62 134 L58 152 M78 134 L82 152 M50 152 L64 152 M76 152 L90 152" />
          <Path d="M196 22 L196 34 M190 28 L202 28" />
        </G>
        <Circle cx={61} cy={98} r={2.8} fill={ink} />
        <Circle cx={79} cy={98} r={2.8} fill={ink} />
        <Circle cx={142} cy={80} r={3} fill={ink} />
        <Circle cx={159} cy={80} r={3} fill={ink} />
        <Circle cx={176} cy={80} r={6} fill={colors.orange} />
        <Circle cx={142} cy={96} r={3} fill={ink} />
        <Circle cx={159} cy={96} r={3} fill={ink} />
      </Svg>
    );
  }
  if (pose === "write") {
    return (
      <Svg width={size * 1.3} height={size} viewBox="0 0 220 170" accessibilityLabel="Ember writing in a notebook">
        <G fill="none" stroke={ink} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M70 18 C 88 42, 108 60, 106 90 C 104 120, 88 134, 70 134 C 52 134, 36 120, 34 90 C 32 70, 46 58, 54 46 C 56 60, 62 68, 68 70 C 64 52, 62 36, 70 18 Z" fill={filled ? colors.ember : "none"} />
          <Path d="M64 110 Q70 106 76 110" />
          <Path d="M36 104 Q22 110 24 124" />
          <Path d="M104 104 Q122 110 136 118" />
          <Path d="M118 120 L196 104 L206 150 L128 166 Z" />
          <Path d="M162 112 L172 158" />
          <Path d="M134 132 L156 128 M136 142 L158 138 M178 122 L196 118 M180 132 L198 128" />
          <Path d="M134 112 L152 74 L160 78 L142 116 Z" fill={colors.ember} />
          <Path d="M152 74 L156 66 L164 70 L160 78" />
          <Path d="M62 134 L58 152 M78 134 L82 152 M50 152 L64 152 M76 152 L90 152" />
        </G>
        <Circle cx={61} cy={98} r={2.8} fill={ink} />
        <Circle cx={79} cy={98} r={2.8} fill={ink} />
      </Svg>
    );
  }
  return (
    <Svg width={size * 0.9} height={size} viewBox="0 0 90 100" accessibilityLabel="Ember peeking">
      <G fill="none" stroke={ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M42 8 C 54 26, 66 36, 64 56 C 62 76, 52 84, 42 84 C 32 84, 22 76, 20 56 C 18 44, 28 36, 32 28 C 34 38, 38 42, 40 44 C 37 32, 36 20, 42 8 Z" fill={filled ? colors.ember : "none"} />
        <Path d="M37 69 Q42 73 47 69" />
        <Path d="M14 96 L76 96" />
        <Path d="M62 58 Q74 52 78 42" />
      </G>
      <Circle cx={36} cy={60} r={2.2} fill={ink} />
      <Circle cx={48} cy={60} r={2.2} fill={ink} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  word: { fontFamily: handFont, transform: [{ rotate: "-3deg" }] },
  badge: { alignSelf: "flex-start", overflow: "hidden", transform: [{ rotate: "-3deg" }] },
  badgeCenter: { alignSelf: "center" },
  untilted: { transform: [] },
  dots: { flexDirection: "row", gap: 4 },
  dotGone: { borderWidth: 1.5, borderColor: colors.border },
  dotOn: { backgroundColor: colors.ink },
  dotHot: { backgroundColor: colors.orange },
});
