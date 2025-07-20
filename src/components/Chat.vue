<template>
  <v-container>
    <v-row>
      <v-col>
        <div v-if="userStore.user" class="chat-container">
          <div class="messages-list">
            <div v-for="message in messages" :key="message.id" class="message"
              :class="{ 'my-message': message.uid === userStore.user.uid }">
              <div class="message-content">
                <div class="font-weight-bold">{{ message.displayName }}</div>
                <div>{{ message.text }}</div>
                <div class="text-caption text-grey">{{ formatTimestamp(message.createdAt) }}</div>
              </div>
            </div>
          </div>
          <v-form @submit.prevent="sendMessage" class="mt-4">
            <v-text-field v-model="newMessage" label="Type a message..." outlined dense hide-details>
              <template v-slot:append>
                <v-btn type="submit" color="primary" icon="mdi-send" :disabled="!newMessage.trim()"></v-btn>
              </template>
            </v-text-field>
          </v-form>
        </div>
        <div v-else>
          <v-alert type="info" border="start" prominent>
            Please log in to see the chat.
          </v-alert>
        </div>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { db } from '@/firebase';
import {
  collection,
  query,
  onSnapshot,
  addDoc,
  serverTimestamp,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { useUserStore } from '@/stores/user';

const userStore = useUserStore();

interface Message {
  id: string;
  text: string;
  uid: string;
  displayName: string;
  createdAt: Timestamp | null;
}

const messages = ref<Message[]>([]);
const newMessage = ref('');

const messagesCollection = collection(db, 'messages');
const q = query(messagesCollection, orderBy('createdAt', 'asc'));

let unsubscribe: () => void;

onMounted(() => {
  unsubscribe = onSnapshot(q, (snapshot) => {
    messages.value = snapshot.docs.map((doc) => ({
      id: doc.id,
      text: doc.data().text,
      uid: doc.data().uid,
      displayName: doc.data().displayName,
      createdAt: doc.data().createdAt,
    }));
  });
});

onUnmounted(() => {
  if (unsubscribe) {
    unsubscribe();
  }
});

const sendMessage = async () => {
  if (newMessage.value.trim() && userStore.user) {
    await addDoc(messagesCollection, {
      text: newMessage.value,
      uid: userStore.user.uid,
      displayName: userStore.user.displayName || 'Anonymous',
      createdAt: serverTimestamp(),
    });
    newMessage.value = '';
  }
};

const formatTimestamp = (timestamp: Timestamp | null): string => {
  if (!timestamp) return 'Sending...';
  return new Date(timestamp.toDate()).toLocaleTimeString();
};
</script>

<style scoped>
.chat-container {
  display: flex;
  flex-direction: column;
  height: 70vh;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 16px;
}

.messages-list {
  flex-grow: 1;
  overflow-y: auto;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message {
  display: flex;
  flex-direction: column;
  max-width: 80%;
  padding: 8px 12px;
  border-radius: 12px;
  background-color: #f1f1f1;
  align-self: flex-start;
  word-wrap: break-word;
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
