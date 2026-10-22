import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text, TextInput, colors, shadow } from "./theme";

type Props = { onSubmit: (passcode: string) => void };

/** Shown when the hosted API asks for the passcode (once per device). */
export function PasscodeScreen({ onSubmit }: Props) {
  const [value, setValue] = useState("");
  const ready = value.trim().length > 0;

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.blobPeach} />
      <View pointerEvents="none" style={styles.blobLilac} />
      <View style={styles.card}>
        <View style={styles.mark} />
        <Text style={styles.title}>Attention Span</Text>
        <Text style={styles.sub}>Enter your passcode to open your saves.</Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={setValue}
          placeholder="Passcode"
          secureTextEntry
          autoFocus
          accessibilityLabel="Passcode"
          onSubmitEditing={() => ready && onSubmit(value.trim())}
        />
        <Pressable
          style={[styles.btn, !ready && styles.btnDisabled]}
          disabled={!ready}
          onPress={() => onSubmit(value.trim())}
        >
          <Text style={styles.btnText}>Unlock</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  blobPeach: {
    position: "absolute",
    top: -80,
    right: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.peach,
    opacity: 0.6,
  },
  blobLilac: {
    position: "absolute",
    bottom: -60,
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: colors.lilac,
    opacity: 0.5,
  },
  card: {
    padding: 24,
    borderRadius: 28,
    backgroundColor: colors.surface,
    ...shadow,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.peach,
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.6,
    color: colors.ink,
  },
  sub: { marginTop: 6, fontSize: 15, color: colors.muted },
  input: {
    marginTop: 20,
    minHeight: 52,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.bg,
    fontSize: 16,
    color: colors.ink,
  },
  btn: {
    marginTop: 12,
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
