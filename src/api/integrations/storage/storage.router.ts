import { S3Router } from '@api/integrations/storage/s3/routes/s3.router';
import { Router } from 'express';

export class StorageRouter {
  public readonly router: Router;

  constructor(...guards: any[]) {
    this.router = Router();

    this.router.use('/s3', new S3Router(...guards).router);
  }
}
