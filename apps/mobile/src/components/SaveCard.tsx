import {
  Pressable,
  StyleSheet,
} from "react-native";
import { Text } from "../theme";
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
      <Text style={styles.title}>{displayTitle(save)}</Text>
      <Text style={styles.meta}>
        {save.platform}
        {save.status === "done" ? " · Done" : ""}
        {save.has_reminder ? " · reminder" : ""}
        {showFolderPath && save.folder_path ? ` · ${save.folder_path}` : ""}
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
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E7E8FA",
  },
  title: { fontSize: 16, fontWeight: "600", color: "#1E1B3A" },
  meta: { marginTop: 4, fontSize: 13, color: "#5D5A7A" },
  snippet: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#3E3B5C" },
});
