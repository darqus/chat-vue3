<template>
  <div>
    <v-btn v-if="!userStore.isLoggedIn" @click="userStore.login" prepend-icon="mdi-google">
      Login with Google
    </v-btn>
    <div v-else class="d-flex align-center">
      <v-avatar size="36" class="mr-3">
        <img :src="userStore.user?.photoURL ?? ''" alt="avatar">
      </v-avatar>
      <span>{{ userStore.user?.displayName }}</span>
      <v-btn @click="userStore.logout" class="ml-4" variant="outlined">
        Logout
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()
</script>
