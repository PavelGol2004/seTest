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
const { register } = useAuth()
const submitting = ref(false)

const registerSchema = toTypedSchema(
  z
    .object({
      lastName: z.string().trim().min(1, t('validation.lastNameRequired')).max(100),
      firstName: z.string().trim().min(1, t('validation.firstNameRequired')).max(100),
      middleName: z.string().trim().max(100).optional().or(z.literal('')),
      email: z.string().trim().email(t('validation.email')).max(255),
      password: z.string().min(6, t('validation.passwordMin')).max(128),
      confirmPassword: z.string().min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((d) => d.password === d.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    })
)

const { handleSubmit, errors } = useForm({
  validationSchema: registerSchema,
  initialValues: {
    lastName: '',
    firstName: '',
    middleName: '',
    email: '',
    password: '',
    confirmPassword: '',
  },
})

const onSubmit = handleSubmit(async (values) => {
  submitting.value = true
  try {
    await register({
      email: values.email,
      password: values.password,
      firstName: values.firstName,
      lastName: values.lastName,
      patronymic: values.middleName || undefined,
    })
    toast.success(t('register.success'))
    router.push('/login')
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
    <div class="flex items-center justify-center px-4 py-12">
      <Card class="w-full max-w-md shadow-lg">
        <CardHeader class="text-center">
          <CardTitle class="text-2xl">{{ t('register.title') }}</CardTitle>
          <CardDescription>{{ t('register.description') }}</CardDescription>
        </CardHeader>
        <CardContent>
          <form @submit.prevent="onSubmit" class="space-y-4">
            <div class="space-y-1">
              <Label>{{ t('register.lastName') }}</Label>
              <Field name="lastName" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('register.placeholder.lastName')" />
              </Field>
              <p v-if="errors.lastName" class="text-sm text-destructive">{{ errors.lastName }}</p>
            </div>

            <div class="space-y-1">
              <Label>{{ t('register.firstName') }}</Label>
              <Field name="firstName" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('register.placeholder.firstName')" />
              </Field>
              <p v-if="errors.firstName" class="text-sm text-destructive">{{ errors.firstName }}</p>
            </div>

            <div class="space-y-1">
              <Label>
                {{ t('register.middleName') }}
                <span class="font-normal text-muted-foreground">{{ t('register.optional') }}</span>
              </Label>
              <Field name="middleName" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('register.placeholder.middleName')" />
              </Field>
              <p v-if="errors.middleName" class="text-sm text-destructive">{{ errors.middleName }}</p>
            </div>

            <div class="space-y-1">
              <Label>{{ t('register.email') }}</Label>
              <Field name="email" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('login.placeholder.email')" type="email" />
              </Field>
              <p v-if="errors.email" class="text-sm text-destructive">{{ errors.email }}</p>
            </div>

            <div class="space-y-1">
              <Label>{{ t('register.password') }}</Label>
              <Field name="password" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('register.placeholder.password')" type="password" />
              </Field>
              <p v-if="errors.password" class="text-sm text-destructive">{{ errors.password }}</p>
            </div>

            <div class="space-y-1">
              <Label>{{ t('register.confirmPassword') }}</Label>
              <Field name="confirmPassword" v-slot="{ field }">
                <Input v-bind="field" :placeholder="t('register.placeholder.confirmPassword')" type="password" />
              </Field>
              <p v-if="errors.confirmPassword" class="text-sm text-destructive">{{ errors.confirmPassword }}</p>
            </div>

            <Button type="submit" class="w-full" :disabled="submitting">
              {{ submitting ? '...' : t('register.submit') }}
            </Button>
          </form>

          <p class="mt-4 text-center text-sm text-muted-foreground">
            {{ t('register.hasAccount') }}
            <RouterLink to="/login" class="font-medium text-primary hover:underline">
              {{ t('register.login') }}
            </RouterLink>
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
