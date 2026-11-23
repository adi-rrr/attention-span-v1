import { Modal, Pressable, StyleSheet, View } from "react-native";
import { MELT_STAGES, MeltWord, type MeltStage } from "../doodles";
import { Text, colors, handFont } from "../theme";

type Props = {
  visible: boolean;
  onClose: () => void;
};

/** Each stage with a sample "days left" that shows its real badge. */
const ROWS: { stage: MeltStage; daysLeft: number; when: string }[] = [
  { stage: "fresh", daysLeft: 7, when: "6–7 days left" },
  { stage: "dripping", daysLeft: 3, when: "2–5 days left" },
  { stage: "last_day", daysLeft: 0, when: "under 24 hours left" },
];

/**
 * What fresh, dripping and last day mean. Opens from the "?" in the inbox,
 * and on its own the first time someone has saves in their inbox.
 */
export function StageGuide({ visible, onClose }: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close">
        {/* Taps on the sheet itself shouldn't close it. */}
        <Pressable style={styles.sheet} onPress={() => {}} accessible={false}>
          <Text style={styles.eyebrow}>how saves melt</Text>
          <Text style={styles.title}>Every save has 7 days.</Text>
          <Text style={styles.lead}>
            It melts a little each day. Act on it, plan it, keep the lesson, or let it go
            before it's gone.
          </Text>

          {ROWS.map((r) => (
            <View key={r.stage} style={styles.row}>
              <View style={styles.badgeCol}>
                <MeltWord daysLeft={r.daysLeft} size={22} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.when}>{r.when}</Text>
                <Text style={styles.rowTitle}>{MELT_STAGES[r.stage].title}</Text>
                {MELT_STAGES[r.stage].hint ? (
                  <Text style={styles.rowHint}>{MELT_STAGES[r.stage].hint}</Text>
                ) : null}
              </View>
            </View>
          ))}

          <View style={styles.rule} />
          <Text style={styles.note}>
            <Text style={styles.noteBold}>Time's up?</Text> Untouched saves fade and are
            deleted for good.
          </Text>
          <Text style={styles.note}>
            <Text style={styles.noteBold}>Places don't melt.</Text> They wait until you're
            there.
          </Text>

          <Pressable style={styles.btn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.btnText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 23, 20, 0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 32,
  },
  eyebrow: { fontFamily: handFont, fontSize: 20, color: colors.orangeDeep },
  title: { marginTop: 2, fontSize: 24, fontWeight: "800", color: colors.ink },
  lead: { marginTop: 6, fontSize: 15, lineHeight: 21, color: colors.inkSoft },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginTop: 16,
  },
  badgeCol: { width: 104 },
  rowText: { flex: 1, minWidth: 0 },
  when: { fontSize: 12, fontWeight: "600", color: colors.muted },
  rowTitle: { fontSize: 16, fontWeight: "700", color: colors.ink },
  rowHint: { fontSize: 14, color: colors.inkSoft },
  rule: { height: 1.5, backgroundColor: colors.line, marginTop: 18, marginBottom: 12 },
  note: { fontSize: 14, lineHeight: 20, color: colors.inkSoft, marginTop: 4 },
  noteBold: { fontWeight: "700", color: colors.ink },
  btn: {
    marginTop: 20,
    minHeight: 50,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 16, fontWeight: "700", color: colors.surface },
});
