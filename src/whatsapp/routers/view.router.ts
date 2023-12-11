import { Router } from 'express';
import fs from 'fs';
import mime from 'mime-types';

import { RouterBroker } from '../abstract/abstract.router';

export class ViewsRouter extends RouterBroker {
  constructor() {
    super();

    const basePath = 'evolution-manager/dist';

    const indexPath = require.resolve(`${basePath}/index.html`);

    this.router.get('/*', (req, res) => {
      try {
        const pathname = req.url.split('?')[0];

        // verify if url is a file in dist folder
        if (pathname === '/') throw {};
        const filePath = require.resolve(`${basePath}${pathname}`);

        const contentType = mime.lookup(filePath) || 'text/plain';
        res.set('Content-Type', contentType);
        res.end(fs.readFileSync(filePath));
      } catch {
        res.set('Content-Type', 'text/html');
        res.send(fs.readFileSync(indexPath));
      }
    });
  }

  public readonly router = Router();
}
