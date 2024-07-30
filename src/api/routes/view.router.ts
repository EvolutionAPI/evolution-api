import express, { Router } from 'express';
import path from 'path';

import { RouterBroker } from '../abstract/abstract.router';

export class ViewsRouter extends RouterBroker {
  public readonly router: Router;

  constructor() {
    super();
    this.router = Router();

    const basePath = path.join(__dirname, '../../../manager/dist');
    const indexPath = path.join(basePath, 'index.html');

    console.log('Base path:', basePath);
    console.log('Index path:', indexPath);

    this.router.use(express.static(basePath));

    this.router.get('*', (req, res) => {
      res.sendFile(indexPath);
    });
  }
}
