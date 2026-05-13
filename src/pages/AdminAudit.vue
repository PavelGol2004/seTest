<script setup>
import { ref, onMounted } from 'vue'
import Header from '@/components/Header.vue'
import Card from '@/components/ui/Card.vue'
import CardContent from '@/components/ui/CardContent.vue'
import { getAuditLog } from '@/api/admin.js'
import { backendFeatures } from '@/api/compat.js'

const items = ref([])
const loading = ref(true)

async function load() {
  loading.value = true
  try {
    items.value = await getAuditLog()
  } catch {
    items.value = []
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <main class="mx-auto max-w-4xl px-4 py-8">
      <h1 class="mb-4 text-xl font-semibold">Audit log</h1>
      <div v-if="!backendFeatures.adminAudit" class="mb-4 rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
        Журнал аудита пока не поддерживается текущей версией backend.
      </div>
      <div v-if="loading">...</div>
      <div v-else class="space-y-2">
        <Card v-for="(item, idx) in items" :key="idx">
          <CardContent class="p-3 text-sm">
            <p class="font-medium">{{ item.action }}</p>
            <p class="text-muted-foreground">{{ item.meta }}</p>
            <p class="text-xs text-muted-foreground">{{ item.at }}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
