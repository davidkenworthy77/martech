import { startOfWeek, endOfWeek, eachDayOfInterval, isWeekend, format, parseISO, addDays } from 'date-fns'
import type { TeamMember, Holiday, TimeOff } from '@/lib/types/database'

// Map member location to holiday country code
function locationToCountry(location: string): string {
  switch (location) {
    case 'USA': return 'US'
    case 'Canada': return 'Canada'
    case 'UK': return 'UK'
    default: return 'US'
  }
}

export function getWeekStarting(date: Date): string {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }) // Monday
  return format(weekStart, 'yyyy-MM-dd')
}

export function getHolidayHoursForWeek(
  member: TeamMember,
  weekStarting: string,
  holidays: Holiday[]
): number {
  const weekStart = parseISO(weekStarting)
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const country = locationToCountry(member.location)

  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
    .filter(d => !isWeekend(d))

  let holidayHours = 0
  for (const day of weekDays) {
    const dayStr = format(day, 'yyyy-MM-dd')
    // Check if member's country is in the holiday's countries array
    const holiday = holidays.find(h =>
      h.date === dayStr && (h.countries ?? []).includes(country)
    )
    if (holiday) {
      holidayHours += holiday.hours_lost ?? 8
    }
  }

  return holidayHours
}

export function getPtoHoursForWeek(
  member: TeamMember,
  weekStarting: string,
  timeOffEntries: TimeOff[]
): number {
  const weekStart = parseISO(weekStarting)
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })

  const approvedPto = timeOffEntries.filter(
    t => t.team_member_id === member.id && t.status === 'Approved'
  )

  let ptoHours = 0
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd })
    .filter(d => !isWeekend(d))

  for (const day of weekDays) {
    const dayStr = format(day, 'yyyy-MM-dd')
    for (const pto of approvedPto) {
      const ptoStart = parseISO(pto.start_date)
      const ptoEnd = parseISO(pto.end_date)
      if (day >= ptoStart && day <= ptoEnd) {
        ptoHours += 8
        break
      }
    }
  }

  return ptoHours
}

export function getAvailableHours(
  member: TeamMember,
  weekStarting: string,
  holidays: Holiday[],
  timeOffEntries: TimeOff[]
): number {
  const weeklyHours = member.weekly_hours ?? 40
  const adminHours = member.admin_hours ?? 4
  const holidayHours = getHolidayHoursForWeek(member, weekStarting, holidays)
  const ptoHours = getPtoHoursForWeek(member, weekStarting, timeOffEntries)

  return Math.max(0, weeklyHours - adminHours - holidayHours - ptoHours)
}

export function getUtilizationPercent(allocatedHours: number, availableHours: number): number {
  if (availableHours <= 0) return 0
  return Math.round((allocatedHours / availableHours) * 100)
}

export function getUtilizationColor(percent: number): string {
  if (percent >= 95) return 'text-red-600 bg-red-50'
  if (percent >= 85) return 'text-orange-600 bg-orange-50'
  if (percent >= 70) return 'text-green-600 bg-green-50'
  return 'text-yellow-600 bg-yellow-50'
}

export function getUtilizationBgColor(percent: number): string {
  if (percent >= 95) return '#ef4444'
  if (percent >= 85) return '#f97316'
  if (percent >= 70) return '#22c55e'
  return '#eab308'
}

export function getCurrentWeekStart(): string {
  return getWeekStarting(new Date())
}

export function getWeekLabel(weekStarting: string): string {
  const start = parseISO(weekStarting)
  const end = addDays(start, 4) // Friday
  return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`
}

export function navigateWeek(weekStarting: string, direction: number): string {
  const start = parseISO(weekStarting)
  const newStart = addDays(start, direction * 7)
  return format(newStart, 'yyyy-MM-dd')
}
