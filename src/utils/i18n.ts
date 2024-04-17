import fs from 'fs';
import i18next from 'i18next';
import path from 'path';

import { ConfigService, Language } from '../config/env.config';

const languages = ['en', 'pt-BR', 'es'];
const translationsPath = path.join(__dirname, 'translations');
const configService: ConfigService = new ConfigService();

const resources: any = {};

languages.forEach((language) => {
  const languagePath = path.join(translationsPath, `${language}.json`);
  if (fs.existsSync(languagePath)) {
    resources[language] = {
      translation: require(languagePath),
    };
  }
});

i18next.init({
  resources,
  fallbackLng: 'en',
  lng: configService.get<Language>('LANGUAGE'),
  debug: false,

  interpolation: {
    escapeValue: false,
  },
});
export default i18next;
