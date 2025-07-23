import { defineStore } from 'pinia'
import { ref } from 'vue'
import { auth, db } from '@/firebase'
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User as FirebaseUser,
} from 'firebase/auth'
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  FieldValue,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore'

interface UserState {
  uid: string
  displayName: string | null
  email: string | null
  photoURL: string | null
}

interface Message {
  id: string
  text: string
  uid: string
  displayName: string
  createdAt: Timestamp | FieldValue | null
  replyTo?: {
    id: string
    text: string
    displayName: string
  }
  isEdited?: boolean
  reactions?: Record<string, Record<string, string>>
}

export const useUserStore = defineStore('user', () => {
  const user = ref<UserState | null>(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)
  const unsubscribeMessages = ref<(() => void) | null>(null)
  const messages = ref<Message[]>([])

  function subscribeToMessages() {
    if (!auth.currentUser) {
      console.error('Trying to subscribe to messages without authentication')
      return
    }

    if (unsubscribeMessages.value) {
      unsubscribeMessages.value()
    }

    const messagesCollection = collection(db, 'messages')
    const q = query(messagesCollection, orderBy('createdAt', 'asc'))

    unsubscribeMessages.value = onSnapshot(q, (snapshot) => {
      // Обновляем весь массив сообщений при каждом снимке
      messages.value = snapshot.docs.map((doc) => {
        const docData = doc.data()
        return {
          id: doc.id,
          text: typeof docData.text === 'string' ? docData.text : '',
          uid: typeof docData.uid === 'string' ? docData.uid : '',
          displayName:
            typeof docData.displayName === 'string'
              ? docData.displayName
              : 'Anonymous',
          createdAt: docData.createdAt || null,
          ...(docData.replyTo ? { replyTo: docData.replyTo } : {}),
          ...(docData.isEdited ? { isEdited: docData.isEdited } : {}),
          ...(docData.reactions ? { reactions: docData.reactions } : {}),
        }
      })
    })
  }

  // Добавляем метод sendMessage для совместимости
  async function sendMessage(text: string) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated')
    }

    if (!text.trim()) {
      return
    }

    const messagePayload = {
      text: text.trim(),
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
    }

    try {
      await addDoc(collection(db, 'messages'), messagePayload)
    } catch (error) {
      console.error('Error sending message:', error)
      throw error
    }
  }

  // Подписка на изменения состояния аутентификации
  const unsubscribe = onAuthStateChanged(
    auth,
    (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        }
        user.value = userData
        error.value = null
        subscribeToMessages()
      } else {
        user.value = null
        if (unsubscribeMessages.value) {
          unsubscribeMessages.value()
          unsubscribeMessages.value = null
        }
        messages.value = []
      }
    }
  )

  async function login(email: string, password: string) {
    try {
      isLoading.value = true
      error.value = null
      await signInWithEmailAndPassword(auth, email, password)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed'
      throw error.value
    } finally {
      isLoading.value = false
    }
  }

  async function logout() {
    try {
      isLoading.value = true
      error.value = null
      await signOut(auth)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Logout failed'
      throw error.value
    } finally {
      isLoading.value = false
    }
  }

  function isAuthenticated(): boolean {
    return !!user.value
  }

  function setUser(userData: UserState) {
    user.value = userData
  }

  return {
    user,
    error,
    isLoading,
    messages,
    login,
    logout,
    isAuthenticated,
    unsubscribe,
    unsubscribeMessages,
    setUser,
    sendMessage,
  }
})
