import axios from 'axios';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

export interface TelemetryData {
  route: string;
  apiVersion: string;
  timestamp: Date;
}

export const sendTelemetry = async (route: string): Promise<void> => {
  const telemetry: TelemetryData = {
    route,
    apiVersion: `${packageJson.version}`,
    timestamp: new Date(),
  };

  axios
    .post('https://log.evolution-api.com/telemetry', telemetry)
    .then(() => {})
    .catch(() => {});
};
