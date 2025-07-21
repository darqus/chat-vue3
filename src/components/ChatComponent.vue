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
  FieldValue,
  doc,
  setDoc,
  deleteDoc,
} from 'firebase/firestore'
import { useUserStore } from '@/stores/user'

const userStore = useUserStore()

interface ReplyInfo {
  id: string
  text: string
  displayName: string
}

interface Message {
  id: string
  text: string
  uid: string
  displayName: string
  createdAt: Timestamp | FieldValue | null
  replyTo?: ReplyInfo
}

const isLoading = ref(true)
const typingUsers = ref<string[]>([])
const messages = ref<Message[]>([])
const newMessage = ref('')
const replyingToMessage = ref<Message | null>(null)
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
      replyTo: doc.data().replyTo,
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
    const messagePayload: {
      text: string
      uid: string
      displayName: string
      createdAt: Timestamp | FieldValue | null
      replyTo?: ReplyInfo
    } = {
      text: newMessage.value,
      uid: userStore.user.uid,
      displayName: userStore.user.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
    }

    if (replyingToMessage.value) {
      messagePayload.replyTo = {
        id: replyingToMessage.value.id,
        text: replyingToMessage.value.text,
        displayName: replyingToMessage.value.displayName,
      }
    }

    await addDoc(messagesCollection, messagePayload)

    newMessage.value = ''
    cancelReply() // Сбрасываем состояние ответа
    // После отправки сообщения мы точно не печатаем
    if (typingTimeout) clearTimeout(typingTimeout)
    typingTimeout = null
    await updateTypingStatus(false)
  }
}

const formatTimestamp = (timestamp: Timestamp | FieldValue | null): string => {
  if (!timestamp || !('toDate' in timestamp)) return 'Sending...'
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

const startReply = (message: Message) => {
  replyingToMessage.value = message
}

const cancelReply = () => {
  replyingToMessage.value = null
}

const scrollToMessage = (messageId: string) => {
  const element = document.getElementById(`message-${messageId}`)
  if (element) {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Временно подсвечиваем сообщение, к которому перешли
    element.classList.add('message--highlighted')
    setTimeout(() => {
      element.classList.remove('message--highlighted')
    }, 1500)
  }
}
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
            :id="`message-${message.id}`"
            class="message"
            :class="{ 'my-message': message.uid === userStore.user.uid }"
          >
            <v-btn
              class="message__reply-btn"
              icon="mdi-reply"
              variant="text"
              size="x-small"
              @click="startReply(message)"
            ></v-btn>

            <!-- Блок с цитируемым сообщением -->
            <div
              v-if="message.replyTo"
              class="message__reply-to"
              @click="scrollToMessage(message.replyTo.id)"
            >
              <div class="font-weight-bold text-caption">
                {{ message.replyTo.displayName }}
              </div>
              <div class="text-caption text-truncate">
                {{ message.replyTo.text }}
              </div>
            </div>

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
  <v-footer
    v-if="userStore.user"
    app
    class="pa-0 d-flex flex-column"
    style="height: auto"
  >
    <!-- Панель контекста ответа -->
    <v-sheet
      v-if="replyingToMessage"
      color="grey-lighten-3"
      class="reply-context-bar pa-2 d-flex align-center"
      style="width: 100%"
    >
      <v-icon start>mdi-reply</v-icon>
      <div class="flex-grow-1 text-truncate">
        <div class="text-caption font-weight-bold">
          Ответ пользователю {{ replyingToMessage.displayName }}
        </div>
        <div class="text-caption">
          {{ replyingToMessage.text }}
        </div>
      </div>
      <v-btn
        icon="mdi-close"
        variant="text"
        size="small"
        @click="cancelReply"
      ></v-btn>
    </v-sheet>

    <!-- Форма ввода -->
    <v-form
      @submit.prevent="sendMessage"
      class="d-flex align-center pa-2"
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
  position: relative; /* Необходимо для позиционирования кнопки ответа */
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

.message__reply-btn {
  position: absolute;
  top: -8px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  z-index: 1;
}

.message:hover .message__reply-btn {
  opacity: 1;
}

.message.my-message .message__reply-btn {
  left: -8px;
}

.message:not(.my-message) .message__reply-btn {
  right: -8px;
}

.message__reply-to {
  border-left: 3px solid #007bff;
  padding-left: 8px;
  margin-bottom: 6px;
  opacity: 0.9;
  cursor: pointer;
}

.message--highlighted {
  transition: background-color 0.5s ease;
  background-color: #fff3cd !important; /* Светло-желтый цвет для подсветки */
}

.typing-indicator {
  height: 24px; /* Резервируем место, чтобы чат не "прыгал" */
  display: flex;
  align-items: center;
}
</style>
