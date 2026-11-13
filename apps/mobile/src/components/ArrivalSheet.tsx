import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ember } from "../doodles";
import { displayTitle } from "../text";
import { Text, colors, handFont } from "../theme";
import type { Save } from "../types";

type Props = {
  arrival: { country: string; items: Save[] } | null;
  onGo: () => void;
  onLater: () => void;
};

/** "You're in Japan: 6 saves from here." Opens them in the sorting deck. */
export function ArrivalSheet({ arrival, onGo, onLater }: Props) {
  const n = arrival?.items.length ?? 0;
  return (
    <Modal visible={arrival !== null} transparent animationType="slide" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={onLater} accessibilityLabel="Later" />
      <View style={styles.sheet}>
        <View style={styles.head}>
          <Ember pose="peek" size={64} />
          <Text style={styles.note}>you made it!</Text>
        </View>
        <Text style={styles.title}>You're in {arrival?.country}</Text>
        <Text style={styles.sub}>
          You saved {n} {n === 1 ? "place" : "places"} here. Now's the time: go, plan it,
          or let it go.
        </Text>
        <View style={styles.list}>
          {arrival?.items.slice(0, 3).map((s) => (
            <Text key={s.id} style={styles.item} numberOfLines={1}>
              · {s.place_name ? `${s.place_name}: ` : ""}
              {displayTitle(s)}
            </Text>
          ))}
          {n > 3 ? <Text style={styles.more}>and {n - 3} more</Text> : null}
        </View>
        <Pressable style={styles.primary} onPress={onGo} accessibilityRole="button">
          <Text style={styles.primaryText}>Go through them</Text>
        </Pressable>
        <Pressable style={styles.later} onPress={onLater} accessibilityRole="button">
          <Text style={styles.laterText}>Later</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(28,20,16,0.35)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 36,
  },
  head: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  note: {
    fontFamily: handFont,
    fontSize: 20,
    color: colors.orangeDeep,
    paddingBottom: 10,
    transform: [{ rotate: "-4deg" }],
  },
  title: {
    marginTop: 10,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: "300",
    letterSpacing: -1,
    color: colors.ink,
  },
  sub: { marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.muted },
  list: { marginTop: 14, gap: 4 },
  item: { fontSize: 15, color: colors.inkSoft },
  more: { fontSize: 13, color: colors.muted },
  primary: {
    marginTop: 20,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  later: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 6 },
  laterText: { fontSize: 14, fontWeight: "600", color: colors.muted },
});
