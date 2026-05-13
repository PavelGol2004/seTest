<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useForm, Field } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'
import { toast } from 'vue-sonner'
import Header from '@/components/Header.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import Label from '@/components/ui/Label.vue'
import Card from '@/components/ui/Card.vue'
import CardHeader from '@/components/ui/CardHeader.vue'
import CardTitle from '@/components/ui/CardTitle.vue'
import CardDescription from '@/components/ui/CardDescription.vue'
import CardContent from '@/components/ui/CardContent.vue'
import { getEventDetails, updateEvent } from '@/api/events.js'
import { useAuth } from '@/composables/useAuth.js'
import { backendFeatures } from '@/api/compat.js'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { user } = useAuth()
const loading = ref(true)
const submitting = ref(false)

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(3000),
    date: z.string().min(1),
    time: z.string().min(1),
    location: z.string().trim().min(3).max(255),
    room: z.string().trim().max(40).optional().or(z.literal('')),
    imageUrl: z.string().trim().url().optional().or(z.literal('')),
    capacity: z.coerce.number().int().min(1).max(10000),
    status: z.enum(['draft', 'published', 'cancelled', 'archived']),
  })
)

const { handleSubmit, errors, setValues } = useForm({
  validationSchema: schema,
  initialValues: {
    name: '',
    description: '',
    date: '',
    time: '',
    location: '',
    room: '',
    imageUrl: '',
    capacity: 50,
    status: 'published',
  },
})

async function load() {
  if (!backendFeatures.eventUpdate) {
    toast.error('Редактирование событий пока не поддерживается текущим backend')
    router.push(`/events/${route.params.id}`)
    return
  }
  loading.value = true
  try {
    const event = await getEventDetails(route.params.id)
    const locationAddress = event?.location?.address ?? event?.address ?? event?.location ?? ''
    const eventStart = event.startTime ?? event.startDate
    const d = new Date(eventStart)
    const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    setValues({
      name: event.name ?? '',
      description: event.description ?? '',
      date,
      time,
      location: locationAddress,
      room: event.room ?? '',
      imageUrl: event.imageUrl ?? '',
      capacity: event.capacity ?? 50,
      status: event.status ?? 'published',
    })
  } catch (e) {
    toast.error(e.message)
    router.push('/')
  } finally {
    loading.value = false
  }
}

const onSubmit = handleSubmit(async (values) => {
  if (!['Admin', 'Employee'].includes(user.value?.role)) {
    toast.error('Access denied')
    router.push('/')
    return
  }
  submitting.value = true
  try {
    const [y, m, d] = values.date.split('-').map(Number)
    const [hh, mm] = values.time.split(':').map(Number)
    const startTime = new Date(y, m - 1, d, hh, mm).toISOString()
    await updateEvent(route.params.id, {
      name: values.name,
      description: values.description,
      startTime,
      location: values.location,
      room: values.room || '',
      imageUrl: values.imageUrl || '',
      capacity: values.capacity,
      status: values.status,
    })
    toast.success(t('eventDetails.eventUpdated'))
    router.push(`/events/${route.params.id}`)
  } catch (e) {
    toast.error(e.message)
  } finally {
    submitting.value = false
  }
})

onMounted(load)
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <div class="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{{ t('eventDetails.editEvent') }}</CardTitle>
          <CardDescription>{{ t('eventDetails.editEventDescription') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="loading" class="py-8 text-muted-foreground">...</div>
          <form v-else class="space-y-4" @submit.prevent="onSubmit">
            <div class="space-y-1">
              <Label>{{ t('addEvent.name') }}</Label>
              <Field name="name" v-slot="{ field }"><Input v-bind="field" /></Field>
              <p v-if="errors.name" class="text-sm text-destructive">{{ errors.name }}</p>
            </div>
            <div class="space-y-1">
              <Label>{{ t('addEvent.eventDescription') }}</Label>
              <Field name="description" v-slot="{ field }">
                <textarea v-bind="field" class="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" />
              </Field>
              <p v-if="errors.description" class="text-sm text-destructive">{{ errors.description }}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label>{{ t('addEvent.date') }}</Label>
                <Field name="date" v-slot="{ field }"><Input v-bind="field" type="date" /></Field>
              </div>
              <div class="space-y-1">
                <Label>{{ t('addEvent.time') }}</Label>
                <Field name="time" v-slot="{ field }"><Input v-bind="field" type="time" /></Field>
              </div>
            </div>
            <div class="space-y-1">
              <Label>{{ t('eventDetails.location') }}</Label>
              <Field name="location" v-slot="{ field }"><Input v-bind="field" /></Field>
            </div>
            <div class="space-y-1">
              <Label>{{ t('addEvent.room') }}</Label>
              <Field name="room" v-slot="{ field }"><Input v-bind="field" /></Field>
            </div>
            <div class="space-y-1">
              <Label>{{ t('addEvent.imageUrl') }}</Label>
              <Field name="imageUrl" v-slot="{ field }"><Input v-bind="field" /></Field>
              <p v-if="errors.imageUrl" class="text-sm text-destructive">{{ errors.imageUrl }}</p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label>{{ t('addEvent.capacity') }}</Label>
                <Field name="capacity" v-slot="{ field }"><Input v-bind="field" type="number" min="1" /></Field>
              </div>
              <div class="space-y-1">
                <Label>{{ t('addEvent.status') }}</Label>
                <Field name="status" v-slot="{ field }">
                  <select v-bind="field" class="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="published">{{ t('index.statusPublished') }}</option>
                    <option value="draft">{{ t('index.statusDraft') }}</option>
                    <option value="cancelled">{{ t('index.statusCancelled') }}</option>
                    <option value="archived">{{ t('index.statusArchived') }}</option>
                  </select>
                </Field>
              </div>
            </div>
            <Button type="submit" class="w-full" :disabled="submitting">{{ submitting ? '...' : t('eventDetails.saveEvent') }}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
