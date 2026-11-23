import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { createSave, lifespanDaysOf, uploadScreenshot } from "../share/createSave";
import { parseShareIntent } from "../share/platform";
import {
  failedMessage,
  NOTHING_TO_SAVE,
  savedMessage,
  type SaveOutcome,
} from "../share/saveMessages";
import { Text, TextInput, colors } from "../theme";
import type { Save } from "../types";

type Props = {
  /** Called after something is saved, so the inbox can reload. */
  onSaved: () => void;
};

/** Longest side of an uploaded screenshot; plenty for the AI to read text. */
const MAX_SIDE = 1600;

/** Shrink an image file to a JPEG data: URL, so uploads stay small and fast. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Can't read this image"));
        return;
      }
      ctx.fillStyle = "#FFFFFF"; // transparent PNGs get a white background
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Can't read this image"));
    };
    img.src = url;
  });
}

/**
 * Web only: on a computer there's no share sheet, so save by pasting any link
 * (Instagram, YouTube, Pinterest, any page; not Reddit) or by uploading a
 * screenshot. Both run the same save as a phone share: the server reads the
 * content, titles it and sorts it into a category.
 */
export function AddLink({ onSaved }: Props) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<null | "link" | "image">(null);
  const [result, setResult] = useState<SaveOutcome | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function run(kind: "link" | "image", save: () => Promise<Save>) {
    setBusy(kind);
    setResult(null);
    try {
      const saved = await save();
      setResult(
        saved.expires_at === null
          ? { ok: true, message: "Saved · places don't fade: it waits until you're there" }
          : savedMessage(lifespanDaysOf(saved)),
      );
      if (kind === "link") setValue("");
      onSaved();
    } catch (e) {
      const outcome = failedMessage(e);
      setResult(outcome);
      // A duplicate is already in the app: show where, and refresh anyway.
      if (outcome.ok) onSaved();
    } finally {
      setBusy(null);
    }
  }

  function saveLink() {
    if (busy || !value.trim()) return;
    // The same parsing as a share: it also finds a link inside pasted text.
    const payload = parseShareIntent({ text: value, webUrl: null, hasImage: false });
    if (!payload?.source_url) {
      setResult(NOTHING_TO_SAVE);
      return;
    }
    void run("link", () =>
      createSave({ platform: payload.platform, source_url: payload.source_url, client: "web" }),
    );
  }

  function onFile(file: File | undefined) {
    if (!file || busy) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) {
      setResult({ ok: false, message: "Not saved: upload a PNG, JPEG or WebP image." });
      return;
    }
    void run("image", async () => uploadScreenshot(await toDataUrl(file)));
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
          onSubmitEditing={saveLink}
          placeholder="Paste a link: Instagram, YouTube, Pinterest…"
          placeholderTextColor={colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          inputMode="url"
          returnKeyType="done"
          editable={!busy}
          accessibilityLabel="Link to save"
        />
        <Pressable
          style={[styles.btn, (!value.trim() || busy) && styles.btnOff]}
          onPress={saveLink}
          disabled={!value.trim() || Boolean(busy)}
          accessibilityRole="button"
        >
          {busy === "link" ? (
            <ActivityIndicator color={colors.surface} />
          ) : (
            <Text style={styles.btnText}>Save</Text>
          )}
        </Pressable>
      </View>

      <Pressable
        style={[styles.upload, busy && styles.btnOff]}
        onPress={() => fileRef.current?.click()}
        disabled={Boolean(busy)}
        accessibilityRole="button"
        accessibilityLabel="Upload a screenshot"
      >
        {busy === "image" ? (
          <View style={styles.uploadBusy}>
            <ActivityIndicator color={colors.ink} />
            <Text style={styles.uploadText}>Reading your screenshot…</Text>
          </View>
        ) : (
          <Text style={styles.uploadText}>+ Upload a screenshot (PNG, JPEG)</Text>
        )}
      </Pressable>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        style={{ display: "none" }}
        onChange={(e) => {
          onFile(e.currentTarget.files?.[0]);
          e.currentTarget.value = ""; // choosing the same file again still fires
        }}
      />

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
  upload: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 999,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  uploadBusy: { flexDirection: "row", alignItems: "center", gap: 8 },
  uploadText: { fontSize: 14, fontWeight: "600", color: colors.inkSoft },
  result: { marginTop: 8, fontSize: 13, color: colors.inkSoft },
  resultBad: { color: colors.danger },
});
