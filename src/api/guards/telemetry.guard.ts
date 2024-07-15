import axios from 'axios';
import { NextFunction, Request, Response } from 'express';
import fs from 'fs';

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));

interface TelemetryData {
  route: string;
  apiVersion: string;
  timestamp: Date;
}

class Telemetry {
  public collectTelemetry(req: Request, res: Response, next: NextFunction): void {
    const telemetry: TelemetryData = {
      route: req.path,
      apiVersion: `${packageJson.version}`,
      timestamp: new Date(),
    };

    axios
      .post('https://log.evolution-api.com/telemetry', telemetry)
      .then(() => {})
      .catch((error) => {
        console.error('Telemetry error', error);
      });

    next();
  }
}

export default Telemetry;
