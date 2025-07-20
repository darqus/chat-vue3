<template>
  <v-app>
    <v-app-bar app color="primary" dark>
      <v-toolbar-title>Firebase Chat</v-toolbar-title>
      <v-spacer></v-spacer>
      <div v-if="userStore.user">
        <span class="mr-4">{{ userStore.user.displayName }}</span>
        <v-btn @click="logout" icon="mdi-logout"></v-btn>
      </div>
    </v-app-bar>

    <v-main>
      <Login v-if="!userStore.user" />
      <Chat v-else />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useUserStore } from '@/stores/user';
import { auth } from '@/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import Login from './components/Login.vue';
import Chat from './components/Chat.vue';

const userStore = useUserStore();

onMounted(() => {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      userStore.setUser({
        uid: user.uid,
        displayName: user.displayName,
        email: user.email,
      });
    } else {
      userStore.clearUser();
    }
  });
});

const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out: ", error);
  }
};
</script>
