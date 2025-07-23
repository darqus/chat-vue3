<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { useThemeStore } from '../stores/themeStore'
import ChatWindow from '../components/ChatWindow.vue'
import { Timestamp } from 'firebase/firestore'

const authStore = useAuthStore()
const chatStore = useChatStore()
const themeStore = useThemeStore()

const drawer = ref(false)

const isDark = computed(() => themeStore.isDark)

// Mock data для начального отображения - будет заменено на реальные данные
const mockChats = ref([
  {
    id: 'general',
    name: 'Общий чат',
    lastMessage: 'Добро пожаловать в чат!',
    lastMessageTime: new Date(),
    unreadCount: 0,
    type: 'group',
  },
])

const chats = computed(() =>
  chatStore.chats.length > 0 ? chatStore.chats : mockChats.value
)
const friends = computed(() => chatStore.friends)
const activeChat = computed(() => chatStore.activeChat)
const totalUnreadCount = computed(() => chatStore.totalUnreadCount)

function selectChat(chatId: string) {
  chatStore.activeChatId = chatId
  chatStore.setupMessageListener(chatId)
  drawer.value = false
}

function toggleTheme() {
  themeStore.toggleTheme()
}

function formatTime(date: Date | Timestamp): string {
  const actualDate = date instanceof Date ? date : (date as Timestamp).toDate()
  const now = new Date()
  const diff = now.getTime() - actualDate.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}д назад`
  if (hours > 0) return `${hours}ч назад`
  if (minutes > 0) return `${minutes}м назад`
  return 'Только что'
}

onMounted(() => {
  // Не вызываем authStore.initAuth() здесь, так как это уже делается в App.vue

  if (authStore.user?.id) {
    chatStore.setupChatsListener(authStore.user.id)
    chatStore.setupUsersListener()

    // Select general chat by default
    selectChat('general')
  }
})

// Watch for auth changes
watch(
  () => authStore.user,
  (user) => {
    if (user?.id) {
      chatStore.setupChatsListener(user.id)
      chatStore.setupUsersListener()

      // Select general chat by default if no chat is selected
      if (!chatStore.activeChatId) {
        selectChat('general')
      }
    }
  }
)
</script>

<template>
  <v-layout>
    <!-- Navigation Drawer -->
    <v-navigation-drawer v-model="drawer" temporary width="300">
      <v-list>
        <v-list-item
          :prepend-avatar="authStore.user?.photoURL || undefined"
          :title="authStore.user?.name"
          :subtitle="authStore.user?.email"
        >
          <template v-if="!authStore.user?.photoURL" #prepend>
            <v-avatar>
              <v-icon>mdi-account-circle</v-icon>
            </v-avatar>
          </template>

          <template #append>
            <v-menu>
              <template #activator="{ props }">
                <v-btn icon="mdi-dots-vertical" size="small" v-bind="props" />
              </template>
              <v-list>
                <v-list-item @click="toggleTheme">
                  <v-list-item-title>
                    <v-icon>{{
                      isDark
                        ? 'mdi-white-balance-sunny'
                        : 'mdi-moon-waning-crescent'
                    }}</v-icon>
                    {{ isDark ? 'Светлая тема' : 'Темная тема' }}
                  </v-list-item-title>
                </v-list-item>
                <v-list-item @click="authStore.logout">
                  <v-list-item-title>
                    <v-icon>mdi-logout</v-icon>
                    Выйти
                  </v-list-item-title>
                </v-list-item>
              </v-list>
            </v-menu>
          </template>
        </v-list-item>
      </v-list>

      <v-divider />

      <!-- Chat List -->
      <v-list>
        <v-list-subheader>Чаты</v-list-subheader>
        <v-list-item
          v-for="chat in chats"
          :key="chat.id"
          @click="selectChat(chat.id)"
          :active="chatStore.activeChatId === chat.id"
        >
          <template #prepend>
            <v-avatar>
              <v-icon>{{
                chat.type === 'group'
                  ? 'mdi-account-group'
                  : 'mdi-account-circle'
              }}</v-icon>
            </v-avatar>
          </template>

          <v-list-item-title>{{ chat.name }}</v-list-item-title>
          <v-list-item-subtitle>{{ chat.lastMessage }}</v-list-item-subtitle>

          <template #append>
            <div class="d-flex flex-column align-end">
              <small class="text-grey">{{
                formatTime(chat.lastMessageTime)
              }}</small>
              <v-chip
                v-if="chat.unreadCount > 0"
                color="primary"
                size="x-small"
                class="mt-1"
              >
                {{ chat.unreadCount }}
              </v-chip>
            </div>
          </template>
        </v-list-item>
      </v-list>

      <!-- Friends List -->
      <v-list v-if="friends.length > 0">
        <v-list-subheader>Друзья</v-list-subheader>
        <v-list-item v-for="friend in friends" :key="friend.id">
          <template #prepend>
            <v-badge
              :color="friend.isOnline ? 'green' : 'grey'"
              dot
              offset-x="2"
              offset-y="2"
            >
              <v-avatar>
                <v-img
                  v-if="friend.photoURL"
                  :src="friend.photoURL"
                  :alt="friend.name"
                />
                <v-icon v-else>mdi-account-circle</v-icon>
              </v-avatar>
            </v-badge>
          </template>

          <v-list-item-title>{{ friend.name }}</v-list-item-title>
          <v-list-item-subtitle>
            {{
              friend.isOnline
                ? 'Онлайн'
                : `Был(а) в сети ${formatTime(
                    friend.lastSeen?.toDate?.() || new Date()
                  )}`
            }}
          </v-list-item-subtitle>
        </v-list-item>
      </v-list>
    </v-navigation-drawer>

    <!-- App Bar -->
    <v-app-bar color="primary" prominent>
      <v-app-bar-nav-icon @click="drawer = !drawer" />

      <v-toolbar-title>
        {{ activeChat?.name || 'Chat App' }}
      </v-toolbar-title>

      <template #append>
        <v-badge
          v-if="totalUnreadCount > 0"
          :content="totalUnreadCount"
          color="error"
        >
          <v-btn icon="mdi-bell" />
        </v-badge>

        <v-btn @click="toggleTheme">
          <v-icon>{{
            isDark ? 'mdi-white-balance-sunny' : 'mdi-moon-waning-crescent'
          }}</v-icon>
        </v-btn>
      </template>
    </v-app-bar>

    <!-- Main Content -->
    <v-main>
      <ChatWindow v-if="chatStore.activeChatId" />
      <v-container v-else class="fill-height">
        <v-row align="center" justify="center">
          <v-col cols="12" class="text-center">
            <v-icon size="80" color="grey">mdi-chat-outline</v-icon>
            <h2 class="mt-4 text-grey">Выберите чат для начала общения</h2>
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-layout>
</template>
