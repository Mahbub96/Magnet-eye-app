import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Checks and requests CAMERA permission for ARCore visual tracking.
 * Returns true if granted, false otherwise.
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
    if (granted) return true;
    const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA, {
      title: 'Camera Permission for AR Tracking',
      message: 'Magnet Eye needs camera access to track your phone in 3D space as you scan over the magnet.',
      buttonPositive: 'Allow',
      buttonNegative: 'Use Ruler Mode',
    });
    return res === PermissionsAndroid.RESULTS.GRANTED;
  } catch (err) {
    console.warn('Camera permission request failed:', err);
    return false;
  }
}

/**
 * Checks if CAMERA permission is currently granted.
 */
export async function hasCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
  } catch {
    return false;
  }
}
