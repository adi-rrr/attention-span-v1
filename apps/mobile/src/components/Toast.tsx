import { useEffect } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Text, colors, shadow } from "../theme";

type Props = {
  message: string | null;
  ok?: boolean;
  onHide: () => void;
  durationMs?: number;
};

/** One-line result banner that floats above the tab bar and hides itself. */
export function Toast({ message, ok = true, onHide, durationMs = 4500 }: Props) {
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(onHide, durationMs);
    return () => clearTimeout(t);
  }, [message, onHide, durationMs]);

  if (!message) return null;
  return (
    <Pressable
      onPress={onHide}
      accessibilityRole="alert"
      style={[styles.toast, ok ? styles.ok : styles.bad]}
    >
      <Text style={[styles.text, !ok && styles.badText]}>{message}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 92,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 20,
    ...shadow,
  },
  ok: { backgroundColor: colors.ink },
  bad: { backgroundColor: colors.dangerTint },
  text: { color: "#FFFFFF", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  badText: { color: colors.danger },
});
