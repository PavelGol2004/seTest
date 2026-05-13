import { ref } from 'vue'

const isDark = ref(false)

function applyTheme(dark) {
  isDark.value = dark
  document.documentElement.classList.toggle('dark', dark)
  localStorage.setItem('theme', dark ? 'dark' : 'light')
}

export function useTheme() {
  function init() {
    const saved = localStorage.getItem('theme')
    if (saved) {
      applyTheme(saved === 'dark')
    } else {
      applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
  }

  function toggleTheme() {
    applyTheme(!isDark.value)
  }

  return { isDark, toggleTheme, init }
}
