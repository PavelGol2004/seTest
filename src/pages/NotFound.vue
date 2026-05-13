<script setup>
import { watchEffect } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'

const route = useRoute()
const { t } = useI18n()

watchEffect(() => {
  console.error('404 Error: User attempted to access non-existent route:', route.path)
})
</script>

<template>
  <div class="flex min-h-screen items-center justify-center bg-muted">
    <div class="text-center">
      <h1 class="mb-4 text-4xl font-bold">404</h1>
      <p class="mb-4 text-xl text-muted-foreground">{{ t('notFound.message') }}</p>
      <RouterLink to="/" class="text-primary underline hover:text-primary/90">
        {{ t('notFound.home') }}
      </RouterLink>
    </div>
  </div>
</template>
