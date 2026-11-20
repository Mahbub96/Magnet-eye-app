import { router } from 'expo-router';
import { useState } from 'react';

import { api, ApiError, API_VERSION, CALIBRATION_SCHEMA_VERSION, type Health } from '../api/client';
import { devDefaultServer, getServerUrl, setServerUrl } from '../api/server';
import { useSync } from '../sync/useSync';
import { Banner, Button, Card, Field, Row, Screen, Title } from '../ui/components';

/** Settings → Server: the backend address, with a test against /v1/health. */
export default function ServerScreen() {
  const [url, setUrl] = useState(getServerUrl() ?? '');
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  const test = async () => {
    setTesting(true);
    setHealth(null);
    setError(null);
    try {
      setHealth(await api.health(url.trim()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  };
  const matches =
    health && health.api_version === API_VERSION && health.calibration_schema_version === CALIBRATION_SCHEMA_VERSION;

  return (
    <Screen>
      <Title
        label="Settings"
        title="Server"
        sub="Swipes are sent to a Magnet Eye server, which rebuilds the field and forgets the data after 30 minutes. You can run your own."
      />
      <Field
        label="Server address"
        placeholder="https://magnet-eye.example.org"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        value={url}
        onChangeText={setUrl}
      />
      {devDefaultServer() ? (
        <Banner tone="info" text={`Development build: the default is the computer running Metro, ${devDefaultServer()}.`} />
      ) : null}
      <Button title="Test connection" kind="secondary" busy={testing} disabled={!url.trim()} onPress={test} />
      {error ? <Banner tone="bad" text={error} /> : null}
      {health ? (
        <Card>
          <Row
            title={matches ? 'Reachable and compatible' : 'Reachable, but a different version'}
            sub={`API ${health.api_version} · calibration schema ${health.calibration_schema_version} · server ${health.server_version}`}
            tone={matches ? 'good' : 'bad'}
            right={`${health.queue.waiting}/${health.queue.size} queued`}
          />
        </Card>
      ) : null}
      <Button
        title="Save"
        disabled={!url.trim()}
        onPress={() => {
          setServerUrl(url);
          useSync.getState().kick();
          router.back();
        }}
      />
    </Screen>
  );
}
