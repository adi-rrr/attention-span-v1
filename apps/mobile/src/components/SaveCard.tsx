import { Pressable, StyleSheet, View } from "react-native";
import { Text, colors, handFont, shadow } from "../theme";
import { platformLabel } from "../lifecycle";
import type { Save } from "../types";
import { displayTitle } from "../text";

type Props = {
  save: Save;
  onPress: () => void;
  onLongPress?: () => void;
  showFolderPath?: boolean;
};

export function SaveCard({ save, onPress, onLongPress, showFolderPath }: Props) {
  const snippet = save.understand_snippet?.trim();
  return (
    <Pressable
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {platformLabel(save.platform)}
          {save.has_reminder ? " · reminder" : ""}
          {showFolderPath && save.folder_path ? ` · ${save.folder_path}` : ""}
        </Text>
        {save.status === "done" ? <Text style={styles.done}>done</Text> : null}
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {displayTitle(save)}
      </Text>
      {snippet ? (
        <Text style={styles.snippet} numberOfLines={2}>
          {snippet}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: colors.surface,
    marginBottom: 12,
    ...shadow,
  },
  metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  meta: { flex: 1, fontSize: 12, fontWeight: "600", color: colors.muted },
  done: { fontFamily: handFont, fontSize: 18, color: colors.orangeDeep },
  title: { marginTop: 2, fontSize: 16, lineHeight: 21, fontWeight: "700", color: colors.ink },
  snippet: { marginTop: 6, fontSize: 14, lineHeight: 20, fontWeight: "300", color: colors.inkSoft },
});
