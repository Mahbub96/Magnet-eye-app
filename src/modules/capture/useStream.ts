import { useEffect } from 'react';

import MagnetCapture from '../../../modules/magnet-capture/src';
import { useRecorder } from '../../store/recorder';

/** Keeps the sensors streaming while a screen is open; stops them on leave unless a scan is
 * using them. */
export function useSensorStream() {
  useEffect(() => {
    try {
      MagnetCapture.startStreaming();
    } catch {
      // the screen shows the sensor error itself
    }
    return () => {
      if (useRecorder.getState().phase === 'idle' && !useRecorder.getState().scan) MagnetCapture.stopStreaming();
    };
  }, []);
}
