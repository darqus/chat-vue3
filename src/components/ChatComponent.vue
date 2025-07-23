<script setup lang="ts">
defineOptions({
  name: 'ChatComponent',
})

import { ref, onMounted, onUnmounted, watch, nextTick, computed } from 'vue'
import { useUserStore } from '@/stores/user'
import { db } from '@/firebase'
import { notify } from '@/utils/notification'
import {
  addDoc,
  serverTimestamp,
  Timestamp,
  FieldValue,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  onSnapshot,
} from 'firebase/firestore'

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
  isEdited?: boolean
  reactions?: { [emoji: string]: { [uid: string]: string } } // emoji -> { uid: displayName }
}

const isLoading = ref(true)
const typingUsers = ref<string[]>([])
const messages = computed(() => userStore.messages)
const newMessage = ref('')
const replyingToMessage = ref<Message | null>(null)
const editingMessage = ref<Message | null>(null)
const editedText = ref<string>('')
const messageToDelete = ref<Message | null>(null)
const showDeleteConfirmDialog = ref(false)
const messagesContainer = ref<HTMLElement | null>(null)
let typingTimeout: number | null = null

const messagesCollection = collection(db, 'messages')
const typingStatusCollection = collection(db, 'typingStatus')

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

let unsubscribeTyping: () => void

