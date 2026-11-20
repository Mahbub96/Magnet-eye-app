import { NativeModule, requireNativeModule } from 'expo';

import type { Capabilities, MagnetCaptureModuleEvents, RawRecording } from './MagnetCapture.types';

declare class MagnetCaptureModule extends NativeModule<MagnetCaptureModuleEvents> {
  readonly clockOriginNs: string;
  getCapabilities(): Capabilities;
  getArcoreStatus(): string;
  startStreaming(): void;
  stopStreaming(): void;
  startArcore(): void;
  stopArcore(): void;
  startRecording(): void;
  stopRecording(): RawRecording;
  isRecording(): boolean;
}

export default requireNativeModule<MagnetCaptureModule>('MagnetCapture');
