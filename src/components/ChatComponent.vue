<script setup lang="ts">
defineOptions({
  name: 'ChatComponent',
})

import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { db } from '@/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
} from 'firebase/firestore'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

interface Message {
  id: string
  text: string
  uid: string
  displayName: string
  createdAt: Timestamp | null
}

const messages = ref<Message[]>([])
const newMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const messagesCollection = collection(db, 'messages')
const q = query(messagesCollection, orderBy('createdAt', 'asc'))

const scrollToBottom = async () => {
  // nextTick гарантирует, что DOM обновился перед попыткой прокрутки
  await nextTick()
  const container = messagesContainer.value
  if (container) {
    container.scrollTop = container.scrollHeight
  }
}

// Отслеживаем добавление новых сообщений и прокручиваем вниз
watch(messages, scrollToBottom, { deep: true })

let unsubscribe: () => void

onMounted(() => {
  unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      uid: doc.data().uid,
      displayName: doc.data().displayName,
      createdAt: doc.data().createdAt,
    }))
  })
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
})

const sendMessage = async () => {
  if (newMessage.value.trim() && userStore.user) {
    await addDoc(messagesCollection, {
      text: newMessage.value,
      uid: userStore.user.uid,
      displayName: userStore.user.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
    })
    newMessage.value = ''
  }
}

const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return 'Sending...'
  return new Date(timestamp.toDate()).toLocaleTimeString()
}
</script>

<template>
  <!-- v-main будет занимать всё доступное пространство между другими app-компонентами (например, v-footer) -->
  <v-main>
    <div
      v-if="userStore.user"
      ref="messagesContainer"
      class="messages-list-wrapper"
    >
      <v-container>
        <div
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="{ 'my-message': message.uid === userStore.user.uid }"
        >
          <div class="message-content">
            <div class="font-weight-bold">{{ message.displayName }}</div>
            <div>{{ message.text }}</div>
            <div class="text-caption text-grey">
              {{ formatTimestamp(message.createdAt) }}
            </div>
          </div>
        </div>
      </v-container>
    </div>
    <div v-else class="fill-height d-flex justify-center align-center">
      <v-alert type="info" border="start" prominent>
        Please log in to see the chat.
      </v-alert>
    </div>
  </v-main>

  <!-- v-footer с атрибутом 'app' закрепляется внизу экрана -->
  <v-footer v-if="userStore.user" app class="pa-2">
    <v-form
      @submit.prevent="sendMessage"
      class="d-flex align-center"
      style="width: 100%"
    >
      <v-text-field
        v-model="newMessage"
        label="Type a message..."
        variant="solo"
        hide-details
        @keydown.enter.prevent="sendMessage"
      ></v-text-field>
      <v-btn
        type="submit"
        class="ml-2"
        icon="mdi-send"
        color="primary"
        :disabled="!newMessage.trim()"
      ></v-btn>
    </v-form>
  </v-footer>
</template>

<style scoped>
.messages-list-wrapper {
  height: 100%; /* Занимает всю высоту v-main */
  overflow-y: auto;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  padding: 8px 12px;
  border-radius: 12px;
  background-color: #f1f1f1;
  align-self: flex-start;
  word-wrap: break-word;
  margin-bottom: 12px; /* Используем margin для отступов между сообщениями */
}

.message.my-message {
  background-color: #d1eaff;
  align-self: flex-end;
}

.message-content {
  display: flex;
  flex-direction: column;
}

.my-message .message-content {
  align-items: flex-end;
}
</style>
