import { z } from 'zod'

export function buildEventFormSchema(t, { locationKey = 'address', includeQr = false } = {}) {
  const shape = {
    name: z.string().trim().min(3, t('validation.eventNameMin')).max(120, t('validation.eventNameMax')),
    description: z
      .string()
      .trim()
      .min(10, t('validation.eventDescriptionMin'))
      .max(3000, t('validation.eventDescriptionMax')),
    date: z.string().min(1, t('validation.dateRequired')),
    time: z.string().min(1, t('validation.timeRequired')),
    room: z.string().trim().max(40, t('validation.roomMax')).optional().or(z.literal('')),
    imageUrl: z.string().trim().url(t('validation.imageUrl')).optional().or(z.literal('')),
    capacity: z.coerce
      .number()
      .int()
      .min(1, t('validation.capacityMin'))
      .max(10000, t('validation.capacityMax')),
    status: z.enum(['draft', 'published', 'cancelled', 'archived']),
  }

  shape[locationKey] = z
    .string()
    .trim()
    .min(3, t('validation.addressMin'))
    .max(255, t('validation.addressMax'))

  if (includeQr) {
    shape.qrCodeExpirationTime = z.coerce
      .number()
      .int()
      .min(1, t('validation.qrExpireMin'))
      .max(120, t('validation.qrExpireMax'))
  }

  return z.object(shape)
}
