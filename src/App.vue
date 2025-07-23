<script setup lang="ts">
import { onMounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import NotificationSnackbar from './components/NotificationSnackbar.vue'

const authStore = useAuthStore()
const themeStore = useThemeStore()

// Инициализируем сразу, не ждем onMounted
authStore.initAuth()
themeStore.initTheme()

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
