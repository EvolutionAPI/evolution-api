import { CacheConf, ConfigService } from '../config/env.config';
import { ICache } from '../whatsapp/abstract/abstract.cache';
import { LocalCache } from './localcache';
import { RedisCache } from './rediscache';

export class CacheEngine {
  private engine: ICache;

  constructor(private readonly configService: ConfigService, module: string) {
    const cacheConf = configService.get<CacheConf>('CACHE');

    if (cacheConf?.REDIS?.ENABLED && cacheConf?.REDIS?.URI !== '') {
      this.engine = new RedisCache(configService, module);
    } else if (cacheConf?.LOCAL?.ENABLED) {
      this.engine = new LocalCache(configService, module);
    }
  }

  public getEngine() {
    return this.engine;
  }
}
