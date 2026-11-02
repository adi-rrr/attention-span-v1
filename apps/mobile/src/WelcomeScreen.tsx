import { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Path,
  Rect,
  Text as SvgText,
  Use,
} from "react-native-svg";
import { Ember } from "./doodles";
import { Text, colors, displayFont, handFont } from "./theme";

type Props = {
  /** "Start doing": go to log in / sign up. */
  onStart: () => void;
};

/** First screen for anyone signed out (Round 3 · Welcome). */
export function WelcomeScreen({ onStart }: Props) {
  const [howOpen, setHowOpen] = useState(false);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.wordmark} accessibilityRole="header">
          ATTENTION{"\n"}SPAN
        </Text>
        <Text style={styles.tagline}>less scrolling. more doing.</Text>
      </View>

      <View style={styles.stage}>
        <Text style={styles.headline}>
          TURN WHAT{"\n"}YOU SCROLL{"\n"}INTO THINGS{"\n"}YOU ACTUALLY{"\n"}DO.
        </Text>
        <View style={styles.art}>
          <WelcomeDoodle />
        </View>
      </View>

      <View style={styles.bottom}>
        <Text style={styles.blurb}>
          Save anything from Instagram, YouTube or Reddit. You get{" "}
          <Text style={styles.blurbBold}>7 days</Text> to plan it, learn from it, or
          let it go. No more graveyard of saves.
        </Text>
        <View style={styles.buttons}>
          <Pressable
            style={styles.ghostBtn}
            onPress={() => setHowOpen(true)}
            accessibilityRole="button"
          >
            <Text style={styles.ghostText}>How it works</Text>
          </Pressable>
          <Pressable style={styles.solidBtn} onPress={onStart} accessibilityRole="button">
            <Text style={styles.solidText}>Start doing</Text>
          </Pressable>
        </View>
      </View>

      <HowItWorks
        visible={howOpen}
        onClose={() => setHowOpen(false)}
        onStart={() => {
          setHowOpen(false);
          onStart();
        }}
      />
    </View>
  );
}

const STEPS = [
  {
    title: "Save without leaving the scroll",
    body: "Share a post to Attention Span. It saves in one tap and drops you back where you were.",
  },
  {
    title: "Every save gets 7 days",
    body: "It melts a little each day in your inbox. Untouched saves are gone for good when time's up.",
  },
  {
    title: "Decide what it's worth",
    body: "Did it, plan it with a date, distill the one thing you learned, or let it go. Your Mirror shows the month honestly.",
  },
];

