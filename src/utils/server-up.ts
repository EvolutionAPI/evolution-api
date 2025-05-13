import { configService, SslConf } from '@config/env.config';
import { Express } from 'express';
import { readFileSync } from 'fs';
import * as http from 'http';
import * as https from 'https';

export class ServerUP {
  static #app: Express;

  static set app(e: Express) {
    this.#app = e;
  }

  static get https() {
    try {
      const { FULLCHAIN, PRIVKEY } = configService.get<SslConf>('SSL_CONF');
      return https.createServer(
        {
          cert: readFileSync(FULLCHAIN),
          key: readFileSync(PRIVKEY),
        },
        ServerUP.#app,
      );
    } catch {
      return null
    }
  }

  static get http() {
    return http.createServer(ServerUP.#app);
  }
}
