import { RouterBroker } from '@api/abstract/abstract.router';
import express, { Router } from 'express';
import path from 'path';

export class ViewsRouter extends RouterBroker {
  public readonly router: Router;

  constructor() {
    super();
    this.router = Router();

    const basePath = path.join(process.cwd(), 'manager', 'dist');
    const indexPath = path.join(basePath, 'index.html');

    this.router.use(express.static(basePath));

    this.router.get('*', (req, res) => {
      res.sendFile(indexPath);
    });
  }
}
