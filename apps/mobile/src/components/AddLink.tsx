type Props = {
  /** Called after a link is saved, so the inbox can reload. */
  onSaved: () => void;
};

/**
 * Paste-a-link box. Phones save through the share sheet, so the native app
 * shows nothing here; the web build has its own version (AddLink.web.tsx).
 */
export function AddLink(_props: Props) {
  return null;
}
