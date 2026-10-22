import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../theme";

export type SheetAction = {
  id: string;
  label: string;
  destructive?: boolean;
};

type Props = {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onSelect: (id: string) => void;
  onClose: () => void;
};

export function ActionSheet({
  visible,
  title,
  actions,
  onSelect,
  onClose,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {actions.map((a) => (
            <Pressable
              key={a.id}
              style={styles.row}
              onPress={() => onSelect(a.id)}
            >
              <Text style={[styles.label, a.destructive && styles.destructive]}>
                {a.label}
              </Text>
            </Pressable>
          ))}
          <Pressable style={[styles.row, styles.cancel]} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 12,
    paddingBottom: 28,
  },
  title: {
    fontSize: 13,
    color: "#5D5A7A",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  row: { paddingVertical: 14, paddingHorizontal: 12 },
  label: { fontSize: 17, color: "#1E1B3A", fontWeight: "600" },
  destructive: { color: "#C2364A" },
  cancel: { marginTop: 4, backgroundColor: "#E7E8FA", borderRadius: 18 },
  cancelText: {
    fontSize: 17,
    color: "#1E1B3A",
    fontWeight: "600",
    textAlign: "center",
  },
});
