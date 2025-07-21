import { useNotificationStore } from '@/stores/notification'

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface NotifyOptions {
  type?: NotificationType
  timeout?: number
}

export const notify = {
  success(text: string, options: NotifyOptions = {}) {
    const store = useNotificationStore()
    store.showNotification({
      text,
      type: 'success',
      ...options
    })
  },
  
  error(text: string, options: NotifyOptions = {}) {
    const store = useNotificationStore()
    store.showNotification({
      text,
      type: 'error',
      ...options
    })
  },
  
  info(text: string, options: NotifyOptions = {}) {
    const store = useNotificationStore()
    store.showNotification({
      text,
      type: 'info',
      ...options
    })
  },
  
  warning(text: string, options: NotifyOptions = {}) {
    const store = useNotificationStore()
    store.showNotification({
      text,
      type: 'warning',
      ...options
    })
  }
}