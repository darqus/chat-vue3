import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTheme } from 'vuetify'

export const useThemeStore = defineStore('theme', () => {
  const isDark = ref(false)

  // Load theme preference from localStorage
  const savedTheme = localStorage.getItem('chat-app-theme')
  if (savedTheme) {
    isDark.value = savedTheme === 'dark'
  }

  function toggleTheme() {
    isDark.value = !isDark.value
    localStorage.setItem('chat-app-theme', isDark.value ? 'dark' : 'light')

    // Apply theme to Vuetify
    const theme = useTheme()
    theme.global.name.value = isDark.value ? 'dark' : 'light'
  }

  function setTheme(theme: 'light' | 'dark') {
    isDark.value = theme === 'dark'
    localStorage.setItem('chat-app-theme', theme)

    // Apply theme to Vuetify
    const vuetifyTheme = useTheme()
    vuetifyTheme.global.name.value = theme
  }

  // Initialize theme on store creation
  function initTheme() {
    const theme = useTheme()
    theme.global.name.value = isDark.value ? 'dark' : 'light'
  }

  return {
    isDark,
    toggleTheme,
    setTheme,
    initTheme,
  }
})
