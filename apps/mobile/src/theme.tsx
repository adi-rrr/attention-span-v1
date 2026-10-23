import { forwardRef } from "react";
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import {
  InterTight_300Light,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
} from "@expo-google-fonts/inter-tight";
import { GochiHand_400Regular } from "@expo-google-fonts/gochi-hand";

/**
 * "Doodle" palette (Round 3 prototypes): warm cream paper, ink lines, and
 * orange only where something is melting. Key names are shared with the
 * earlier theme so every screen picks the new look up.
 */
export const colors = {
  bg: "#F2EDE6",
  surface: "#FBF8F3",
  stone: "#E6E1DA",
  ink: "#1C1410",
  inkSoft: "#3A2D25",
  muted: "#6B5A50",
  faint: "#8C7E72",
  line: "#DCD3C8",
  accent: "#1C1410",
  accentText: "#B23F0C",
  accentTint: "#FFE3CF",
  chip: "#E6DFD5",
  border: "#CFC6BB",
  peach: "#FFD9B8",
  lilac: "#E6E1DA",
  orange: "#E2551A",
  orangeDeep: "#B23F0C",
  ember: "#FF7A33",
  cone: "#E8B77A",
  danger: "#B3261E",
  dangerTint: "#FBE3DF",
};

/** Handwritten notes and annotations, like the doodle captions. */
export const handFont = "GochiHand_400Regular";

export const fontAssets = {
  InterTight_300Light,
  InterTight_400Regular,
  InterTight_500Medium,
  InterTight_600SemiBold,
  InterTight_700Bold,
  InterTight_800ExtraBold,
  GochiHand_400Regular,
};

const FAMILY_BY_WEIGHT: Record<string, string> = {
  "100": "InterTight_300Light",
  "200": "InterTight_300Light",
  "300": "InterTight_300Light",
  "400": "InterTight_400Regular",
  normal: "InterTight_400Regular",
  "500": "InterTight_500Medium",
  "600": "InterTight_600SemiBold",
  "700": "InterTight_700Bold",
  bold: "InterTight_700Bold",
  "800": "InterTight_800ExtraBold",
  "900": "InterTight_800ExtraBold",
};

/** Custom fonts on Android need one family per weight, so map fontWeight → family. */
function withFont(style: TextProps["style"]): TextStyle[] {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) return [flat];
  const family = FAMILY_BY_WEIGHT[String(flat.fontWeight ?? "400")];
  return [{ ...flat, fontFamily: family, fontWeight: undefined }];
}

export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={withFont(style)} />;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  function TextInput({ style, placeholderTextColor, ...rest }, ref) {
    return (
      <RNTextInput
        ref={ref}
        {...rest}
        placeholderTextColor={placeholderTextColor ?? colors.faint}
        style={withFont(style)}
      />
    );
  },
);

/**
 * Cards are flat paper with a thin line, not floating shadows. Kept under the
 * old name so existing `...shadow` card styles switch over.
 */
export const shadow = {
  borderWidth: 1.5,
  borderColor: colors.line,
};
