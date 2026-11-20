import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { color, radius, space, type } from './theme';

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Title({ label, title, sub }: { label?: string; title: string; sub?: string }) {
  return (
    <View style={{ gap: space.xs, marginBottom: space.sm }}>
      {label ? <Text style={type.label}>{label.toUpperCase()}</Text> : null}
      <Text style={type.title}>{title}</Text>
      {sub ? <Text style={type.body}>{sub}</Text> : null}
    </View>
  );
}

export function Section({ title }: { title: string }) {
  return <Text style={[type.label, { color: color.textFaint, marginTop: space.md }]}>{title.toUpperCase()}</Text>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonKind = 'primary' | 'secondary' | 'danger';
export function Button({
  title,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? color.accent : color.surface2;
  const fg = kind === 'primary' ? color.accentText : kind === 'danger' ? color.bad : color.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export type Tone = 'good' | 'warn' | 'bad' | 'info';
const toneColor: Record<Tone, string> = {
  good: color.good,
  warn: color.warn,
  bad: color.bad,
  info: color.accent,
};

export function Chip({ text, tone = 'info' }: { text: string; tone?: Tone }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} />
      <Text style={[type.small, { color: color.text }]}>{text}</Text>
    </View>
  );
}

export function Stat({ label, value, unit, note, tone }: {
  label: string;
  value: string;
  unit?: string;
  note?: string;
  tone?: Tone;
}) {
  return (
    <Card style={{ flex: 1, gap: space.xs }}>
      <Text style={type.small}>{label}</Text>
      <Text style={type.value}>
        {value}
        {unit ? <Text style={[type.small, { fontSize: 13 }]}> {unit}</Text> : null}
      </Text>
      {note ? <Text style={[type.small, { color: tone ? toneColor[tone] : color.textDim }]}>{note}</Text> : null}
    </Card>
  );
}

export function Row({ title, sub, right, tone, onPress }: {
  title: string;
  sub?: string;
  right?: string;
  tone?: Tone;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.row}>
      {tone ? <View style={[styles.dot, { backgroundColor: toneColor[tone] }]} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[type.heading, { fontSize: 15 }]}>{title}</Text>
        {sub ? <Text style={type.small}>{sub}</Text> : null}
      </View>
      {right ? <Text style={[type.small, { color: tone ? toneColor[tone] : color.textDim }]}>{right}</Text> : null}
    </View>
  );
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      {body}
    </Pressable>
  ) : (
    body
  );
}

export function Banner({ text, tone = 'warn' }: { text: string; tone?: Tone }) {
  return (
    <View style={[styles.banner, { borderColor: toneColor[tone] }]}>
      <View style={[styles.dot, { backgroundColor: toneColor[tone], marginTop: 6 }]} />
      <Text style={[type.body, { color: color.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}

export function NumberField({ label, value, onChange, ...rest }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
} & Omit<TextInputProps, 'value' | 'onChange'>) {
  return (
    <View style={{ flex: 1, gap: space.xs }}>
      <Text style={type.small}>{label}</Text>
      <TextInput
        style={styles.input}
        keyboardType="numbers-and-punctuation"
        defaultValue={String(value)}
        key={value}
        onEndEditing={(e) => {
          const v = Number(e.nativeEvent.text.replace(',', '.'));
          if (Number.isFinite(v)) onChange(v);
        }}
        placeholderTextColor={color.textFaint}
        {...rest}
      />
    </View>
  );
}

export function Field(props: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: space.xs }}>
      <Text style={type.small}>{props.label}</Text>
      <TextInput style={styles.input} placeholderTextColor={color.textFaint} {...props} />
    </View>
  );
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  card: {
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border,
  },
  button: {
    height: 48,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  buttonText: { fontSize: 15, fontWeight: '600' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: color.surface2,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border,
  },
  banner: {
    flexDirection: 'row',
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: color.surface,
  },
  input: {
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: color.surface2,
    color: color.text,
    paddingHorizontal: space.md,
    fontSize: 15,
  },
});
