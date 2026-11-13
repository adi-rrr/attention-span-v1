import * as Linking from "expo-linking";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import { scheduleReturnNudge } from "../reminders/notifications";
import { displayTitle } from "../text";
import { Text, colors } from "../theme";
import type { Save } from "../types";

type Props = {
  save: Save | null;
  onClose: () => void;
};

/** Instagram's own embed page for a post or reel, or null if the link isn't one. */
export function instagramEmbedUrl(url: string | null | undefined): string | null {
  const code = url?.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/)?.[1];
  return code ? `https://www.instagram.com/p/${code}/embed/captioned/` : null;
}

/** How long after leaving for Instagram we nudge the user back. */
const RETURN_NUDGE_MS = 3 * 60 * 1000;

/**
 * The post inside our app, in a floating window that never goes full screen
 * (video included), so the user doesn't drift into the Instagram feed.
 * Links inside the post stay put; "Open in Instagram" is the only way out,
 * and it schedules a nudge to come back.
 */
export function PostViewer({ save, onClose }: Props) {
  const { width, height } = useWindowDimensions();
  const [loading, setLoading] = useState(true);
  const embed = instagramEmbedUrl(save?.source_url);

  function openInInstagram() {
    if (!save?.source_url) return;
    void Linking.openURL(save.source_url);
    void scheduleReturnNudge({
      saveId: save.id,
      title: displayTitle(save),
      fireAt: new Date(Date.now() + RETURN_NUDGE_MS),
    }).catch(() => {});
    onClose();
  }

  // Only the embed itself may load; taps on profile or post links stay here.
  function allowLoad(req: WebViewNavigation & { isTopFrame?: boolean }) {
    if (req.url.startsWith("about:") || req.isTopFrame === false) return true;
    return req.url.includes("/embed");
  }

  const boxWidth = Math.min(width - 32, 480);
  const boxHeight = Math.min(height * 0.72, 680);

  return (
    <Modal
      visible={save !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setLoading(true)}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.box, { width: boxWidth, height: boxHeight }]}>
          <View style={styles.bar}>
            <Text style={styles.barTitle} numberOfLines={1}>
              {save ? displayTitle(save) : ""}
            </Text>
            <Pressable style={styles.close} onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {embed ? (
            <View style={styles.webWrap}>
              <WebView
                source={{ uri: embed }}
                onLoadEnd={() => setLoading(false)}
                onShouldStartLoadWithRequest={allowLoad}
                setSupportMultipleWindows={false}
                allowsInlineMediaPlayback
                allowsFullscreenVideo={false}
                mediaPlaybackRequiresUserAction
                style={styles.web}
              />
              {loading ? (
                <View style={styles.loading} pointerEvents="none">
                  <ActivityIndicator color={colors.ink} />
                </View>
              ) : null}
            </View>
          ) : (
            <View style={styles.noEmbed}>
              <Text style={styles.noEmbedText}>
                This post can't be shown here. Open it in Instagram instead.
              </Text>
            </View>
          )}

          <Pressable style={styles.openBtn} onPress={openInInstagram} accessibilityRole="button">
            <Text style={styles.openBtnText}>Open in Instagram ↗</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,20,16,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  box: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.ink,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 16,
    paddingRight: 6,
    minHeight: 52,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  barTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: colors.ink },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  closeText: { fontSize: 18, color: colors.ink },
  webWrap: { flex: 1, backgroundColor: "#FFFFFF" },
  web: { flex: 1, backgroundColor: "#FFFFFF" },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  noEmbed: { flex: 1, padding: 24, alignItems: "center", justifyContent: "center" },
  noEmbedText: { fontSize: 15, lineHeight: 21, color: colors.muted, textAlign: "center" },
  openBtn: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  openBtnText: { fontSize: 15, fontWeight: "700", color: colors.accentText },
});
