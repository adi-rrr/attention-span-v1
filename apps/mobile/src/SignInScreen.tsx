import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Ember } from "./doodles";
import { sendCode, verifyCode } from "./session";
import { Text, TextInput, colors, handFont } from "./theme";

type Step = "email" | "code";

/** Email → 6-digit code. No passwords; invite-only accounts. */
export function SignInScreen() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const codeOk = /^\d{6,8}$/.test(code.trim());

  async function requestCode() {
    if (!emailOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      setStep("code");
      setNotice(`We sent a code to ${email.trim().toLowerCase()}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the code.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmCode() {
    if (!codeOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      // On success the session listener in App swaps this screen out.
      await verifyCode(email, code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That code didn't work.");
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>attention span</Text>
      <View style={styles.doodle}>
        <Ember pose="peek" size={110} />
        <Text style={styles.note}>
          {step === "email" ? "less scrolling.\nmore doing." : "check your\ninbox."}
        </Text>
      </View>

      <Text style={styles.title}>
        {step === "email" ? "Sign in" : "Enter your code"}
      </Text>
      <Text style={styles.sub}>
        {step === "email"
          ? "We'll email you a 6-digit code. No password to remember."
          : (notice ?? "")}
      </Text>

      {step === "email" ? (
        <>
          <Text style={styles.label}>EMAIL</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoFocus
            accessibilityLabel="Email"
            onSubmitEditing={() => void requestCode()}
          />
        </>
      ) : (
        <>
          <Text style={styles.label}>CODE</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 8))}
            placeholder="123456"
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            autoFocus
            accessibilityLabel="Sign-in code"
            onSubmitEditing={() => void confirmCode()}
          />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[
          styles.primary,
          (step === "email" ? !emailOk : !codeOk) || busy ? styles.disabled : null,
        ]}
        disabled={(step === "email" ? !emailOk : !codeOk) || busy}
        onPress={() => void (step === "email" ? requestCode() : confirmCode())}
      >
        {busy ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.primaryText}>
            {step === "email" ? "Send me a code" : "Sign in"}
          </Text>
        )}
      </Pressable>

      {step === "code" ? (
        <View style={styles.row}>
          <Pressable
            style={styles.textBtn}
            onPress={() => {
              setStep("email");
              setCode("");
              setError(null);
            }}
          >
            <Text style={styles.textBtnText}>Use another email</Text>
          </Pressable>
          <Pressable style={styles.textBtn} onPress={() => void requestCode()} disabled={busy}>
            <Text style={styles.textBtnText}>Send a new code</Text>
          </Pressable>
        </View>
      ) : (
        <Text style={styles.fine}>
          Attention Span is invite-only for now. Use the email you were invited with.
        </Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 22, paddingBottom: 48, flexGrow: 1, backgroundColor: colors.bg },
  brand: { fontSize: 17, fontWeight: "500", letterSpacing: -0.2, color: colors.ink },
  doodle: { marginTop: 24, flexDirection: "row", alignItems: "flex-end", gap: 10 },
  note: {
    fontFamily: handFont,
    fontSize: 22,
    lineHeight: 23,
    color: colors.orangeDeep,
    paddingBottom: 18,
    transform: [{ rotate: "-4deg" }],
  },
  title: {
    marginTop: 18,
    fontSize: 44,
    lineHeight: 46,
    fontWeight: "300",
    letterSpacing: -1.6,
    color: colors.ink,
  },
  sub: { marginTop: 6, fontSize: 15, lineHeight: 21, fontWeight: "300", color: colors.inkSoft },
  label: {
    marginTop: 28,
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    color: colors.muted,
  },
  input: {
    marginTop: 6,
    paddingVertical: 10,
    borderBottomWidth: 1.5,
    borderBottomColor: colors.ink,
    fontSize: 22,
    fontWeight: "300",
    color: colors.ink,
  },
  codeInput: { fontSize: 30, letterSpacing: 6 },
  error: { marginTop: 14, fontSize: 14, color: colors.danger },
  primary: {
    marginTop: 28,
    minHeight: 56,
    borderRadius: 999,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  disabled: { opacity: 0.4 },
  row: { marginTop: 10, flexDirection: "row", justifyContent: "space-between" },
  textBtn: { minHeight: 44, justifyContent: "center", paddingHorizontal: 4 },
  textBtnText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  fine: { marginTop: 18, fontSize: 13, lineHeight: 19, color: colors.muted },
});
