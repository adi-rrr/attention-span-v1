/** Web: react-native-web's Alert is a no-op, so use the browser's confirm dialog. */
export function confirmDestructive(
  title: string,
  message: string,
  _confirmLabel: string,
  onConfirm: () => void,
) {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
