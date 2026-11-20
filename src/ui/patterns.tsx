import { Children, type ReactNode } from 'react';
import { Modal, Pressable, View, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from './components';
import { Text } from './Text';
import { color, space, type } from './theme';

/** Figma bottom sheet: scrim, rounded top, grab handle. Tapping the scrim closes it unless
 * `locked` (e.g. while a measurement runs). */
export function Sheet({ visible, onClose, locked, children }: {
  visible: boolean;
  onClose: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={locked ? undefined : onClose} statusBarTranslucent>
      <Pressable accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' }} onPress={locked ? undefined : onClose} />
      <View
        style={{
          backgroundColor: color.surface,
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          paddingHorizontal: 20,
          paddingTop: space.md,
          paddingBottom: 20 + insets.bottom,
          gap: space.lg,
        }}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: color.border }} />
        {children}
      </View>
    </Modal>
  );
}

/** Figma edge-state screen (10–12): a tinted icon, title and text centred, buttons at the
 * bottom. `extra` sits under the text (a status chip or a small card). */
export function CenteredState({ tint, glyph, title, text, extra, primary, secondary }: {
  tint: string;
  glyph: string;
  title: string;
  text: string;
  extra?: ReactNode;
  primary: { title: string; onPress: () => void };
  secondary?: { title: string; onPress: () => void };
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }}>
      <View style={{ flex: 1, paddingHorizontal: 20, paddingVertical: space.xl }}>
        <View style={{ flex: 1 }} />
        <View style={{ alignItems: 'center', gap: 14 }}>
          <View
            style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: tint + '24', alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ fontSize: 26, fontWeight: '600', color: tint }}>{glyph}</Text>
          </View>
          <Text style={[type.title, { fontSize: 22, textAlign: 'center' }]}>{title}</Text>
          <Text style={[type.body, { textAlign: 'center', lineHeight: 21 }]}>{text}</Text>
          {extra}
        </View>
        <View style={{ flex: 1 }} />
        <View style={{ gap: 10 }}>
          <Button title={primary.title} onPress={primary.onPress} />
          {secondary ? <Button title={secondary.title} kind="ghost" onPress={secondary.onPress} /> : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

/** A small rounded chip with a dot and a word, e.g. "Magnetometer: not found". */
export function StatusPill({ tint, text }: { tint: string; text: string }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: 999,
        backgroundColor: color.surface,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tint }} />
      <Text style={type.small}>{text}</Text>
    </View>
  );
}

/** Figma list card: rows on one surface, separated by hairlines. */
export function ListCard({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const rows = Children.toArray(children);
  return (
    <View style={[{ backgroundColor: color.surface, borderRadius: 16 }, style]}>
      {rows.map((r, i) => (
        <View key={i} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: color.border }}>
          {r}
        </View>
      ))}
    </View>
  );
}

/** One list row: leading icon, title and detail, trailing text. */
export function ListRow({ icon, title, detail, trailing, trailingTint }: {
  icon?: ReactNode;
  title: string;
  detail?: string;
  trailing?: string;
  trailingTint?: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }}>
      {icon}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 14, fontWeight: '500', color: color.text }}>{title}</Text>
        {detail ? <Text style={type.small}>{detail}</Text> : null}
      </View>
      {trailing ? <Text style={{ fontSize: 12, fontWeight: '500', color: trailingTint ?? color.textDim }}>{trailing}</Text> : null}
    </View>
  );
}

/** Figma stepper: one bar per step (done, current, to do) with a label under each. */
export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {steps.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }} accessibilityLabel={`${label}: ${i < current ? 'done' : i === current ? 'now' : 'to do'}`}>
          <View
            style={{
              height: 4,
              borderRadius: 2,
              backgroundColor: i <= current ? color.accent : color.surface2,
              opacity: i < current ? 0.5 : 1,
            }}
          />
          <Text style={{ fontSize: 10, color: i === current ? color.text : color.textFaint, fontWeight: i === current ? '500' : '400' }}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

export type Grade = 'good' | 'limited' | 'poor';
const GRADE: Record<Grade, { label: string; tint: string }> = {
  good: { label: 'Good', tint: color.good },
  limited: { label: 'Limited', tint: color.warn },
  poor: { label: 'Poor', tint: color.bad },
};

/** Figma metric card (Your phone can scan): label, value, graded chip. */
export function MetricCard({ label, value, grade }: { label: string; value: string; grade: Grade }) {
  const g = GRADE[grade];
  return (
    <View style={{ flex: 1, gap: 10, padding: 14, borderRadius: 16, backgroundColor: color.surface }}>
      <Text style={type.small}>{label}</Text>
      <Text style={{ fontSize: 20, fontWeight: '600', color: color.text, letterSpacing: -0.2 }}>{value}</Text>
      <View
        style={{
          alignSelf: 'flex-start',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 999,
          backgroundColor: g.tint + '24',
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: g.tint }} />
        <Text style={{ fontSize: 11, fontWeight: '500', color: g.tint }}>{g.label}</Text>
      </View>
    </View>
  );
}

/** Figma warning strip on Scan: filled with the tone colour, dark text, one line. */
export function Toast({ text, tint = color.warn }: { text: string; tint?: string }) {
  return (
    <View
      accessibilityRole="alert"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: tint }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color.accentText }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: '600', color: color.accentText }}>{text}</Text>
    </View>
  );
}
