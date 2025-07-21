<script setup lang="ts">
defineOptions({
  name: 'LoginForm',
})

import { auth } from '@/firebase'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { useUserStore } from '@/stores/user'
import { notify } from '@/utils/notification'

const userStore = useUserStore()

const loginWithGoogle = async () => {
  const provider = new GoogleAuthProvider()
  try {
    const result = await signInWithPopup(auth, provider)
    const user = result.user
    if (user) {
      userStore.setUser({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
        photoURL: user.photoURL,
      })
      notify.success('Успешный вход в систему')
    }
  } catch (error) {
    console.error('Login failed: ', error)
    notify.error('Ошибка входа в систему')
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="elevation-12">
          <v-toolbar color="primary" dark flat>
            <v-toolbar-title>Login</v-toolbar-title>
          </v-toolbar>
          <v-card-text>
            <p class="text-center">Sign in to join the chat</p>
          </v-card-text>
          <v-card-actions class="justify-center">
            <v-btn
              @click="loginWithGoogle"
              color="red"
              dark
              large
              block
              prepend-icon="mdi-google"
            >
              Login with Google
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
