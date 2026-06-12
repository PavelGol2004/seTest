import { describe, expect, it } from 'vitest'
import {
  ATTENDANCE_RADIUS_M,
  calculateDistanceMeters,
  isWithinAttendanceRadius,
} from '../src/lib/geolocation.js'

describe('geolocation', () => {
  it('calculates zero distance for same point', () => {
    expect(calculateDistanceMeters(55.7558, 37.6173, 55.7558, 37.6173)).toBeCloseTo(0, 5)
  })

  it('detects within 30m radius', () => {
    const eventLat = 55.7558
    const eventLon = 37.6173
    const nearLat = 55.7559
    const nearLon = 37.6174
    expect(isWithinAttendanceRadius(nearLat, nearLon, eventLat, eventLon, ATTENDANCE_RADIUS_M)).toBe(true)
  })

  it('detects outside 30m radius', () => {
    expect(isWithinAttendanceRadius(55.76, 37.62, 55.7558, 37.6173, ATTENDANCE_RADIUS_M)).toBe(false)
  })
})
