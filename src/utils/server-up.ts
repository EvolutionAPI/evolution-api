import { Express } from 'express';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';

import { configService, SslConf } from '../config/env.config';

export class ServerUP {
  static #app: Express;

  /**
   * Set the Express application instance.
   * @param {Express} e - The Express application instance.
   */
  static set app(e: Express) {
    this.#app = e;
  }

  /**
   * Get an HTTPS server instance with SSL configuration.
   * @returns {https.Server} An HTTPS server instance.
   */
  static get https() {
    // Retrieve SSL certificate and private key paths from configuration.
    const { FULLCHAIN, PRIVKEY } = configService.get<SslConf>('SSL_CONF');

    // Create an HTTPS server using the SSL certificate and private key.
    return https.createServer(
      {
        cert: readFileSync(FULLCHAIN), // Read SSL certificate file.
        key: readFileSync(PRIVKEY),     // Read private key file.
      },
      ServerUP.#app,
    );
  }

  /**
   * Get an HTTP server instance.
   * @returns {http.Server} An HTTP server instance.
   */
  static get http() {
    // Create an HTTP server using the Express application instance.
    return http.createServer(ServerUP.#app);
  }
}
