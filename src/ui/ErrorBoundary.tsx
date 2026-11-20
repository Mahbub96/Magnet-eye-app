import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Text } from './Text';
import { color, space, type } from './theme';

interface Props {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropChange?: unknown;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

/** Production Error Boundary that catches component crashes, displays a friendly recovery UI,
 * and prevents the entire app from terminating.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    this.props.onError?.(error, errorInfo);
    // Log in production safely
    console.error('[MagnetEye Crash Shield]: Caught component error:', error, errorInfo.componentStack);
  }

  override componentDidUpdate(prevProps: Props) {
    if (this.props.resetOnPropChange !== prevProps.resetOnPropChange && this.state.hasError) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null, showDetails: false });
  };

  goHome = () => {
    this.reset();
    router.replace('/(tabs)');
  };

  override render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error ?? new Error('Unknown error'), this.reset);
      }
      return this.props.fallback;
    }

    const errorMessage = this.state.error?.message || 'An unexpected rendering error occurred.';

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Text style={{ fontSize: 24 }}>⚠️</Text>
          </View>

          <Text style={[type.title, { textAlign: 'center', marginBottom: space.xs }]}>
            Something went wrong
          </Text>

          <Text style={[type.body, { textAlign: 'center', color: color.textDim, marginBottom: space.md }]}>
            Magnet Eye encountered an issue while rendering this screen. Your scan data is safely preserved on the device.
          </Text>

          <View style={styles.messageBox}>
            <Text style={[type.small, { color: color.warn, fontFamily: 'monospace' }]}>
              {errorMessage}
            </Text>
          </View>

          <View style={styles.buttonRow}>
            <Pressable style={[styles.button, styles.primaryButton]} onPress={this.reset}>
              <Text style={[type.body, { color: '#000', fontWeight: '600' }]}>Try Again</Text>
            </Pressable>

            <Pressable style={[styles.button, styles.secondaryButton]} onPress={this.goHome}>
              <Text style={[type.body, { color: color.text, fontWeight: '600' }]}>Return Home</Text>
            </Pressable>
          </View>

          <Pressable
            style={styles.detailsToggle}
            onPress={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
          >
            <Text style={[type.small, { color: color.textFaint }]}>
              {this.state.showDetails ? 'Hide technical details ▲' : 'Show technical details ▼'}
            </Text>
          </Pressable>

          {this.state.showDetails ? (
            <ScrollView style={styles.traceBox} nestedScrollEnabled>
              <Text style={[type.small, { color: color.textFaint, fontSize: 11, fontFamily: 'monospace' }]}>
                {this.state.error?.stack ?? 'No stack trace'}
                {'\n\nComponent Stack:'}
                {this.state.errorInfo?.componentStack ?? 'None'}
              </Text>
            </ScrollView>
          ) : null}
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: color.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.md,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: color.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.lg,
    alignItems: 'center',
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(235, 140, 50, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  messageBox: {
    width: '100%',
    backgroundColor: color.surface2,
    padding: space.sm,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.border,
    marginBottom: space.md,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: space.sm,
    width: '100%',
  },
  button: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: color.accent,
  },
  secondaryButton: {
    backgroundColor: color.surface2,
    borderWidth: 1,
    borderColor: color.border,
  },
  detailsToggle: {
    marginTop: space.md,
    padding: space.xs,
  },
  traceBox: {
    maxHeight: 140,
    width: '100%',
    backgroundColor: '#0a0b0e',
    borderRadius: 8,
    padding: space.xs,
    marginTop: space.xs,
  },
});
