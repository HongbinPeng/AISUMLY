import { request } from '../utils/request.js'

export function getTodayDashboard() {
  return request('/dashboard/today')
}
