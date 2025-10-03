import { ConfigService, Language } from '@config/env.config';
import fs from 'fs';
import i18next from 'i18next';
import path from 'path';

// Detect if running from dist/ (production) or src/ (development)
const isProduction = fs.existsSync(path.join(process.cwd(), 'dist'));
const baseDir = isProduction ? 'dist' : 'src/utils';
const translationsPath = path.join(process.cwd(), baseDir, 'translations');

const languages = ['en', 'pt-BR', 'es'];
const configService: ConfigService = new ConfigService();

const resources: any = {};

languages.forEach((language) => {
  const languagePath = path.join(translationsPath, `${language}.json`);
  if (fs.existsSync(languagePath)) {
    const translationContent = fs.readFileSync(languagePath, 'utf8');
    resources[language] = {
      translation: JSON.parse(translationContent),
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
