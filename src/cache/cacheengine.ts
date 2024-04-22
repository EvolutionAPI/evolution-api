import { ICache } from '../api/abstract/abstract.cache';
import { CacheConf, ConfigService } from '../config/env.config';
import { Logger } from '../config/logger.config';
import { LocalCache } from './localcache';
import { RedisCache } from './rediscache';

const logger = new Logger('Redis');

export class CacheEngine {
  private engine: ICache;

  constructor(private readonly configService: ConfigService, module: string) {
    const cacheConf = configService.get<CacheConf>('CACHE');

    if (cacheConf?.REDIS?.ENABLED && cacheConf?.REDIS?.URI !== '') {
      this.engine = new RedisCache(configService, module);
    } else if (cacheConf?.LOCAL?.ENABLED) {
      this.engine = new LocalCache(configService, module);
    }

    logger.info(`RedisCache initialized for ${module}`);
  }

  public getEngine() {
    return this.engine;
  }
}
