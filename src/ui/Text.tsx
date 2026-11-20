import { Text as RNText, TextInput as RNTextInput, type TextInputProps, type TextProps } from 'react-native';

import { font } from './theme';

/** React Native Text in the app font (Inter). Use this instead of the one from react-native. */
export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[{ fontFamily: font }, style]} />;
}

/** TextInput in the app font. */
export function TextInput({ style, ...rest }: TextInputProps) {
  return <RNTextInput {...rest} style={[{ fontFamily: font }, style]} />;
}
