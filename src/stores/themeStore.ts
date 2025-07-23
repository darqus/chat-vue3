import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)

  // Load theme preference from localStorage
  const savedTheme = localStorage.getItem('chat-app-theme')
  if (savedTheme) {
    isDark.value = savedTheme === 'dark'
  }

  function toggleTheme() {
    isDark.value = !isDark.value
    const themeName = isDark.value ? 'dark' : 'light'
    localStorage.setItem('chat-app-theme', themeName)
  }

  function setTheme(themeName: 'light' | 'dark') {
    isDark.value = themeName === 'dark'
    localStorage.setItem('chat-app-theme', themeName)
  }

  return {
    isDark,
    toggleTheme,
    setTheme,
  }
})
