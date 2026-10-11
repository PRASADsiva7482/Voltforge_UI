import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import en from './locales/en'

const localeLoaders: Record<string, () => Promise<{ default: Record<string, string> }>> = {
  hi: () => import('./locales/hi'),
  te: () => import('./locales/te'),
  ta: () => import('./locales/ta'),
  kn: () => import('./locales/kn'),
  ml: () => import('./locales/ml'),
  mr: () => import('./locales/mr'),
}

export async function loadLocale(lang: string): Promise<void> {
  const code = lang.slice(0, 2).toLowerCase()
  if (code === 'en' || i18n.hasResourceBundle(code, 'translation')) {
    return
  }
  const loader = localeLoaders[code]
  if (loader) {
    const mod = await loader()
    i18n.addResourceBundle(code, 'translation', mod.default, true, true)
  }
}

export async function setAppLanguage(lang: string): Promise<void> {
  await loadLocale(lang)
  await i18n.changeLanguage(lang)
}

const originalChangeLanguage = i18n.changeLanguage.bind(i18n)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
i18n.changeLanguage = async (lng?: string, callback?: any) => {
  if (lng) {
    await loadLocale(lng)
  }
  return originalChangeLanguage(lng, callback)
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
    },
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
  })

const initialLng = (i18n.language || 'en').slice(0, 2).toLowerCase()
if (initialLng !== 'en' && localeLoaders[initialLng]) {
  void loadLocale(initialLng).then(() => {
    void i18n.changeLanguage(initialLng)
  })
}

export default i18n
