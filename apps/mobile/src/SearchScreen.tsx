import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text, TextInput } from "./theme";
import { api } from "./api";
import { displayTitle } from "./text";

export type SearchResult = {
  save_id: string;
  title: string;
  platform: string;
  folder_path: string;
  match_snippet: string;
  match_field: "understand" | "note" | "folder" | "title";
  has_reminder: boolean;
  has_map_pin: boolean;
  content_kind: string | null;
};

type Props = {
  onOpenSave?: (saveId: string) => void;
};

export function SearchScreen({ onOpenSave }: Props) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  async function runSearch() {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await api<{ items: SearchResult[] }>(
        `/search?q=${encodeURIComponent(term)}`,
      );
      setItems(res.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.hint}>
        Search how you’d remember it — trip, vibe, purpose.
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          placeholder="How would you remember this?"
          placeholderTextColor="#8C7E72"
          value={q}
          onChangeText={setQ}
          onSubmitEditing={() => void runSearch()}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.btn, !q.trim() && styles.btnDisabled]}
          onPress={() => void runSearch()}
          disabled={!q.trim() || loading}
        >
          <Text style={styles.btnText}>{loading ? "…" : "Go"}</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {loading ? <ActivityIndicator style={{ marginTop: 16 }} /> : null}

      <ScrollView
        style={styles.list}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {!loading && searched && items.length === 0 ? (
          <Text style={styles.empty}>
            No matches. Try words from your reflection — “Tokyo”, “cheap
            dinner”, “April trip”.
          </Text>
        ) : null}

        {items.map((item) => (
          <Pressable
            key={item.save_id}
            style={styles.card}
            onPress={() => onOpenSave?.(item.save_id)}
          >
            <Text style={styles.title}>{displayTitle(item)}</Text>
            <Text style={styles.meta}>
              {item.platform}
              {item.folder_path ? ` · ${item.folder_path}` : ""}
              {item.has_reminder ? " · 🔔" : ""}
              {item.has_map_pin ? " · 📍" : ""}
            </Text>
            <Text style={styles.snippet}>
              <Text style={styles.field}>{item.match_field}: </Text>
              {item.match_snippet}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hint: { fontSize: 13, color: "#6B5A50", marginBottom: 10 },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#DCD3C8",
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#FFF",
    fontSize: 16,
    color: "#1C1410",
  },
  btn: {
    backgroundColor: "#1C1410",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: "#FFF", fontWeight: "600" },
  error: { color: "#B3261E", marginTop: 8 },
  list: { marginTop: 12, flex: 1 },
  empty: { fontSize: 15, lineHeight: 22, color: "#6B5A50", marginTop: 8 },
  card: {
    backgroundColor: "#FFF",
    padding: 14,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E6DFD5",
  },
  title: { fontSize: 16, fontWeight: "600", color: "#1C1410" },
  meta: { marginTop: 4, fontSize: 12, color: "#6B5A50" },
  snippet: { marginTop: 8, fontSize: 14, lineHeight: 20, color: "#3A2D25" },
  field: { fontWeight: "600", color: "#6B5A50", textTransform: "capitalize" },
});