onMounted(() => {
  isLoading.value = false

  // Слушатель только для статуса "печатает"
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

    try {
      await addDoc(messagesCollection, messagePayload)
      notify.success('Сообщение отправлено')

      newMessage.value = ''
      cancelReply() // Сбрасываем состояние ответа
      // После отправки сообщения мы точно не печатаем
      if (typingTimeout) clearTimeout(typingTimeout)
      typingTimeout = null
      await updateTypingStatus(false)
    } catch (error) {
      console.error('Error sending message:', error)
      notify.error('Ошибка отправки сообщения')
    }
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

const parseMessageText = (text: string): string => {
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

const toggleReaction = async (message: Message, emoji: string) => {
  if (!userStore.user) return

  const messageRef = doc(db, 'messages', message.id)
  const currentUserUid = userStore.user.uid
  const currentUserDisplayName = userStore.user.displayName || 'Аноним'
  const reactions = { ...(message.reactions || {}) }

  // Проверяем, есть ли уже реакция от этого пользователя
  if (reactions[emoji]?.[currentUserUid]) {
    // Удаляем реакцию
    delete reactions[emoji][currentUserUid]
    if (Object.keys(reactions[emoji]).length === 0) {
      delete reactions[emoji]
    }
  } else {
    // Добавляем реакцию
    if (!reactions[emoji]) {
      reactions[emoji] = {}
    }
    reactions[emoji][currentUserUid] = currentUserDisplayName
  }
  await updateDoc(messageRef, { reactions })
}

const startEditing = (message: Message) => {
  editingMessage.value = message
  editedText.value = message.text
}

const cancelEditing = () => {
  editingMessage.value = null
  editedText.value = ''
}

const saveEdit = async () => {
  if (!editingMessage.value || !editedText.value.trim()) {
    cancelEditing()
    return
  }
  try {
    const messageRef = doc(db, 'messages', editingMessage.value.id)
    await updateDoc(messageRef, {
      text: editedText.value,
      isEdited: true,
    })
    notify.success('Сообщение обновлено')
    cancelEditing()
  } catch (error) {
    console.error('Error updating message:', error)
    notify.error('Ошибка обновления сообщения')
  }
}

const promptDelete = (message: Message) => {
  messageToDelete.value = message
  showDeleteConfirmDialog.value = true
}

const cancelDelete = () => {
  messageToDelete.value = null
  showDeleteConfirmDialog.value = false
}

const confirmDelete = async () => {
  if (!messageToDelete.value) return
  try {
    const messageRef = doc(db, 'messages', messageToDelete.value.id)
    await deleteDoc(messageRef)
    notify.info('Сообщение удалено')
    cancelDelete()
  } catch (error) {
    console.error('Error deleting message:', error)
    notify.error('Ошибка удаления сообщения')
  }
}

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
            class="message-wrapper"
            :class="{
              'message-sent': message.uid === userStore.user.uid,
              'message-received': message.uid !== userStore.user.uid,
            }"
          >
            <div class="message-content">
              <!-- Меню действий для своих сообщений -->
              <div
                v-if="message.uid === userStore.user?.uid"
                class="message-actions actions-sent"
              >
                <v-menu location="bottom end">
                  <template #activator="{ props }">
                    <v-btn
                      icon="mdi-dots-vertical"
                      variant="text"
                      size="x-small"
                      v-bind="props"
                    ></v-btn>
                  </template>
                  <v-list density="compact">
                    <v-list-item @click="startEditing(message)">
                      <v-list-item-title>Редактировать</v-list-item-title>
                    </v-list-item>
                    <v-list-item @click="promptDelete(message)">
                      <v-list-item-title>Удалить</v-list-item-title>
                    </v-list-item>
                  </v-list>
                </v-menu>
              </div>

              <!-- Кнопки действий для всех сообщений -->
              <div
                class="message-actions"
                :class="{
                  'actions-sent': message.uid === userStore.user.uid,
                  'actions-received': message.uid !== userStore.user.uid,
                }"
              >
                <!-- Кнопка добавления реакции -->
                <v-menu location="top" close-on-content-click>
                  <template #activator="{ props }">
                    <v-btn
                      icon="mdi-emoticon-happy-outline"
                      variant="text"
                      size="x-small"
                      v-bind="props"
                    ></v-btn>
                  </template>
                  <v-sheet class="d-flex pa-1 rounded">
                    <v-btn
                      v-for="emoji in ['👍', '❤️', '😂', '😮', '😢', '🙏']"
                      :key="emoji"
                      icon
                      variant="text"
                      size="small"
                      @click="toggleReaction(message, emoji)"
                      >{{ emoji }}</v-btn
                    >
                  </v-sheet>
                </v-menu>

                <!-- Кнопка ответа -->
                <v-btn
                  icon="mdi-reply"
                  variant="text"
                  size="x-small"
                  @click="startReply(message)"
                ></v-btn>
              </div>

              <!-- Блок с цитируемым сообщением -->
              <div
                v-if="message.replyTo"
                class="message-reply"
                @click="scrollToMessage(message.replyTo.id)"
              >
                <div class="reply-author">
                  {{ message.replyTo.displayName }}
                </div>
                <div class="reply-text">
                  {{ message.replyTo.text }}
                </div>
              </div>

              <!-- UI для редактирования сообщения -->
              <div
                v-if="editingMessage?.id === message.id"
                class="message-bubble"
              >
                <v-textarea
                  v-model="editedText"
                  autofocus
                  auto-grow
                  rows="1"
                  hide-details
                  variant="underlined"
                  @keydown.enter.prevent="saveEdit"
                  @keydown.esc.prevent="cancelEditing"
                ></v-textarea>
                <div class="mt-2 text-caption">
                  Нажмите Esc для отмены, Enter для сохранения
                </div>
              </div>

              <!-- Обычное отображение сообщения -->
              <div v-else class="message-bubble">
                <!-- Имя отправителя (только для чужих сообщений) -->
                <div
                  v-if="message.uid !== userStore.user.uid"
                  class="sender-name"
                >
                  {{ message.displayName }}
                </div>

                <!-- Текст сообщения -->
                <div
                  class="message-text"
                  v-html="parseMessageText(message.text)"
                ></div>

                <!-- Информация о сообщении -->
                <div class="message-info">
                  <span class="message-time">
                    {{ formatTimestamp(message.createdAt) }}
                  </span>
                  <span v-if="message.isEdited" class="text-caption">
                    (изменено)
                  </span>
                  <!-- Статус для своих сообщений -->
                  <div
                    v-if="message.uid === userStore.user.uid"
                    class="message-status"
                  >
                    <v-icon size="12">mdi-check</v-icon>
                  </div>
                </div>
              </div>

              <!-- Отображение реакций -->
              <div
                v-if="
                  message.reactions && Object.keys(message.reactions).length > 0
                "
                class="message-reactions"
              >
                <v-tooltip
                  v-for="(reactors, emoji) in message.reactions"
                  :key="emoji"
                  location="top"
                >
                  <template #activator="{ props }">
                    <v-chip
                      v-bind="props"
                      class="reaction-chip"
                      size="small"
                      :class="{
                        'user-reacted': Object.keys(reactors).includes(
                          userStore.user?.uid
                        ),
                      }"
                      :variant="
                        Object.keys(reactors).includes(userStore.user?.uid)
                          ? 'tonal'
                          : 'outlined'
                      "
                      @click="toggleReaction(message, String(emoji))"
                      >{{ emoji }} {{ Object.keys(reactors).length }}</v-chip
                    >
                  </template>
                  <div>
                    <div v-for="name in Object.values(reactors)" :key="name">
                      {{ name }}
                    </div>
                  </div>
                </v-tooltip>
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

    <!-- Диалог подтверждения удаления -->
    <v-dialog v-model="showDeleteConfirmDialog" max-width="400" persistent>
      <v-card>
        <v-card-title class="text-h6">Подтвердите удаление</v-card-title>
        <v-card-text>
          Вы уверены, что хотите удалить это сообщение? Это действие необратимо.
          <v-sheet color="grey-lighten-4" class="pa-2 mt-2 rounded">
            <div class="text-truncate">{{ messageToDelete?.text }}</div>
          </v-sheet>
        </v-card-text>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn text @click="cancelDelete">Отмена</v-btn>
          <v-btn color="red-darken-1" variant="tonal" @click="confirmDelete"
            >Удалить</v-btn
          >
        </v-card-actions>
      </v-card>
    </v-dialog>
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
