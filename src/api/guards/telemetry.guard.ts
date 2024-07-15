import { NextFunction, Request, Response } from 'express';

import { sendTelemetry } from '../../utils/sendTelemetry';

class Telemetry {
  public collectTelemetry(req: Request, res: Response, next: NextFunction): void {
    sendTelemetry(req.path);

    next();
  }
}

export default Telemetry;
