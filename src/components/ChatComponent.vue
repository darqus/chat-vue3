<script setup lang="ts">
defineOptions({
  name: 'ChatComponent',
})

import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { db } from '@/firebase'
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
  doc,
  setDoc,
  deleteDoc,
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

const isLoading = ref(true)
const typingUsers = ref<string[]>([])
const messages = ref<Message[]>([])
const newMessage = ref('')
const messagesContainer = ref<HTMLElement | null>(null)
let typingTimeout: number | null = null

const messagesCollection = collection(db, 'messages')
const typingStatusCollection = collection(db, 'typingStatus')

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

// Отслеживаем появление/исчезновение индикатора и тоже прокручиваем, чтобы он был виден
watch(typingUsers, scrollToBottom)

let unsubscribe: () => void
let unsubscribeTyping: () => void

onMounted(() => {
  unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      uid: doc.data().uid,
      displayName: doc.data().displayName,
      createdAt: doc.data().createdAt,
    }))
    // Как только данные загружены, отключаем индикатор
    isLoading.value = false
  })

  // Слушатель для статуса "печатает"
  const typingQuery = query(typingStatusCollection)
  unsubscribeTyping = onSnapshot(typingQuery, (snapshot) => {
    const now = Date.now()
    const currentTypingUsers: string[] = []
    snapshot.forEach((doc) => {
      // Не показывать для себя
      if (doc.id === userStore.user?.uid) return

      const data = doc.data()
      // Статус актуален, если обновлялся в последние 10 секунд
      if (data.lastUpdated && now - data.lastUpdated.toMillis() < 10000) {
        currentTypingUsers.push(data.displayName || 'Кто-то')
      }
    })
    typingUsers.value = currentTypingUsers
  })
})

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe()
  }
  if (unsubscribeTyping) {
    unsubscribeTyping()
  }
  // Убираем свой статус "печатает" при выходе
  if (userStore.user) {
    updateTypingStatus(false)
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
    // После отправки сообщения мы точно не печатаем
    if (typingTimeout) clearTimeout(typingTimeout)
    typingTimeout = null
    await updateTypingStatus(false)
  }
}

const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return 'Sending...'
  return new Date(timestamp.toDate()).toLocaleTimeString()
}

const updateTypingStatus = async (isTyping: boolean) => {
  if (!userStore.user) return
  const typingDocRef = doc(db, 'typingStatus', userStore.user.uid)
  if (isTyping) {
    await setDoc(typingDocRef, {
      displayName: userStore.user.displayName,
      lastUpdated: serverTimestamp(),
    })
  } else {
    await deleteDoc(typingDocRef)
  }
}

const handleInput = () => {
  if (!userStore.user) return
  // Если таймер уже есть, сбрасываем его. Если нет - значит, только начали печатать.
  if (typingTimeout) {
    clearTimeout(typingTimeout)
  } else {
    updateTypingStatus(true)
  }

  // Устанавливаем таймер, который через 3 секунды бездействия уберет статус "печатает"
  typingTimeout = window.setTimeout(() => {
    updateTypingStatus(false)
    typingTimeout = null
  }, 3000)
}

const typingIndicatorText = computed(() => {
  const users = typingUsers.value
  if (users.length === 0) return ''
  if (users.length === 1) return `${users[0]} печатает...`
  if (users.length === 2) return `${users[0]} и ${users[1]} печатают...`
  return 'Несколько человек печатают...'
})
</script>

<template>
  <!-- v-main будет занимать всё доступное пространство между другими app-компонентами (например, v-footer) -->
  <v-main class="fill-height">
    <div v-if="userStore.user" class="fill-height">
      <!-- 1. Показываем индикатор, пока isLoading === true -->
      <div
        v-if="isLoading"
        class="fill-height d-flex justify-center align-center"
      >
        <v-progress-circular
          indeterminate
          color="primary"
          size="64"
        ></v-progress-circular>
      </div>

      <!-- 2. Показываем список сообщений, когда загрузка завершена -->
      <div v-else ref="messagesContainer" class="messages-list-wrapper">
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
          <!-- Индикатор "печатает..." -->
          <div v-if="typingIndicatorText" class="typing-indicator pl-4">
            <span class="text-caption text-disabled">{{
              typingIndicatorText
            }}</span>
          </div>
        </v-container>
      </div>
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
        @input="handleInput"
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

.typing-indicator {
  height: 24px; /* Резервируем место, чтобы чат не "прыгал" */
  display: flex;
  align-items: center;
}
</style>
