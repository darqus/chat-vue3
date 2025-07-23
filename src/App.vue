<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from 'vuetify'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import NotificationSnackbar from './components/NotificationSnackbar.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()
const vuetifyTheme = useTheme()

// Инициализируем сразу, не ждем onMounted
authStore.initAuth()

// Initialize Vuetify theme based on store value
const themeName = themeStore.isDark ? 'dark' : 'light'
vuetifyTheme.global.name.value = themeName

onMounted(() => {
  // Дополнительная инициализация если нужна
})
</script>

<template>
  <v-app>
    <router-view />
    <NotificationSnackbar />
  </v-app>
</template>
