import { useI18n } from 'vue-i18n'

export function useLocale() {
  const { locale } = useI18n()

  function setLocale(code) {
    locale.value = code
    localStorage.setItem('locale', code)
  }

  return { locale, setLocale }
}
