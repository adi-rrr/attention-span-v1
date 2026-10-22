import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../theme";
import { defaultReminderDate, formatReminderTime } from "../reminders/format";

type Props = {
  visible: boolean;
  title?: string;
  suggestedLabel?: string | null;
  initialDate?: Date | null;
  allowClear?: boolean;
  busy?: boolean;
  onClose: () => void;
  onSave: (date: Date) => void;
  onClear?: () => void;
};

export function ReminderPickerModal({
  visible,
  title = "Set a reminder",
  suggestedLabel,
  initialDate,
  allowClear,
  busy,
  onClose,
  onSave,
  onClear,
}: Props) {
  const [value, setValue] = useState(initialDate ?? defaultReminderDate());
  const [androidMode, setAndroidMode] = useState<"date" | "time" | null>(null);

  useEffect(() => {
    if (visible) setValue(initialDate ?? defaultReminderDate());
  }, [visible, initialDate]);

  function onPick(_event: DateTimePickerEvent, date?: Date) {
    if (Platform.OS === "android") {
      setAndroidMode(null);
      if (!date) return;
      if (androidMode === "date") {
        const next = new Date(value);
        next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        setValue(next);
        setAndroidMode("time");
        return;
      }
      const next = new Date(value);
      next.setHours(date.getHours(), date.getMinutes(), 0, 0);
      setValue(next);
      return;
    }
    if (date) setValue(date);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {suggestedLabel ? (
            <Text style={styles.suggested}>{suggestedLabel}</Text>
          ) : null}
          <Text style={styles.when}>{formatReminderTime(value)}</Text>

          {Platform.OS === "ios" ? (
            <DateTimePicker
              value={value}
              mode="datetime"
              display="spinner"
              onChange={onPick}
              minimumDate={new Date()}
              themeVariant="light"
            />
          ) : (
            <Pressable
              style={styles.change}
              onPress={() => setAndroidMode("date")}
            >
              <Text style={styles.changeText}>Pick date & time</Text>
            </Pressable>
          )}

          {Platform.OS === "android" && androidMode ? (
            <DateTimePicker
              value={value}
              mode={androidMode}
              display="default"
              onChange={onPick}
              minimumDate={new Date()}
            />
          ) : null}

          <View style={styles.actions}>
            {allowClear && onClear ? (
              <Pressable
                style={[styles.btn, styles.ghost]}
                onPress={onClear}
                disabled={busy}
              >
                <Text style={styles.ghostText}>Remove</Text>
              </Pressable>
            ) : (
              <Pressable
                style={[styles.btn, styles.ghost]}
                onPress={onClose}
                disabled={busy}
              >
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.btn, styles.primary, busy && styles.disabled]}
              onPress={() => onSave(value)}
              disabled={busy}
            >
              <Text style={styles.primaryText}>{busy ? "Saving…" : "Save"}</Text>
            </Pressable>
          </View>
          {allowClear ? (
            <Pressable onPress={onClose} disabled={busy}>
              <Text style={styles.dismiss}>Cancel</Text>
            </Pressable>
          ) : null}
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
    marginBottom: 6,
  },
  suggested: { fontSize: 14, color: "#5D5A7A", marginBottom: 8 },
  when: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E1B3A",
    marginBottom: 8,
  },
  change: {
    backgroundColor: "#E7E8FA",
    paddingVertical: 12,
    borderRadius: 18,
    alignItems: "center",
    marginTop: 4,
  },
  changeText: { color: "#1E1B3A", fontWeight: "600" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
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
  dismiss: {
    marginTop: 12,
    textAlign: "center",
    color: "#5D5A7A",
    fontWeight: "600",
  },
});
