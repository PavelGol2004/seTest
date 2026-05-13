import { post } from './apiClient.js'

export function loginApi(email, password) {
  return post('/users/auth/login', { email, password })
}

export function registerApi({ email, password, firstName, lastName, patronymic }) {
  return post('/users/auth/register', { email, password, firstName, lastName, patronymic })
}
