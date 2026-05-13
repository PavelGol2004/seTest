<script setup>
import { ref, onMounted } from 'vue'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import Button from '@/components/ui/Button.vue'
import { getUsersWithRoles, updateUserRole } from '@/api/admin.js'
import { backendFeatures } from '@/api/compat.js'

const users = ref([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    users.value = await getUsersWithRoles()
  } catch {
    users.value = []
  } finally {
    loading.value = false
  }
}

async function saveRole(user) {
  try {
    await updateUserRole(user.id, user.role)
    toast.success('Role updated')
  } catch (e) {
    toast.error(e.message)
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-3xl px-4 py-8">
      <h1 class="mb-4 text-xl font-semibold">Roles</h1>
      <div v-if="!backendFeatures.adminRoles" class="mb-4 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Управление ролями пока не поддерживается текущей версией backend.
      </div>
      <div v-if="loading">...</div>
      <div v-else class="space-y-3">
        <Card v-for="u in users" :key="u.id">
          <CardContent class="flex items-center justify-between gap-3 p-4">
            <div>
              <p class="font-medium">{{ u.firstName }}</p>
              <p class="text-sm text-muted-foreground">{{ u.email }}</p>
            </div>
            <div class="flex items-center gap-2">
              <select v-model="u.role" class="h-9 rounded-md border border-input bg-background px-2 text-sm">
                <option value="Student">Student</option>
                <option value="Employee">Employee</option>
                <option value="Admin">Admin</option>
              </select>
              <Button size="sm" @click="saveRole(u)">Save</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
