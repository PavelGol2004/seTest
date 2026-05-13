<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
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
import { addEvent } from '@/api/events.js'
import { getEventLocationByAddress } from '@/api/location.js'
import { useAuth } from '@/composables/useAuth.js'

const { t } = useI18n()
const router = useRouter()
const { user } = useAuth()
const submitting = ref(false)
const checkingLocation = ref(false)

const schema = toTypedSchema(
  z.object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(10).max(3000),
    date: z.string().min(1),
    time: z.string().min(1),
    address: z.string().trim().min(3).max(255),
    room: z.string().trim().max(40).optional().or(z.literal('')),
    imageUrl: z.string().trim().url().optional().or(z.literal('')),
    qrCodeExpirationTime: z.coerce.number().int().min(1).max(120),
    capacity: z.coerce.number().int().min(1).max(10000),
    status: z.enum(['draft', 'published', 'cancelled', 'archived']),
  })
)

const { handleSubmit, errors, setFieldValue } = useForm({
  validationSchema: schema,
  initialValues: {
    name: '',
    description: '',
    date: '',
    time: '',
    address: '',
    room: '',
    imageUrl: '',
    qrCodeExpirationTime: 30,
    capacity: 50,
    status: 'published',
  },
})

const lat = ref(null)
const lon = ref(null)

const onCheckAddress = handleSubmit(async (values) => {
  checkingLocation.value = true
  try {
    const data = await getEventLocationByAddress(values.address)
    if (data?.address) setFieldValue('address', data.address)
    lat.value = data?.latitude ?? null
    lon.value = data?.longitude ?? null
    toast.success(t('addEvent.addressChecked'))
  } catch (e) {
    lat.value = null
    lon.value = null
    toast.error(e.message)
  } finally {
    checkingLocation.value = false
  }
})

const onSubmit = handleSubmit(async (values) => {
  if (!['Admin', 'Employee'].includes(user.value?.role)) {
    toast.error('Access denied')
    router.push('/')
    return
  }
  submitting.value = true
  try {
    if (lat.value == null || lon.value == null) {
      toast.error(t('addEvent.addressMustBeChecked'))
      return
    }
    const [y, m, d] = values.date.split('-').map(Number)
    const [hh, mm] = values.time.split(':').map(Number)
    const startTime = new Date(y, m - 1, d, hh, mm).toISOString()

    await addEvent({
      name: values.name,
      description: values.description,
      imageUrl: values.imageUrl || '',
      startTime,
      latitude: lat.value,
      longitude: lon.value,
      address: values.address,
      room: values.room || '',
      qrCodeExpirationTime: values.qrCodeExpirationTime,
      capacity: values.capacity,
      status: values.status,
    })
    toast.success(t('addEvent.success'))
    router.push('/')
  } catch (e) {
    toast.error(e.message)
  } finally {
    submitting.value = false
  }
})
</script>

<template>
  <div class="min-h-screen bg-background">
    <Header />
    <div class="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>{{ t('addEvent.title') }}</CardTitle>
          <CardDescription>{{ t('addEvent.description') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form class="space-y-4" @submit.prevent="onSubmit">
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
                <p v-if="errors.date" class="text-sm text-destructive">{{ errors.date }}</p>
              </div>
              <div class="space-y-1">
                <Label>{{ t('addEvent.time') }}</Label>
                <Field name="time" v-slot="{ field }"><Input v-bind="field" type="time" /></Field>
                <p v-if="errors.time" class="text-sm text-destructive">{{ errors.time }}</p>
              </div>
            </div>
            <div class="space-y-1">
              <Label>{{ t('addEvent.address') }}</Label>
              <Field name="address" v-slot="{ field }"><Input v-bind="field" /></Field>
              <p v-if="errors.address" class="text-sm text-destructive">{{ errors.address }}</p>
            </div>
            <Button type="button" variant="outline" :disabled="checkingLocation" @click="onCheckAddress">
              {{ checkingLocation ? '...' : t('addEvent.checkAddress') }}
            </Button>
            <div class="grid grid-cols-2 gap-3">
              <div class="space-y-1">
                <Label>{{ t('addEvent.room') }}</Label>
                <Field name="room" v-slot="{ field }"><Input v-bind="field" /></Field>
              </div>
              <div class="space-y-1">
                <Label>{{ t('addEvent.qrExpire') }}</Label>
                <Field name="qrCodeExpirationTime" v-slot="{ field }"><Input v-bind="field" type="number" min="1" max="120" /></Field>
              </div>
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
            <div class="space-y-1">
              <Label>{{ t('addEvent.imageUrl') }}</Label>
              <Field name="imageUrl" v-slot="{ field }"><Input v-bind="field" /></Field>
              <p v-if="errors.imageUrl" class="text-sm text-destructive">{{ errors.imageUrl }}</p>
            </div>
            <Button type="submit" class="w-full" :disabled="submitting">{{ submitting ? '...' : t('addEvent.submit') }}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