function HowItWorks({
  visible,
  onClose,
  onStart,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <View style={styles.sheetHead}>
          <Ember pose="peek" size={56} />
          <Text style={styles.sheetTitle}>How it works</Text>
        </View>
        {STEPS.map((step, i) => (
          <View key={step.title} style={styles.step}>
            <Text style={styles.stepNum}>{i + 1}</Text>
            <View style={styles.stepBody}>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepText}>{step.body}</Text>
            </View>
          </View>
        ))}
        <Pressable style={[styles.solidBtn, styles.sheetBtn]} onPress={onStart}>
          <Text style={styles.solidText}>Start doing</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

/**
 * The good bits fly out of a phone into a jar labelled 7 days, while Ember
 * stands by catching only the ones you'll use. Coordinates match the
 * 390×430 artboard in the Round 3 design.
 */
function WelcomeDoodle() {
  const ink = colors.ink;
  const paper = colors.bg;
  return (
    <Svg
      width="100%"
      height="100%"
      viewBox="0 0 390 430"
      preserveAspectRatio="xMidYMax meet"
      accessibilityLabel="Doodle: the good bits fly out of a phone into a jar labelled 7 days, while Ember the flame catches only the ones you will use"
    >
      <Defs>
        <G id="ember-mini">
          <Path
            d="M0 -14 C 6 -6, 11 -2, 10 5 C 9 11, 5 14, 0 14 C -5 14, -9 11, -10 5 C -11 -1, -6 -4, -3 -8 C -2 -4, -1 -2, 1 -1 C -1 -6, -2 -10, 0 -14 Z"
            fill={colors.ember}
            stroke={ink}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <Circle cx={-3.5} cy={5} r={1.6} fill={ink} />
          <Circle cx={3.5} cy={5} r={1.6} fill={ink} />
        </G>
      </Defs>

      <Circle cx={306} cy={150} r={98} fill={colors.ember} />

      <G
        fill="none"
        stroke={ink}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <G transform="rotate(8 300 170)">
          <Rect x={240} y={40} width={120} height={240} rx={22} fill={paper} />
          <Rect x={250} y={58} width={100} height={204} rx={12} />
          <Rect x={258} y={68} width={84} height={56} rx={6} />
          <Path d="M262 116 L282 94 L296 108 L306 98 L338 120" strokeWidth={2.4} />
          <Circle cx={326} cy={82} r={5} strokeWidth={2.4} />
          <Path d="M258 136 L330 136 M258 147 L308 147" strokeWidth={2.4} />
          <Rect x={258} y={160} width={84} height={56} rx={6} />
          <Path d="M262 208 C 280 186, 300 200, 338 176" strokeWidth={2.4} />
          <Path d="M266 236 c-3-4-9-1-6 4 l6 6 l6-6 c3-5-3-8-6-4z" strokeWidth={2.2} />
          <Path d="M318 232 L338 226 L330 246 L326 236 Z" strokeWidth={2.2} />
        </G>

        <Path d="M250 95 C 226 34, 176 52, 156 142" strokeDasharray="2 9" strokeWidth={2.6} />

        <G transform="translate(28 127) scale(0.62)">
          <Path
            d="M100 20 C 124 52, 150 76, 148 116 C 146 156, 124 176, 100 176 C 76 176, 54 156, 52 116 C 50 88, 68 72, 80 54 C 82 74, 90 84, 98 86 C 92 62, 90 42, 100 20 Z"
            fill={paper}
            strokeWidth={4.8}
          />
          <Circle cx={88} cy={126} r={5} fill={ink} stroke="none" />
          <Circle cx={112} cy={126} r={5} fill={ink} stroke="none" />
          <Path d="M90 142 Q100 150 110 142" strokeWidth={4.8} />
          <Path d="M56 132 Q34 140 36 162" strokeWidth={4.8} />
          <Path d="M144 126 Q170 104 176 78" strokeWidth={4.8} />
          <Path
            d="M88 176 L84 198 M112 176 L116 198 M76 198 L90 198 M110 198 L124 198"
            strokeWidth={4.8}
          />
        </G>

        <Rect x={30} y={250} width={120} height={18} rx={6} fill={paper} />
        <Path
          d="M42 268 L42 280 Q30 284 30 300 L30 380 Q30 398 50 398 L130 398 Q150 398 150 380 L150 300 Q150 284 138 280 L138 268"
          fill={paper}
        />
        <Path d="M44 300 L44 372" strokeWidth={2} opacity={0.35} />
        <Rect x={55} y={320} width={70} height={30} rx={4} fill={paper} />

        <Path d="M0 400 L392 400 M300 400 L300 432" strokeWidth={3} />

        <Path
          d="M226 344 C 224 318, 262 306, 298 308 C 340 310, 362 326, 358 346 C 354 368, 318 378, 286 376 C 248 374, 228 364, 226 344 Z"
          strokeWidth={2.2}
          fill={paper}
        />
        <Path d="M226 330 C 206 312, 196 290, 176 272" strokeWidth={2.2} />
        <Path d="M186 274 L175 271 L177 283" strokeWidth={2.2} />
        <Path
          d="M206 196 L206 208 M200 202 L212 202 M352 22 L352 32 M347 27 L357 27"
          strokeWidth={2.4}
        />
      </G>

      <Use href="#ember-mini" transform="translate(234 62) scale(0.85)" />
      <Use href="#ember-mini" transform="translate(194 70) scale(0.95)" />
      <Use href="#ember-mini" transform="translate(142 152) scale(0.9)" />
      <Use href="#ember-mini" transform="translate(68 374) scale(1.05)" />
      <Use href="#ember-mini" transform="translate(112 370) scale(0.85)" />

      <SvgText x={90} y={341} textAnchor="middle" fontFamily={handFont} fontSize={17} fill={ink}>
        7 DAYS
      </SvgText>
      <SvgText x={292} y={338} textAnchor="middle" fontFamily={handFont} fontSize={18} fill={ink}>
        keeps only what
      </SvgText>
      <SvgText x={292} y={360} textAnchor="middle" fontFamily={handFont} fontSize={18} fill={ink}>
        you'll use
      </SvgText>
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: { paddingTop: 26, paddingHorizontal: 22, alignItems: "center" },
  wordmark: {
    fontFamily: displayFont,
    fontSize: 50,
    lineHeight: 50,
    textAlign: "center",
    color: colors.ink,
  },
  tagline: {
    marginTop: 4,
    fontFamily: handFont,
    fontSize: 31,
    lineHeight: 36,
    color: colors.ink,
  },
  stage: { flex: 1, minHeight: 300 },
  headline: {
    position: "absolute",
    left: 22,
    top: 18,
    zIndex: 1,
    fontSize: 25,
    lineHeight: 26,
    fontWeight: "800",
    letterSpacing: -0.25,
    color: colors.ink,
  },
  art: { position: "absolute", left: 0, right: 0, top: 64, bottom: 0 },
  bottom: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 26 },
  blurb: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "300",
    color: colors.inkSoft,
    marginBottom: 16,
  },
  blurbBold: { fontWeight: "600" },
  buttons: { flexDirection: "row", gap: 12 },
  ghostBtn: {
    flex: 1,
    minHeight: 54,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostText: { fontSize: 16, fontWeight: "500", color: colors.ink },
  solidBtn: {
    flex: 1,
    minHeight: 54,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  solidText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  scrim: { flex: 1, backgroundColor: "rgba(28,20,16,0.35)" },
  sheet: {
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 30,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1.5,
    borderColor: colors.line,
  },
  sheetHead: { flexDirection: "row", alignItems: "flex-end", gap: 10, marginBottom: 8 },
  sheetTitle: {
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "300",
    letterSpacing: -1,
    color: colors.ink,
    paddingBottom: 6,
  },
  step: { flexDirection: "row", gap: 14, paddingVertical: 12 },
  stepNum: { fontFamily: handFont, fontSize: 30, lineHeight: 32, color: colors.orangeDeep, width: 22 },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  stepText: { marginTop: 2, fontSize: 15, lineHeight: 21, fontWeight: "300", color: colors.inkSoft },
  sheetBtn: { flex: 0, marginTop: 14 },
});
