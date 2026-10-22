import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "../theme";

type Props = {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  onCancel: () => void;
  onSubmit: (value: string) => void;
  busy?: boolean;
};

export function TextPromptModal({
  visible,
  title,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  onCancel,
  onSubmit,
  busy,
}: Props) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor="#6B6990"
            autoFocus
          />
          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.ghost]} onPress={onCancel} disabled={busy}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.primary, (!value.trim() || busy) && styles.disabled]}
              onPress={() => onSubmit(value.trim())}
              disabled={!value.trim() || busy}
            >
              <Text style={styles.primaryText}>{busy ? "Saving…" : confirmLabel}</Text>
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
  card: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 20 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#1E1B3A",
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D6D8F0",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    fontSize: 16,
    color: "#1E1B3A",
  },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 16 },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 18,
    minWidth: 96,
    alignItems: "center",
  },
  ghost: { backgroundColor: "#E7E8FA" },
  ghostText: { color: "#1E1B3A", fontWeight: "600" },
  primary: { backgroundColor: "#5B5BD6" },
  primaryText: { color: "#FFF", fontWeight: "600" },
  disabled: { opacity: 0.5 },
});
