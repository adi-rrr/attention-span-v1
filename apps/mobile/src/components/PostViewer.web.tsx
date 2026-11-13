import * as Linking from "expo-linking";
import { useEffect } from "react";
import type { Save } from "../types";

type Props = {
  save: Save | null;
  onClose: () => void;
};

/** The web build has no in-app viewer: it opens the post in a new tab. */
export function PostViewer({ save, onClose }: Props) {
  useEffect(() => {
    if (!save?.source_url) return;
    void Linking.openURL(save.source_url);
    onClose();
  }, [save, onClose]);
  return null;
}
