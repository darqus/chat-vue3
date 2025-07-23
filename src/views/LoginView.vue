<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const router = useRouter()
const email = ref('')
const password = ref('')

// Наблюдаем за изменением статуса аутентификации
watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      router.push('/chat')
    }
  }
)

async function signInWithGoogle() {
  await authStore.signInWithGoogle()
}

async function signInWithEmail() {
  if (!email.value || !password.value) return

  try {
    await authStore.signInWithEmail(email.value, password.value)
  } catch {
    // Error is handled in the store
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card class="elevation-12">
          <v-toolbar color="primary" dark flat>
            <v-toolbar-title>Добро пожаловать в Chat App</v-toolbar-title>
          </v-toolbar>

          <v-card-text>
            <v-row align="center" justify="center" class="py-8">
              <v-col cols="12" class="text-center">
                <v-icon size="80" color="primary">mdi-chat</v-icon>
                <h2 class="mt-4">Чат в реальном времени</h2>
                <p class="text-grey">Общайтесь с друзьями мгновенно</p>
              </v-col>
            </v-row>

            <v-alert
              v-if="authStore.error"
              type="error"
              class="mb-4"
              closable
              @click:close="authStore.error = null"
            >
              {{ authStore.error }}
            </v-alert>
          </v-card-text>

          <v-card-actions class="pa-4">
            <v-btn
              color="primary"
              size="large"
              block
              variant="flat"
              :loading="authStore.loading"
              @click="signInWithGoogle"
              prepend-icon="mdi-google"
              class="mb-2"
              elevation="2"
            >
              Войти через Google
            </v-btn>

            <v-divider class="my-4"></v-divider>

            <v-form @submit.prevent="signInWithEmail" class="w-100">
              <v-text-field
                v-model="email"
                label="Email"
                type="email"
                variant="outlined"
                class="mb-2"
                required
              />
              <v-text-field
                v-model="password"
                label="Пароль"
                type="password"
                variant="outlined"
                class="mb-2"
                required
              />
              <v-btn
                type="submit"
                color="secondary"
                size="large"
                block
                :loading="authStore.loading"
                :disabled="!email || !password"
              >
                Войти с Email
              </v-btn>
            </v-form>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
