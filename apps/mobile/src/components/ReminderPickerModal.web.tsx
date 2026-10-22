import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Text, colors } from "../theme";
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

/** `YYYY-MM-DDTHH:mm` in local time, the format `<input type="datetime-local">` uses. */
function toLocalInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Web version: the browser's native date & time picker instead of the RN one. */
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

  useEffect(() => {
    if (visible) setValue(initialDate ?? defaultReminderDate());
  }, [visible, initialDate]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {suggestedLabel ? (
            <Text style={styles.suggested}>{suggestedLabel}</Text>
          ) : null}
          <Text style={styles.when}>{formatReminderTime(value)}</Text>

          <input
            type="datetime-local"
            aria-label="Reminder date and time"
            value={toLocalInput(value)}
            min={toLocalInput(new Date())}
            onChange={(e) => {
              const next = new Date(e.target.value);
              if (!Number.isNaN(next.getTime())) setValue(next);
            }}
            style={{
              marginTop: 4,
              minHeight: 48,
              padding: "0 16px",
              borderRadius: 999,
              border: `1px solid ${colors.border}`,
              background: colors.bg,
              color: colors.ink,
              fontSize: 16,
              fontFamily: "PlusJakartaSans_600SemiBold, sans-serif",
            }}
          />

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
    backgroundColor: "rgba(30, 27, 58, 0.45)",
    justifyContent: "center",
    padding: 24,
  },
  card: { backgroundColor: "#FFFFFF", borderRadius: 28, padding: 22 },
  title: { fontSize: 20, fontWeight: "800", color: colors.ink, marginBottom: 6 },
  suggested: { fontSize: 14, color: colors.muted, marginBottom: 8 },
  when: { fontSize: 16, fontWeight: "600", color: colors.ink, marginBottom: 8 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 16,
  },
  btn: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    minWidth: 96,
    alignItems: "center",
    justifyContent: "center",
  },
  ghost: { backgroundColor: colors.chip },
  ghostText: { color: colors.ink, fontWeight: "600" },
  primary: { backgroundColor: colors.accent },
  primaryText: { color: "#FFF", fontWeight: "700" },
  disabled: { opacity: 0.5 },
  dismiss: {
    marginTop: 12,
    textAlign: "center",
    color: colors.muted,
    fontWeight: "600",
  },
});
