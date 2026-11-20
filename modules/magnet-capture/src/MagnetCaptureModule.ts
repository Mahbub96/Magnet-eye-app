import { NativeModule, requireNativeModule } from 'expo';

import type { Capabilities, MagnetCaptureModuleEvents, RawRecording } from './MagnetCapture.types';

declare class MagnetCaptureModule extends NativeModule<MagnetCaptureModuleEvents> {
  readonly clockOriginNs: string;
  getCapabilities(): Capabilities;
  startStreaming(): void;
  stopStreaming(): void;
  startRecording(): void;
  stopRecording(): RawRecording;
  isRecording(): boolean;
}

export default requireNativeModule<MagnetCaptureModule>('MagnetCapture');
