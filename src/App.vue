<script setup lang="ts">
import { useUserStore } from '@/stores/user'
import { auth } from '@/firebase'
import { onIdTokenChanged, signOut } from 'firebase/auth'
import { onUnmounted } from 'vue'
import Login from './components/LoginForm.vue'
import Chat from './components/ChatComponent.vue'
import NotificationSnackbar from './components/NotificationSnackbar.vue'
import { notify } from '@/utils/notification'

const userStore = useUserStore()

const unsubscribe = onIdTokenChanged(auth, (user) => {
  if (user) {
    userStore.user = {
      uid: user.uid,
      displayName: user.displayName,
      email: user.email,
      photoURL: user.photoURL,
    }
    userStore.error = null
  } else {
    userStore.user = null
    if (userStore.unsubscribeMessages) {
      userStore.unsubscribeMessages()
    }
  }
})

onUnmounted(() => {
  unsubscribe()
})

const logout = async () => {
  try {
    await signOut(auth)
    notify.info('Вы вышли из системы')
  } catch (error) {
    console.error('Error signing out: ', error)
    notify.error('Ошибка выхода из системы')
  }
}
</script>

<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title>Firebase Chat</v-toolbar-title>
      <v-spacer></v-spacer>
      <div v-if="userStore.user" class="d-flex align-center">
        <v-avatar v-if="userStore.user.photoURL" size="36" class="mr-3">
          <v-img
            :src="userStore.user.photoURL"
            :alt="userStore.user.displayName || ''"
          ></v-img>
        </v-avatar>
        <span>{{ userStore.user.displayName }}</span>
        <v-btn @click="logout" icon="mdi-logout" class="ml-3"></v-btn>
      </div>
    </v-app-bar>

    <v-main>
      <Login v-if="!userStore.user" />
      <Chat v-else />
    </v-main>
    
    <NotificationSnackbar />
  </v-app>
</template>
