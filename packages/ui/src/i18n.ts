import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en.json";
import id from "./locales/id.json";

const resources = {
  en: {
    translation: en,
  },
  id: {
    translation: id,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
      format: (value, format, lng) => {
        if (format === "number") {
          return new Intl.NumberFormat(lng).format(Number(value));
        }
        return value;
      },
    },
  });

export default i18n;
