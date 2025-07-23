import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  orderBy,
  serverTimestamp,
  Timestamp,
  getDocs,
} from 'firebase/firestore'
import { db } from '../firebase'
import { notify } from '@/utils/notification'

interface ChatMessage {
  id: string
  text: string
  senderId: string
  senderName: string
  chatId: string
  timestamp: Timestamp
  status: 'sending' | 'sent' | 'read'
  read: boolean
  type: 'text' | 'emoji' | 'file'
  replyTo?: {
    id: string
    text: string
    displayName: string
  }
  isEdited?: boolean
  reactions?: { [emoji: string]: { [uid: string]: string } }
}

interface Chat {
  id: string
  name: string
  participants: string[]
  lastMessage: string
  lastMessageTime: Timestamp
  unreadCount: number
  type: 'direct' | 'group'
}

export interface ChatUser {
  id: string
  name: string
  email: string
  photoURL: string | null
  isOnline: boolean
  lastSeen: Timestamp
}

export type { ChatMessage, Chat }

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const chats = ref<Chat[]>([])
  const users = ref<ChatUser[]>([])

  // Load saved active chat from localStorage
  const savedChatId = localStorage.getItem('chat-app-active-chat-id')
  const activeChatId = ref<string | null>(savedChatId || null)

  const typingUsers = ref<Set<string>>(new Set())
  const isTyping = ref(false)

  // Save active chat to localStorage whenever it changes
  function setActiveChatId(chatId: string | null) {
    activeChatId.value = chatId
    if (chatId) {
      localStorage.setItem('chat-app-active-chat-id', chatId)
    } else {
      localStorage.removeItem('chat-app-active-chat-id')
    }
  }

  // Setup real-time message listener
  function setupMessageListener(chatId: string) {
    setActiveChatId(chatId)
    messages.value = [] // Clear previous messages

    // Для общего чата используем существующую структуру без chatId
    if (chatId === 'general') {
      const q = query(collection(db, 'messages'), orderBy('createdAt', 'asc'))

      return onSnapshot(q, (snapshot) => {
        messages.value = snapshot.docs.map((doc) => {
          const data = doc.data()
          return {
            id: doc.id,
            text: data.text || '',
            senderId: data.uid || '',
            senderName: data.displayName || 'Anonymous',
            chatId: 'general',
            timestamp: data.createdAt,
            status: 'sent',
            read: true,
            type: 'text',
            replyTo: data.replyTo,
            isEdited: data.isEdited,
            reactions: data.reactions,
          } as ChatMessage
        })
      })
    } else {
      // Для других чатов используем новую структуру с chatId
      const q = query(
        collection(db, 'messages'),
        where('chatId', '==', chatId),
        orderBy('timestamp', 'asc')
      )

      return onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
          const messageData = {
            id: change.doc.id,
            ...change.doc.data(),
          } as ChatMessage

          if (change.type === 'added') {
            messages.value.push(messageData)
          } else if (change.type === 'modified') {
            const index = messages.value.findIndex(
              (m) => m.id === messageData.id
            )
            if (index !== -1) {
              messages.value[index] = messageData
            }
          }
        })
      })
    }
  }

  // Setup chats listener
  function setupChatsListener(userId: string) {
    if (!userId) {
      console.warn('setupChatsListener called with undefined userId')
      return
    }

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId)
    )

    return onSnapshot(q, (snapshot) => {
      chats.value = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Chat[]
    })
  }

  // Setup users listener
  function setupUsersListener() {
    const q = query(collection(db, 'users'))

    return onSnapshot(q, (snapshot) => {
      users.value = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as ChatUser[]
    })
  }

  // Send message
  async function sendMessage(
    text: string,
    senderId: string,
    senderName: string,
    type: 'text' | 'emoji' = 'text'
  ) {
    if (!activeChatId.value) return

    try {
      if (activeChatId.value === 'general') {
        // Для общего чата используем существующую структуру
        const message = {
          text,
          uid: senderId,
          displayName: senderName,
          createdAt: serverTimestamp(),
        }
        await addDoc(collection(db, 'messages'), message)
      } else {
        // Для других чатов используем новую структуру
        const message: Omit<ChatMessage, 'id'> = {
          text,
          senderId,
          senderName,
          chatId: activeChatId.value,
          timestamp: serverTimestamp() as Timestamp,
          status: 'sending',
          read: false,
          type,
        }
        await addDoc(collection(db, 'messages'), message)

        // Update chat's last message
        await updateDoc(doc(db, 'chats', activeChatId.value), {
          lastMessage: text,
          lastMessageTime: serverTimestamp(),
        })
      }

      notify.success('Сообщение отправлено')
    } catch (error) {
      console.error('Error sending message:', error)
      notify.error('Ошибка отправки сообщения')
    }
  }

  // Mark messages as read
  async function markMessagesAsRead(chatId: string, userId: string) {
    const unreadMessages = messages.value.filter(
      (m) => m.chatId === chatId && m.senderId !== userId && !m.read
    )

    for (const message of unreadMessages) {
      await updateDoc(doc(db, 'messages', message.id), {
        read: true,
        status: 'read',
      })
    }
  }

  // Create or find direct chat
  async function createDirectChat(
    userId: string,
    otherUserId: string,
    otherUserName: string
  ) {
    // Check if chat already exists
    const chatsQuery = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', userId)
    )

    const snapshot = await getDocs(chatsQuery)
    const existingChat = snapshot.docs.find((doc) => {
      const data = doc.data()
      return (
        data.type === 'direct' &&
        data.participants.length === 2 &&
        data.participants.includes(otherUserId)
      )
    })

    if (existingChat) {
      return existingChat.id
    }

    // Create new chat
    const newChat = {
      name: otherUserName,
      participants: [userId, otherUserId],
      lastMessage: '',
      lastMessageTime: serverTimestamp(),
      unreadCount: 0,
      type: 'direct',
    }

    const chatDoc = await addDoc(collection(db, 'chats'), newChat)
    return chatDoc.id
  }

  // Add typing indicator
  function addTypingUser(userId: string) {
    typingUsers.value.add(userId)
    setTimeout(() => {
      typingUsers.value.delete(userId)
    }, 3000)
  }

  // Remove typing indicator
  function removeTypingUser(userId: string) {
    typingUsers.value.delete(userId)
  }

  // Get user by ID
  function getUserById(userId: string): ChatUser | undefined {
    return users.value.find((user) => user.id === userId)
  }

  // Count unread messages
  const unreadCount = computed(() => {
    if (!activeChatId.value) return 0
    return messages.value.filter(
      (m) => m.chatId === activeChatId.value && !m.read
    ).length
  })

  // Get total unread count across all chats
  const totalUnreadCount = computed(() => {
    return chats.value.reduce((total, chat) => total + chat.unreadCount, 0)
  })

  // Get active chat
  const activeChat = computed(() => {
    return chats.value.find((chat) => chat.id === activeChatId.value)
  })

  // Get messages for active chat
  const activeChatMessages = computed(() => {
    return messages.value.filter((m) => m.chatId === activeChatId.value)
  })

  // Get friends (users excluding current user)
  const friends = computed(() => {
    return users.value
  })

  // Get saved active chat ID
  function getSavedActiveChatId(): string | null {
    return localStorage.getItem('chat-app-active-chat-id')
  }

  // Clear saved active chat
  function clearSavedActiveChat() {
    localStorage.removeItem('chat-app-active-chat-id')
    setActiveChatId(null)
  }

  // Initialize store with saved state
  function initializeStore() {
    const savedChatId = getSavedActiveChatId()
    if (savedChatId) {
      activeChatId.value = savedChatId
    }
  }

  // Initialize on store creation
  initializeStore()

  return {
    messages,
    chats,
    users,
    activeChatId,
    typingUsers,
    isTyping,
    unreadCount,
    totalUnreadCount,
    activeChat,
    activeChatMessages,
    friends,
    setupMessageListener,
    setupChatsListener,
    setupUsersListener,
    sendMessage,
    markMessagesAsRead,
    createDirectChat,
    addTypingUser,
    removeTypingUser,
    getUserById,
    setActiveChatId,
    getSavedActiveChatId,
    clearSavedActiveChat,
  }
})
