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
  updateDoc,
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
  isEdited?: boolean
  reactions?: { [emoji: string]: { [uid: string]: string } } // emoji -> { uid: displayName }
}

const isLoading = ref(true)
const typingUsers = ref<string[]>([])
const messages = ref<Message[]>([])
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
  // Более эффективный слушатель, который обрабатывает изменения по отдельности
  unsubscribe = onSnapshot(q, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const docData = change.doc.data()
      const messageId = change.doc.id

      if (change.type === 'added') {
        if (!messages.value.some((m) => m.id === messageId)) {
          messages.value.push({ id: messageId, ...docData } as Message)

          // Воспроизводим звук, если сообщение не от нас и вкладка неактивна
          if (
            !isLoading.value &&
            docData.uid !== userStore.user?.uid &&
            document.hidden
          ) {
            playSoundNotification()
          }
        }
      }
      if (change.type === 'modified') {
        const index = messages.value.findIndex((m) => m.id === messageId)
        if (index !== -1) {
          // Обновляем только измененное сообщение, сохраняя объект
          messages.value[index] = { ...messages.value[index], ...docData }
        }
      }
      if (change.type === 'removed') {
        messages.value = messages.value.filter((m) => m.id !== messageId)
      }
    })

    // Отключаем индикатор загрузки после обработки первого снимка данных
    if (isLoading.value) {
      isLoading.value = false
    }
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

/**
 * Воспроизводит звук уведомления.
 * Убедитесь, что у вас есть файл /public/notification.mp3
 */
const playSoundNotification = () => {
  // Путь к файлу относительно корневой папки public
  const audio = new Audio('/notification.mp3')
  audio.play().catch((error) => {
    // Современные браузеры блокируют автовоспроизведение звука до первого
    // взаимодействия пользователя со страницей (например, клика).
    console.warn(
      'Воспроизведение звука заблокировано браузером. Требуется взаимодействие с пользователем.',
      error
    )
  })
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
  const messageRef = doc(db, 'messages', editingMessage.value.id)
  await updateDoc(messageRef, {
    text: editedText.value,
    isEdited: true,
  })
  cancelEditing()
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
  const messageRef = doc(db, 'messages', messageToDelete.value.id)
  await deleteDoc(messageRef)
  cancelDelete()
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
            class="message"
            :class="{ 'my-message': message.uid === userStore.user.uid }"
          >
            <!-- Меню действий для своих сообщений -->
            <v-menu
              v-if="message.uid === userStore.user?.uid"
              location="bottom end"
            >
              <template #activator="{ props }">
                <v-btn
                  class="message__menu-btn"
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

            <!-- Кнопка добавления реакции -->
            <v-menu location="top" close-on-content-click>
              <template #activator="{ props }">
                <v-btn
                  class="message__add-reaction-btn"
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

            <v-btn
              class="message__reply-btn"
              icon="mdi-reply"
              variant="text"
              size="x-small"
              @click="startReply(message)"
            ></v-btn>

            <!-- UI для редактирования сообщения -->
            <div
              v-if="editingMessage?.id === message.id"
              class="message-content"
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
            <template v-else>
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
                <div
                  class="message-text-content"
                  v-html="parseMessageText(message.text)"
                ></div>
                <div class="text-caption text-grey">
                  {{ formatTimestamp(message.createdAt) }}
                  <span v-if="message.isEdited" class="ml-1">(изменено)</span>
                </div>
              </div>

              <!-- Отображение реакций -->
              <div
                v-if="
                  message.reactions && Object.keys(message.reactions).length > 0
                "
                class="reactions-container"
              >
                <v-tooltip
                  v-for="(reactors, emoji) in message.reactions"
                  :key="emoji"
                  location="top"
                >
                  <template #activator="{ props }">
                    <v-chip
                      v-bind="props"
                      class="mr-1 mb-1"
                      size="small"
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
            </template>
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

.message__menu-btn {
  position: absolute;
  top: 0px;
  right: 4px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  z-index: 2; /* Выше чем reply-btn */
}

.message:hover .message__menu-btn {
  opacity: 1;
}

.message__add-reaction-btn {
  position: absolute;
  bottom: -12px;
  opacity: 0;
  transition: opacity 0.2s ease-in-out;
  z-index: 1;
  background-color: white;
  border-radius: 50%;
}

.message:hover .message__add-reaction-btn {
  opacity: 1;
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
.message.my-message .message__add-reaction-btn {
  left: 20px;
}

.message:not(.my-message) .message__reply-btn {
  right: -8px;
}
.message:not(.my-message) .message__add-reaction-btn {
  right: 20px;
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

.reactions-container {
  margin-top: 8px;
  align-self: flex-start; /* Чтобы контейнер не растягивался на всю ширину */
}

/* :deep() используется для стилизации контента, сгенерированного через v-html */
:deep(.message-text-content a) {
  color: #1e88e5;
  text-decoration: underline;
}

:deep(.message-image-preview) {
  max-width: 100%;
  max-height: 300px;
  border-radius: 8px;
  margin-top: 8px;
  display: block;
  object-fit: cover;
}
</style>
