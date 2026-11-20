import { router } from 'expo-router';

import { NoMagnetometer } from '../ui/NoMagnetometer';

export default function NoMagnetometerScreen() {
  return <NoMagnetometer onViewSaved={() => router.replace('/saved')} />;
}
