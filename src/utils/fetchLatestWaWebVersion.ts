import axios, { AxiosRequestConfig } from 'axios';
import { fetchLatestBaileysVersion, WAVersion } from 'baileys';

import { CacheService } from '../api/services/cache.service';
import { CacheEngine } from '../cache/cacheengine';
import { Baileys, configService } from '../config/env.config';

// Cache keys
const CACHE_KEY_WHATSAPP_WEB_VERSION = 'whatsapp_web_version';
const CACHE_KEY_BAILEYS_FALLBACK_VERSION = 'baileys_fallback_version';

// Cache TTL (1 hour in seconds)
const CACHE_TTL_SECONDS = 3600;

const MODULE_NAME = 'whatsapp-version';

export const fetchLatestWaWebVersion = async (options: AxiosRequestConfig<{}>, cache?: CacheService) => {
  // Check if manual version is set via configuration
  const baileysConfig = configService.get<Baileys>('BAILEYS');
  const manualVersion = baileysConfig?.VERSION;

  if (manualVersion) {
    const versionParts = manualVersion.split('.').map(Number);
    if (versionParts.length === 3 && !versionParts.some(isNaN)) {
      return {
        version: versionParts as WAVersion,
        isLatest: false,
        isManual: true,
      };
    }
  }

  let versionCache = cache || null;

  if (!versionCache) {
    // Cache estático para versões do WhatsApp Web e fallback do Baileys (fallback se não for passado via parâmetro)
    const cacheEngine = new CacheEngine(configService, MODULE_NAME);
    const engine = cacheEngine.getEngine();
    const defaultVersionCache = new CacheService(engine);
    versionCache = defaultVersionCache;
  }

  // Check cache for WhatsApp Web version
  const cachedWaVersion = await versionCache.get(CACHE_KEY_WHATSAPP_WEB_VERSION);
  if (cachedWaVersion) {
    return cachedWaVersion;
  }

  try {
    const { data } = await axios.get('https://web.whatsapp.com/sw.js', {
      ...options,
      responseType: 'json',
    });

    const regex = /\\?"client_revision\\?":\s*(\d+)/;
    const match = data.match(regex);

    if (!match?.[1]) {
      // Check cache for Baileys fallback version
      const cachedFallback = await versionCache.get(CACHE_KEY_BAILEYS_FALLBACK_VERSION);
      if (cachedFallback) {
        return cachedFallback;
      }

      // Fetch and cache Baileys fallback version
      const fallbackVersion = {
        version: (await fetchLatestBaileysVersion()).version as WAVersion,
        isLatest: false,
        error: {
          message: 'Could not find client revision in the fetched content',
        },
      };

      await versionCache.set(CACHE_KEY_BAILEYS_FALLBACK_VERSION, fallbackVersion, CACHE_TTL_SECONDS);
      return fallbackVersion;
    }

    const clientRevision = match[1];

    const result = {
      version: [2, 3000, +clientRevision] as WAVersion,
      isLatest: true,
    };

    // Cache the successful result
    await versionCache.set(CACHE_KEY_WHATSAPP_WEB_VERSION, result, CACHE_TTL_SECONDS);

    return result;
  } catch (error) {
    // Check cache for Baileys fallback version
    const cachedFallback = await versionCache.get(CACHE_KEY_BAILEYS_FALLBACK_VERSION);
    if (cachedFallback) {
      return cachedFallback;
    }

    // Fetch and cache Baileys fallback version
    const fallbackVersion = {
      version: (await fetchLatestBaileysVersion()).version as WAVersion,
      isLatest: false,
      error,
    };

    await versionCache.set(CACHE_KEY_BAILEYS_FALLBACK_VERSION, fallbackVersion, CACHE_TTL_SECONDS);
    return fallbackVersion;
  }
};
