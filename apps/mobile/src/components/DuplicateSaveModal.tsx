import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../theme";

type Props = {
  visible: boolean;
  savedAt?: string;
  onCancel: () => void;
  onReplace: () => void;
  busy?: boolean;
};

export function DuplicateSaveModal({
  visible,
  savedAt,
  onCancel,
  onReplace,
  busy,
}: Props) {
  const when = savedAt
    ? new Date(savedAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "before";

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Already saved</Text>
          <Text style={styles.body}>
            You saved this on {when}. Replace it with this new save?
          </Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnGhost]}
              onPress={onCancel}
              disabled={busy}
            >
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.btnPrimary, busy && styles.disabled]}
              onPress={onReplace}
              disabled={busy}
            >
              <Text style={styles.btnPrimaryText}>
                {busy ? "Replacing…" : "Replace"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 23, 20, 0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E1B3A",
    marginBottom: 8,
  },
  body: { fontSize: 16, lineHeight: 22, color: "#3E3B5C", marginBottom: 20 },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    minWidth: 96,
    alignItems: "center",
  },
  btnGhost: { backgroundColor: "#E7E8FA" },
  btnGhostText: { color: "#1E1B3A", fontWeight: "600" },
  btnPrimary: { backgroundColor: "#5B5BD6" },
  btnPrimaryText: { color: "#FFF", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
