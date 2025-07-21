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
      snapshot.docChanges().forEach((change) => {
        const docData = change.doc.data()
        const messageId = change.doc.id

        if (change.type === 'added') {
          if (!messages.value.some((m) => m.id === messageId)) {
            const newMessage = {
              id: messageId,
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
            messages.value.push(newMessage)
          }
        }
        if (change.type === 'modified') {
          const index = messages.value.findIndex((m) => m.id === messageId)
          if (index !== -1) {
            messages.value[index] = { ...messages.value[index], ...docData }
          }
        }
        if (change.type === 'removed') {
          messages.value = messages.value.filter((m) => m.id !== messageId)
        }
      })
    })
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
    user.value = userData;
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
  }
})
