import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { createSave, lifespanDaysOf } from "../share/createSave";
import { parseShareIntent } from "../share/platform";
import {
  failedMessage,
  NOTHING_TO_SAVE,
  savedMessage,
  type SaveOutcome,
} from "../share/saveMessages";
import { Text, TextInput, colors } from "../theme";

type Props = {
  /** Called after a link is saved, so the inbox can reload. */
  onSaved: () => void;
};

/**
 * Web only: paste a post link and save it. On a computer there's no share
 * sheet, so this runs the same save as sharing from the phone: the server
 * reads the link, titles it and sorts it into a category.
 */
export function AddLink({ onSaved }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SaveOutcome | null>(null);

  async function save() {
    if (busy || !value.trim()) return;
    // The same parsing as a share: it also finds a link inside pasted text.
    const payload = parseShareIntent({ text: value, webUrl: null, hasImage: false });
    if (!payload?.source_url) {
      setResult(NOTHING_TO_SAVE);
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const saved = await createSave({
        platform: payload.platform,
        source_url: payload.source_url,
      });
      setResult(savedMessage(lifespanDaysOf(saved)));
      setValue("");
      onSaved();
    } catch (e) {
      const outcome = failedMessage(e);
      setResult(outcome);
      // A duplicate is already in the app: show where, and refresh anyway.
      if (outcome.ok) onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => {
            setValue(t);
            setResult(null);
          }}
          onSubmitEditing={() => void save()}
          placeholder="Paste an Instagram post link"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          returnKeyType="done"
          editable={!busy}
          accessibilityLabel="Post link to save"
        />
        <Pressable
          style={[styles.btn, (!value.trim() || busy) && styles.btnOff]}
          onPress={() => void save()}
          disabled={!value.trim() || busy}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.btnText}>Save</Text>
          )}
        </Pressable>
      </View>
      {result ? (
        <Text style={[styles.result, !result.ok && styles.resultBad]}>{result.message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 18 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.ink,
    backgroundColor: colors.surface,
    fontSize: 15,
    color: colors.ink,
  },
  btn: {
    minHeight: 48,
    minWidth: 76,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  btnOff: { opacity: 0.4 },
  btnText: { fontSize: 15, fontWeight: "700", color: colors.surface },
  result: { marginTop: 8, fontSize: 13, color: colors.inkSoft },
  resultBad: { color: colors.danger },
});
