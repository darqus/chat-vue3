<script setup lang="ts">
import Login from '@/components/LoginForm.vue';
import Chat from '@/components/ChatComponent.vue';
</script>

<template>
  <v-container>
    <v-row>
      <v-col cols="12" class="d-flex justify-end">
        <Login />
      </v-col>
    </v-row>
    <v-row>
      <v-col>
        <h1 class="text-h4 mb-4">Firebase Chat</h1>
        <Chat />
      </v-col>
    </v-row>
  </v-container>
</template>
