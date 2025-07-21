import { defineStore } from 'pinia'
import { ref } from 'vue'

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface NotificationOptions {
  text: string
  type?: NotificationType
  timeout?: number
}

export const useNotificationStore = defineStore('notification', () => {
  const show = ref(false)
  const text = ref('')
  const color = ref('success')
  const timeout = ref(3000)

  function showNotification(options: NotificationOptions) {
    text.value = options.text
    color.value = options.type || 'success'
    timeout.value = options.timeout || 3000
    show.value = true
  }

  function hideNotification() {
    show.value = false
  }

  return {
    show,
    text,
    color,
    timeout,
    showNotification,
    hideNotification
  }
})