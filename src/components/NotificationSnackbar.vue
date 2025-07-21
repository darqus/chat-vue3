<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification'

const notificationStore = useNotificationStore()
</script>

<template>
  <v-snackbar
    v-model="notificationStore.show"
    :color="notificationStore.color"
    :timeout="notificationStore.timeout"
    location="top"
  >
    {{ notificationStore.text }}
    <template #actions>
      <v-btn
        variant="text"
        icon="mdi-close"
        @click="notificationStore.hideNotification()"
      ></v-btn>
    </template>
  </v-snackbar>
</template>
