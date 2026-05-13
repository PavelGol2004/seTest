<script setup>
import { ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'detected', 'error'])

const scannerId = 'smart-event-qr-reader'
const loading = ref(false)
let scanner = null
let Html5QrcodeRef = null

async function startScanner() {
  if (scanner) return
  loading.value = true
  try {
    if (!Html5QrcodeRef) {
      const mod = await import('html5-qrcode')
      Html5QrcodeRef = mod.Html5Qrcode
    }
    const Html5Qrcode = Html5QrcodeRef
    scanner = new Html5Qrcode(scannerId)
    const cameras = await Html5Qrcode.getCameras()
    const preferred = cameras.find((c) => /back|rear|environment/i.test(c.label))
    const cameraConfig = preferred?.id ?? { facingMode: 'environment' }
    await scanner.start(
      cameraConfig,
      { fps: 10, qrbox: { width: 240, height: 240 } },
      (decodedText) => {
        emit('detected', decodedText)
      },
      () => {}
    )
  } catch (e) {
    emit('error', e)
  } finally {
    loading.value = false
  }
}

async function stopScanner() {
  if (!scanner) return
  try {
    if (scanner.isScanning) await scanner.stop()
  } catch {}
  try {
    await scanner.clear()
  } catch {}
  scanner = null
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) await startScanner()
    else await stopScanner()
  }
)

onBeforeUnmount(async () => {
  await stopScanner()
})
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
  >
    <div class="w-full max-w-md rounded-xl border border-border bg-background p-4 shadow-xl">
      <div class="mb-3 flex items-center justify-between">
        <h3 class="text-base font-semibold">QR</h3>
        <button class="text-sm text-muted-foreground hover:text-foreground" @click="emit('close')">
          x
        </button>
      </div>
      <div :id="scannerId" class="overflow-hidden rounded-lg" />
      <p v-if="loading" class="mt-2 text-sm text-muted-foreground">...</p>
    </div>
  </div>
</template>
