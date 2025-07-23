<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useAuthStore } from '../stores/authStore'
import { useUserStore } from '../stores/user'

const chatStore = useChatStore()
const authStore = useAuthStore()
const userStore = useUserStore()

const newMessage = ref('')
const sending = ref(false)
const messagesContainer = ref<HTMLElement>()
const typingTimeout = ref<number | null>(null)

// Используем сообщения из userStore для совместимости с текущим кодом
const messages = computed(() => userStore.messages)
const typingUsers = computed(() => chatStore.typingUsers)
const activeChat = computed(() => chatStore.activeChat)
const currentUserId = computed(() => authStore.user?.id || '')

// Auto-scroll to bottom when new messages arrive
watch(
  messages,
  () => {
    nextTick(() => {
      scrollToBottom()
    })
  },
  { deep: true }
)

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

async function sendMessage() {
  if (!newMessage.value.trim() || sending.value) return

  // Проверяем аутентификацию более тщательно
  if (!authStore.user || !authStore.isAuthenticated) {
    console.error('User not authenticated')
    return
  }

  sending.value = true
  try {
    if (chatStore.activeChatId === 'general' && userStore.sendMessage) {
      // Используем старый метод для общего чата
      await userStore.sendMessage(newMessage.value.trim())
    } else {
      // Используем новый метод для других чатов
      await chatStore.sendMessage(
        newMessage.value.trim(),
        authStore.user.id,
        authStore.user.name
      )
    }
    newMessage.value = ''
  } catch (error) {
    console.error('Error sending message:', error)
  } finally {
    sending.value = false
  }
}

function handleTyping() {
  if (!authStore.user || !chatStore.activeChatId) return

  // Clear existing timeout
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value)
  }

  chatStore.isTyping = true

  // Stop typing after 1 second of inactivity
  typingTimeout.value = window.setTimeout(() => {
    chatStore.isTyping = false
  }, 1000)
}

function formatMessageTime(timestamp: unknown): string {
  if (!timestamp) return ''

  let date: Date
  if (
    timestamp &&
    typeof timestamp === 'object' &&
    'toDate' in timestamp &&
    typeof timestamp.toDate === 'function'
  ) {
    date = timestamp.toDate()
  } else if (timestamp instanceof Date) {
    date = timestamp
  } else {
    return ''
  }

  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)

  if (hours > 24) {
    return date.toLocaleDateString()
  } else if (hours > 0) {
    return `${hours}ч назад`
  } else if (minutes > 0) {
    return `${minutes}м назад`
  } else {
    return 'Только что'
  }
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'sending':
      return 'mdi-clock-outline'
    case 'sent':
      return 'mdi-check'
    case 'read':
      return 'mdi-check-all'
    default:
      return 'mdi-clock-outline'
  }
}

function getOnlineStatus(): string {
  if (!activeChat.value) return ''
  return 'Онлайн' // Placeholder
}

function getTypingText(): string {
  const count = typingUsers.value.size
  if (count === 1) return 'Кто-то печатает...'
  if (count === 2) return '2 человека печатают...'
  return `${count} человек печатают...`
}

function parseMessageText(text: string): string {
  if (!text) return ''

  // Regex для поиска URL-адресов
  const urlRegex =
    /((?:https?:\/\/)[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&//=]*))/g
  // Regex для проверки, является ли URL изображением
  const imageRegex = /\.(jpeg|jpg|gif|png|webp|svg)(\?.*)?$/i

  // Функция для экранирования HTML для предотвращения XSS-атак
  const escapeHtml = (unsafe: string): string => {
    return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }

  // Разделяем текст по URL, чтобы обработать текстовые и ссылочные части отдельно
  return text
    .split(urlRegex)
    .map((part, index) => {
      // URL-адреса будут иметь нечетные индексы
      if (index % 2 === 1) {
        if (imageRegex.test(part)) {
          return `<a href="${escapeHtml(
            part
          )}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(
            part
          )}" alt="Предпросмотр изображения" class="message-image-preview" loading="lazy" /></a>`
        }
        return `<a href="${escapeHtml(
          part
        )}" target="_blank" rel="noopener noreferrer">${escapeHtml(part)}</a>`
      } else {
        // Текстовые части экранируем и заменяем переносы строк на <br>
        return escapeHtml(part).replace(/\n/g, '<br />')
      }
    })
    .join('')
}

onMounted(() => {
  scrollToBottom()
})
</script>

<template>
  <v-container fluid class="pa-0 fill-height">
    <v-card class="fill-height d-flex flex-column">
      <!-- Chat Header -->
      <v-card-title class="bg-info">
        <v-row align="center" no-gutters>
          <v-col>
            <div class="d-flex align-center text-white">
              <v-avatar class="text-white mr-3" size="40">
                <v-icon>mdi-account-circle</v-icon>
              </v-avatar>
              <div>
                <div class="font-weight-medium">
                  {{ activeChat?.name || 'Чат' }}
                </div>
                <div class="text-caption">
                  {{ getOnlineStatus() }}
                </div>
              </div>
            </div>
          </v-col>
        </v-row>
      </v-card-title>

      <!-- Messages Area -->
      <v-card-text
        ref="messagesContainer"
        class="flex-grow-1 overflow-y-auto messages-container"
        style="max-height: calc(100vh - 200px)"
      >
        <div v-if="messages.length === 0" class="text-center text-grey pa-8">
          <v-icon size="60">mdi-chat-outline</v-icon>
          <p class="mt-2">Пока нет сообщений. Начните разговор!</p>
        </div>

        <div
          v-for="message in messages"
          :key="message.id"
          class="message-wrapper"
          :class="[
            message.uid === currentUserId ? 'message-sent' : 'message-received',
          ]"
        >
          <div class="message-content">
            <!-- Message Bubble -->
            <div class="message-bubble">
              <!-- Sender name for received messages -->
              <div v-if="message.uid !== currentUserId" class="sender-name">
                {{ message.displayName }}
              </div>

              <!-- Message content -->
              <div
                class="message-text"
                v-html="parseMessageText(message.text)"
              ></div>

              <!-- Message info -->
              <div class="message-info">
                <small class="message-time">
                  {{ formatMessageTime(message.createdAt) }}
                </small>

                <!-- Status icons for sent messages -->
                <div
                  v-if="message.uid === currentUserId"
                  class="message-status"
                >
                  <v-icon size="12">
                    {{ getStatusIcon('sent') }}
                  </v-icon>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Typing indicator -->
        <div v-if="typingUsers.size > 0" class="typing-indicator pa-2">
          <v-chip size="small" color="grey-lighten-2">
            <v-icon size="16" class="mr-1">mdi-dots-horizontal</v-icon>
            {{ getTypingText() }}
          </v-chip>
        </div>
      </v-card-text>

      <!-- Message Input -->
      <v-divider />
      <v-card-actions class="pa-4">
        <v-form @submit.prevent="sendMessage" class="w-100">
          <v-row no-gutters align="center">
            <!-- Message Input Field -->
            <v-col>
              <v-text-field
                v-model="newMessage"
                placeholder="Введите сообщение..."
                variant="outlined"
                density="compact"
                hide-details
                @input="handleTyping"
                @keydown.enter.prevent="sendMessage"
                :loading="sending"
              />
            </v-col>

            <!-- Send Button -->
            <v-col cols="auto">
              <v-btn
                icon="mdi-send"
                color="primary"
                :disabled="!newMessage.trim() || sending"
                @click="sendMessage"
                class="ml-2"
              />
            </v-col>
          </v-row>
        </v-form>
      </v-card-actions>
    </v-card>
  </v-container>
</template>
