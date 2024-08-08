import axios from 'axios';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

export interface TelemetryData {
  route: string;
  apiVersion: string;
  timestamp: Date;
}

export const sendTelemetry = async (route: string): Promise<void> => {
  const enabled = process.env.TELEMETRY_ENABLED === undefined || process.env.TELEMETRY_ENABLED === 'true';

  console.log('Telemetry enabled:', enabled);
  if (!enabled) {
    return;
  }

  const telemetry: TelemetryData = {
    route,
    apiVersion: `${packageJson.version}`,
    timestamp: new Date(),
  };

  const url = process.env.TELEMETRY_URL || 'https://log.evolution-api.com/telemetry';

  axios
    .post(url, telemetry)
    .then(() => {})
    .catch(() => {});
};
