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
import { useAuth } from '@/composables/useAuth.js'

const { t } = useI18n()
const router = useRouter()
const { login } = useAuth()
const submitting = ref(false)

const loginSchema = toTypedSchema(
  z.object({
    email: z.string().trim().email(t('validation.email')).max(255),
    password: z.string().min(1, t('validation.passwordRequired')).max(128),
  })
)

const { handleSubmit, errors } = useForm({
  validationSchema: loginSchema,
  initialValues: { email: '', password: '' },
})

const onSubmit = handleSubmit(async (values) => {
  submitting.value = true
  try {
    await login(values.email, values.password)
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
    <div class="flex items-center justify-center px-4 py-16">
      <Card class="w-full max-w-md shadow-lg">
        <CardHeader class="text-center">
          <CardTitle class="text-2xl">{{ t('login.title') }}</CardTitle>
          <CardDescription>{{ t('login.description') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="onSubmit" class="space-y-4">
            <div class="space-y-1">
              <Label>{{ t('login.email') }}</Label>
              <Field name="email" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('login.placeholder.email')" type="email" />
              </Field>
              <p v-if="errors.email" class="text-sm text-destructive">{{ errors.email }}</p>
            </div>

            <div class="space-y-1">
              <Label>{{ t('login.password') }}</Label>
              <Field name="password" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('login.placeholder.password')" type="password" />
              </Field>
              <p v-if="errors.password" class="text-sm text-destructive">{{ errors.password }}</p>
            </div>

            <Button type="submit" class="w-full" :disabled="submitting">
              {{ submitting ? '...' : t('login.submit') }}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            {{ t('login.noAccount') }}
            <RouterLink to="/register" class="font-medium text-primary hover:underline">
              {{ t('login.register') }}
            </RouterLink>
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
