<script setup lang="ts">
import { ref } from 'vue'

const message = ref('')
const messages = ref<string[]>([])

const sendMessage = () => {
  if (message.value.trim()) {
    messages.value.push(message.value)
    message.value = ''
  }
}
</script>

<template>
  <v-container>
    <v-row>
      <v-col cols="12">
        <h1 class="text-h4">Chat App</h1>
      </v-col>
      <v-col cols="12">
        <v-card>
          <v-card-text>
            <div v-for="(msg, index) in messages" :key="index" class="mb-2">
              {{ msg }}
            </div>
          </v-card-text>
          <v-card-actions>
            <v-text-field
              v-model="message"
              label="Type your message"
              @keyup.enter="sendMessage"
              hide-details
            ></v-text-field>
            <v-btn
              @click="sendMessage"
              color="primary"
              class="ml-2"
            >
              Send
            </v-btn>
          </v-card-actions>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
