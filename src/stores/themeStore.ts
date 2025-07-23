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
    const themeName = isDark.value ? 'dark' : 'light'
    localStorage.setItem('chat-app-theme', themeName)

    // Apply theme to Vuetify using recommended API
    const theme = useTheme()
    if (theme.global.name) {
      theme.global.name.value = themeName
    }
  }

  function setTheme(themeName: 'light' | 'dark') {
    isDark.value = themeName === 'dark'
    localStorage.setItem('chat-app-theme', themeName)

    // Apply theme to Vuetify using recommended API
    const vuetifyTheme = useTheme()
    if (vuetifyTheme.global.name) {
      vuetifyTheme.global.name.value = themeName
    }
  }

  // Initialize theme on store creation
  function initTheme() {
    const themeName = isDark.value ? 'dark' : 'light'
    const theme = useTheme()
    if (theme.global.name) {
      theme.global.name.value = themeName
    }
  }

  return {
    isDark,
    toggleTheme,
    setTheme,
    initTheme,
  }
})
