import { ConfigService, Language } from '@config/env.config';
import fs from 'fs';
import i18next from 'i18next';
import path from 'path';

const distPath = path.resolve(process.cwd(), 'dist', 'translations');
const srcPath = path.resolve(process.cwd(), 'src', 'utils', 'translations');

let translationsPath;

if (fs.existsSync(distPath)) {
  translationsPath = distPath;
} else if (fs.existsSync(srcPath)) {
  translationsPath = srcPath;
} else {
  console.error('Translations directory not found in dist or src.');
  // Fallback to a non-existent path or handle error appropriately
  translationsPath = '';
}

const languages = ['en', 'pt-BR', 'es'];
const configService: ConfigService = new ConfigService();

const resources: any = {};

if (translationsPath) {
  languages.forEach((language) => {
    const languagePath = path.join(translationsPath, `${language}.json`);
    if (fs.existsSync(languagePath)) {
      const translationContent = fs.readFileSync(languagePath, 'utf8');
      resources[language] = {
        translation: JSON.parse(translationContent),
      };
    }
  });
}

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
