<template>
  <v-container>
    <!-- Chat Messages -->
    <v-row>
      <v-col>
        <div class="chat-container" ref="chatContainer">
          <div v-for="message in messages" :key="message.id" class="d-flex my-2">
            <div class="message-bubble" :class="{ 'my-message': message.uid === userStore.user?.uid }">
              <div class="font-weight-bold">{{ message.name }}</div>
              <div>{{ message.text }}</div>
              <div class="text-caption text-grey">{{ new Date(message.createdAt).toLocaleTimeString() }}</div>
            </div>
          </div>
        </div>
      </v-col>
    </v-row>
    
    <!-- Message Input -->
    <v-row>
      <v-col>
        <v-form @submit.prevent="sendMessage" :disabled="!userStore.isLoggedIn">
          <v-text-field
            v-model="newMessage"
            label="Type a message..."
            outlined
            clearable
            append-icon="mdi-send"
            @click:append="sendMessage"
            :disabled="!userStore.isLoggedIn"
            :placeholder="!userStore.isLoggedIn ? 'Please login to send messages' : ''"
          ></v-text-field>
        </v-form>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { db } from '@/firebase';
import { collection, addDoc, onSnapshot, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { useUserStore } from '@/stores/user';

interface Message {
  id: string;
  text: string;
  name: string;
  uid: string;
  createdAt: number;
}

const userStore = useUserStore();
const messages = ref<Message[]>([]);
const newMessage = ref('');
const chatContainer = ref<HTMLDivElement | null>(null);

// Get messages
onMounted(() => {
  const q = query(collection(db, 'messages'), orderBy('createdAt'));
  onSnapshot(q, (querySnapshot) => {
    messages.value = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      messages.value.push({
        id: doc.id,
        text: data.text,
        name: data.name,
        uid: data.uid,
        createdAt: data.createdAt?.toMillis() ?? Date.now(),
      });
    });

    // Scroll to bottom
    nextTick(() => {
      if(chatContainer.value) {
        chatContainer.value.scrollTop = chatContainer.value.scrollHeight;
      }
    });
  });
});

// Send message
const sendMessage = async () => {
  if (newMessage.value.trim() === '' || !userStore.user) return;

  try {
    await addDoc(collection(db, 'messages'), {
      text: newMessage.value,
      name: userStore.user.displayName,
      uid: userStore.user.uid,
      createdAt: serverTimestamp(),
    });
    newMessage.value = '';
  } catch (error) {
    console.error('Error sending message:', error);
  }
};
</script>

<style scoped>
.chat-container {
  height: 400px;
  border: 1px solid #ccc;
  border-radius: 4px;
  padding: 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.message-bubble {
  padding: 8px 12px;
  border-radius: 18px;
  max-width: 70%;
  background-color: #f0f0f0;
}

.my-message {
  background-color: #dcf8c6;
  align-self: flex-end;
  text-align: right;
  margin-left: auto;
}
</style>
