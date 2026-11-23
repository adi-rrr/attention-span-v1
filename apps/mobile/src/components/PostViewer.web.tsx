import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { apiBlob } from "../api";
import { displayTitle } from "../text";
import { Text, colors } from "../theme";
import type { Save } from "../types";

type Props = {
  save: Save | null;
  onClose: () => void;
};

/**
 * Whether a save has something to view. On the web that includes uploaded
 * screenshots, which have no link but have the image itself.
 */
export function canViewPost(save: Pick<Save, "source_url" | "platform">): boolean {
  return Boolean(save.source_url) || save.platform === "screenshot";
}

/**
 * Web viewer. A link opens in a new tab; an uploaded screenshot opens here,
 * in a floating window like the phone's post viewer.
 */
export function PostViewer({ save, onClose }: Props) {
  const isScreenshot = save?.platform === "screenshot";

  useEffect(() => {
    if (!save || isScreenshot || !save.source_url) return;
    void Linking.openURL(save.source_url);
    onClose();
  }, [save, isScreenshot, onClose]);

  if (!save || !isScreenshot) return null;
  return <ScreenshotViewer save={save} onClose={onClose} />;
}

function ScreenshotViewer({ save, onClose }: { save: Save; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Fetched with the user's sign-in, then shown from a local object URL.
  useEffect(() => {
    let url: string | null = null;
    let alive = true;
    void apiBlob(`/saves/${save.id}/image`)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        if (alive) setSrc(url);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [save.id]);

  const boxWidth = Math.min(width - 32, 520);
  const boxHeight = Math.min(height * 0.8, 760);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.box, { width: boxWidth, height: boxHeight }]}>
          <View style={styles.head}>
            <Text style={styles.title} numberOfLines={1}>
              {displayTitle(save)}
            </Text>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
          <View style={styles.body}>
            {src ? (
              <Image
                source={{ uri: src }}
                style={styles.image}
                resizeMode="contain"
                accessibilityLabel={`Screenshot: ${displayTitle(save)}`}
              />
            ) : failed ? (
              <Text style={styles.failed}>Couldn't load this screenshot.</Text>
            ) : (
              <ActivityIndicator color={colors.ink} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 23, 20, 0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    borderRadius: 24,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 18,
    paddingRight: 6,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  title: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.ink },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 18, color: colors.ink },
  body: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  image: { width: "100%", height: "100%" },
  failed: { fontSize: 14, color: colors.inkSoft },
});
