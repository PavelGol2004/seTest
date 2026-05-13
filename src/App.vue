<script setup>
import { onMounted } from 'vue'
import { Toaster } from 'vue-sonner'
import { useTheme } from '@/composables/useTheme'

const { init } = useTheme()
onMounted(init)
</script>

<template>
  <RouterView />
  <Toaster />
</template>
