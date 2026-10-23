import { StyleSheet, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from "react-native-svg";
import { colors } from "./theme";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Days of life left, on the 7..0 scale the drawings use. 0 means "last
 * hours" (under 12 h), so the final stage reads as a puddle, not a drip.
 */
export function daysLeftOf(expiresAt: string | null | undefined, now = Date.now()): number {
  if (!expiresAt) return 7;
  const left = new Date(expiresAt).getTime() - now;
  if (left <= 12 * HOUR) return 0;
  return Math.max(1, Math.min(7, Math.ceil(left / DAY)));
}

const FLAME =
  "M0 -14 C 6 -6, 11 -2, 10 5 C 9 11, 5 14, 0 14 C -5 14, -9 11, -10 5 C -11 -1, -6 -4, -3 -8 C -2 -4, -1 -2, 1 -1 C -1 -6, -2 -10, 0 -14 Z";
const FLAME_FILLS = ["#FFE3C2", "#FFD0A0", "#FFB877", "#FF9A52", "#FF7A33", "#F05A1A", "#E2551A", "#C9420F"];

/** Geometry for one melt stage: the flame grows as the scoop melts. */
function meltShape(daysLeft: number) {
  const k = daysLeft > 0 ? (7 - daysLeft) / 6 : 1.15;
  const h = 15 * (1 - 0.5 * Math.min(k, 1.15));
  const w = 11 + 4 * k;
  const top = 32 - h * 1.33;
  const l = 26 - w;
  const r = 26 + w;
  const f = (n: number) => n.toFixed(1);
  // Drips are rounded lobes of the scoop itself, so the whole scoop reads as
  // one soft, sagging blob instead of a lid with sticks.
  const count = k < 0.2 ? 0 : k < 0.5 ? 1 : k < 0.85 ? 2 : 3;
  const lobes = [
    { x: l + 4.5, len: 4 + 8 * k },
    { x: r - 5, len: 3 + 7 * k },
    { x: 26.5, len: 5 + 9 * k },
  ]
    .slice(0, count)
    .sort((a, b) => b.x - a.x);
  let scoop = `M${f(l)} 32 C ${f(l)} ${f(top)}, ${f(r)} ${f(top)}, ${f(r)} 32`;
  for (const { x, len } of lobes) {
    const tip = 32 + len;
    scoop +=
      ` L${f(x + 3.2)} 32` +
      ` C ${f(x + 3.4)} ${f(32 + len * 0.6)}, ${f(x + 3.4)} ${f(tip)}, ${f(x)} ${f(tip)}` +
      ` C ${f(x - 3.4)} ${f(tip)}, ${f(x - 3.4)} ${f(32 + len * 0.6)}, ${f(x - 3.2)} 32`;
  }
  scoop += ` L${f(l)} 32 Z`;
  const puddle = k < 0.3 ? 0 : 3 + (11 * (k - 0.3)) / 0.85;
  const s = 0.42 + 0.7 * k;
  return {
    scoop,
    puddle,
    flameY: 56 - 14 * s,
    flameScale: s,
    flameFill: FLAME_FILLS[7 - daysLeft],
  };
}

/** A waffle cone melting next to Ember. Bigger flame, more melt, less time. */
export function MeltIcon({ daysLeft, size = 50 }: { daysLeft: number; size?: number }) {
  const m = meltShape(Math.max(0, Math.min(7, daysLeft)));
  const label =
    daysLeft >= 6
      ? "Fresh scoop, tiny flame: plenty of time"
      : daysLeft >= 2
        ? "Scoop dripping, flame growing"
        : "Scoop melting into a puddle, big flame: act soon";
  return (
    <Svg width={size} height={size} viewBox="0 0 60 60" accessibilityLabel={label}>
      {m.puddle > 0 ? (
        <Ellipse
          cx={25}
          cy={57}
          rx={m.puddle}
          ry={m.puddle * 0.22}
          fill={colors.peach}
          stroke={colors.ink}
          strokeWidth={1.3}
        />
      ) : null}
      <Polygon
        points="18,33 34,33 26,56"
        fill={colors.cone}
        stroke={colors.ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path
        d="M21 37 L27 47 M26 34.5 L30.5 42 M31 37 L25 47 M26 34.5 L21.5 42"
        stroke={colors.ink}
        strokeWidth={0.9}
        opacity={0.5}
      />
      <Path
        d={m.scoop}
        fill={colors.peach}
        stroke={colors.ink}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <G transform={`translate(47 ${m.flameY.toFixed(1)}) scale(${m.flameScale.toFixed(2)})`}>
        <Path
          d={FLAME}
          fill={m.flameFill}
          stroke={colors.ink}
          strokeWidth={1.6 / m.flameScale}
          strokeLinejoin="round"
        />
        <Circle cx={-3.5} cy={5} r={1.5} fill={colors.ink} />
        <Circle cx={3.5} cy={5} r={1.5} fill={colors.ink} />
      </G>
    </Svg>
  );
}

/** Melt icon in its tile: orange when it's melting today. */
export function MeltTile({ daysLeft, size = 58 }: { daysLeft: number; size?: number }) {
  const hot = daysLeft <= 1;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.3 },
        hot && styles.tileHot,
      ]}
    >
      <MeltIcon daysLeft={daysLeft} size={size * 0.86} />
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
  tile: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: "center",
    justifyContent: "center",
  },
  tileHot: { backgroundColor: colors.accentTint, borderColor: colors.orange },
  dots: { flexDirection: "row", gap: 4 },
  dotGone: { borderWidth: 1.5, borderColor: colors.border },
  dotOn: { backgroundColor: colors.ink },
  dotHot: { backgroundColor: colors.orange },
});
