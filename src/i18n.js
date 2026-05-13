import { createI18n } from 'vue-i18n'
import ru from './locales/ru.js'
import en from './locales/en.js'
import de from './locales/de.js'
import fr from './locales/fr.js'
import es from './locales/es.js'
import zh from './locales/zh.js'

const savedLocale = localStorage.getItem('locale') || 'ru'

export const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'ru',
  messages: { ru, en, de, fr, es, zh },
})
