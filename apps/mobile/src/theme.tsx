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
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from "@expo-google-fonts/plus-jakarta-sans";

/** "Soft" palette — calm pastel, from the prototypes canvas. */
export const colors = {
  bg: "#EEF0FB",
  surface: "#FFFFFF",
  ink: "#1E1B3A",
  inkSoft: "#3E3B5C",
  muted: "#5D5A7A",
  faint: "#6B6990",
  accent: "#5B5BD6",
  accentText: "#4B4BC4",
  accentTint: "#F1F1FF",
  chip: "#E7E8FA",
  border: "#D6D8F0",
  peach: "#FFD3B8",
  lilac: "#C9CCFF",
  danger: "#C2364A",
  dangerTint: "#FCE4E8",
};

export const fontAssets = {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
};

const FAMILY_BY_WEIGHT: Record<string, string> = {
  "100": "PlusJakartaSans_400Regular",
  "200": "PlusJakartaSans_400Regular",
  "300": "PlusJakartaSans_400Regular",
  "400": "PlusJakartaSans_400Regular",
  normal: "PlusJakartaSans_400Regular",
  "500": "PlusJakartaSans_500Medium",
  "600": "PlusJakartaSans_600SemiBold",
  "700": "PlusJakartaSans_700Bold",
  bold: "PlusJakartaSans_700Bold",
  "800": "PlusJakartaSans_800ExtraBold",
  "900": "PlusJakartaSans_800ExtraBold",
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

export const shadow = {
  shadowColor: "#3C3C8C",
  shadowOpacity: 0.18,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 10 },
  elevation: 4,
};
