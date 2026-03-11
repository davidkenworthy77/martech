import { startOfWeek, endOfWeek, eachDayOfInterval, isWeekend, format, parseISO, addDays, differenceInCalendarDays } from 'date-fns'
import type { TeamMember, Holiday, TimeOff, Project } from '@/lib/types/database'

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
    // Check if member is affected by any holiday on this day
    // Use team_member_ids if set, otherwise fall back to country matching
    const holiday = holidays.find(h => {
      if (h.date !== dayStr) return false
      if (h.team_member_ids && h.team_member_ids.length > 0) {
        return h.team_member_ids.includes(member.id)
      }
      return (h.countries ?? []).includes(country)
    })
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

// ---------------------------------------------------------------------------
// Assignment-based utilization (replaces weekly_allocations)
// ---------------------------------------------------------------------------

const WEEKS_PER_MONTH = 4.33

/**
 * Calculate the total hours assigned to a team member for a given week,
 * derived from retainer/project PM and Dev assignments.
 */
export function getAssignedHoursForWeek(
  memberId: string,
  weekStarting: string,
  allProjects: Project[]
): number {
  let totalHours = 0
  const weekStart = parseISO(weekStarting)
  const weekEnd = addDays(weekStart, 6)

  for (const project of allProjects) {
    if (project.status !== 'Active') continue

    const isAssignedPm = project.lead_pm_id === memberId
    // For retainers/internal: use dev_ids array; for projects: use lead_dev_id
    const isRetainerLike = project.category === 'retainer' || project.category === 'internal'
    const isAssignedDev = isRetainerLike
      ? (project.dev_ids ?? []).includes(memberId)
      : project.lead_dev_id === memberId
    // Lead roles (projects only)
    const isAssignedPmLead = project.pm_lead_id === memberId
    const isAssignedDevLead = project.dev_lead_id === memberId

    if (!isAssignedPm && !isAssignedDev && !isAssignedPmLead && !isAssignedDevLead) continue

    if (isRetainerLike) {
      // Retainers & internal: monthly hours spread evenly across weeks
      const monthlyTotal = Number(project.monthly_hours_total) || 0
      const pmPct = Number(project.pm_split_pct) || 0
      const devPct = Number(project.dev_split_pct) || 0
      if (isAssignedPm) {
        totalHours += (monthlyTotal * pmPct / 100) / WEEKS_PER_MONTH
      }
      if (isAssignedDev) {
        const devCount = (project.dev_ids ?? []).length || 1
        totalHours += (monthlyTotal * devPct / 100) / WEEKS_PER_MONTH / devCount
      }
    } else if (project.category === 'project') {
      // Projects: total hours spread across relevant timeline per role
      // Lead roles get 10%, main roles get 90% (or 100% if no lead assigned)
      if (!project.start_date || !project.end_date) continue

      const projectStart = parseISO(project.start_date)
      const projectEnd = parseISO(project.end_date)
      const totalProjectHours = Number(project.monthly_hours_total) || 0
      const pmPct = Number(project.pm_split_pct) || 0
      const devPct = Number(project.dev_split_pct) || 0
      const hasPmLead = !!project.pm_lead_id
      const hasDevLead = !!project.dev_lead_id

      // PM: spread across full project timeline (90% if lead exists, else 100%)
      if (isAssignedPm) {
        if (weekStart <= projectEnd && weekEnd >= projectStart) {
          const pmDays = Math.max(7, differenceInCalendarDays(projectEnd, projectStart) + 1)
          const pmWeeks = Math.max(1, pmDays / 7)
          const pmShare = hasPmLead ? 0.9 : 1
          totalHours += (totalProjectHours * pmPct / 100) * pmShare / pmWeeks
        }
      }

      // PM Lead: 10% of PM hours across full project timeline
      if (isAssignedPmLead) {
        if (weekStart <= projectEnd && weekEnd >= projectStart) {
          const pmDays = Math.max(7, differenceInCalendarDays(projectEnd, projectStart) + 1)
          const pmWeeks = Math.max(1, pmDays / 7)
          totalHours += (totalProjectHours * pmPct / 100) * 0.1 / pmWeeks
        }
      }

      // Dev: spread across dev date range (90% if lead exists, else 100%)
      if (isAssignedDev) {
        const devStart = project.dev_start_date ? parseISO(project.dev_start_date) : projectStart
        const devEnd = project.dev_end_date ? parseISO(project.dev_end_date) : projectEnd

        if (weekStart <= devEnd && weekEnd >= devStart) {
          const devDays = Math.max(7, differenceInCalendarDays(devEnd, devStart) + 1)
          const devWeeks = Math.max(1, devDays / 7)
          const devShare = hasDevLead ? 0.9 : 1
          totalHours += (totalProjectHours * devPct / 100) * devShare / devWeeks
        }
      }

      // Dev Lead: 10% of Dev hours across dev date range
      if (isAssignedDevLead) {
        const devStart = project.dev_start_date ? parseISO(project.dev_start_date) : projectStart
        const devEnd = project.dev_end_date ? parseISO(project.dev_end_date) : projectEnd

        if (weekStart <= devEnd && weekEnd >= devStart) {
          const devDays = Math.max(7, differenceInCalendarDays(devEnd, devStart) + 1)
          const devWeeks = Math.max(1, devDays / 7)
          totalHours += (totalProjectHours * devPct / 100) * 0.1 / devWeeks
        }
      }
    }
  }

  return Math.round(totalHours * 10) / 10
}

/**
 * Return per-project breakdown of assigned hours for a member in a given week.
 */
export function getAssignedHoursBreakdown(
  memberId: string,
  weekStarting: string,
  allProjects: Project[]
): { project: Project; hours: number; role: string }[] {
  const result: { project: Project; hours: number; role: string }[] = []
  const weekStart = parseISO(weekStarting)
  const weekEnd = addDays(weekStart, 6)

  for (const project of allProjects) {
    if (project.status !== 'Active') continue

    const isAssignedPm = project.lead_pm_id === memberId
    const isRetainerLike = project.category === 'retainer' || project.category === 'internal'
    const isAssignedDev = isRetainerLike
      ? (project.dev_ids ?? []).includes(memberId)
      : project.lead_dev_id === memberId
    const isAssignedPmLead = project.pm_lead_id === memberId
    const isAssignedDevLead = project.dev_lead_id === memberId

    if (!isAssignedPm && !isAssignedDev && !isAssignedPmLead && !isAssignedDevLead) continue

    let hours = 0
    const roles: string[] = []

    if (isRetainerLike) {
      const monthlyTotal = Number(project.monthly_hours_total) || 0
      const pmPct = Number(project.pm_split_pct) || 0
      const devPct = Number(project.dev_split_pct) || 0
      if (isAssignedPm) { hours += (monthlyTotal * pmPct / 100) / WEEKS_PER_MONTH; roles.push('PM') }
      if (isAssignedDev) {
        const devCount = (project.dev_ids ?? []).length || 1
        hours += (monthlyTotal * devPct / 100) / WEEKS_PER_MONTH / devCount
        roles.push('Dev')
      }
    } else if (project.category === 'project') {
      if (!project.start_date || !project.end_date) continue

      const projectStart = parseISO(project.start_date)
      const projectEnd = parseISO(project.end_date)
      const totalProjectHours = Number(project.monthly_hours_total) || 0
      const pmPct = Number(project.pm_split_pct) || 0
      const devPct = Number(project.dev_split_pct) || 0
      const hasPmLead = !!project.pm_lead_id
      const hasDevLead = !!project.dev_lead_id

      if (isAssignedPm && weekStart <= projectEnd && weekEnd >= projectStart) {
        const pmDays = Math.max(7, differenceInCalendarDays(projectEnd, projectStart) + 1)
        const pmWeeks = Math.max(1, pmDays / 7)
        const pmShare = hasPmLead ? 0.9 : 1
        hours += (totalProjectHours * pmPct / 100) * pmShare / pmWeeks
        roles.push('PM')
      }

      if (isAssignedPmLead && weekStart <= projectEnd && weekEnd >= projectStart) {
        const pmDays = Math.max(7, differenceInCalendarDays(projectEnd, projectStart) + 1)
        const pmWeeks = Math.max(1, pmDays / 7)
        hours += (totalProjectHours * pmPct / 100) * 0.1 / pmWeeks
        roles.push('PM Lead')
      }

      if (isAssignedDev) {
        const devStart = project.dev_start_date ? parseISO(project.dev_start_date) : projectStart
        const devEnd = project.dev_end_date ? parseISO(project.dev_end_date) : projectEnd

        if (weekStart <= devEnd && weekEnd >= devStart) {
          const devDays = Math.max(7, differenceInCalendarDays(devEnd, devStart) + 1)
          const devWeeks = Math.max(1, devDays / 7)
          const devShare = hasDevLead ? 0.9 : 1
          hours += (totalProjectHours * devPct / 100) * devShare / devWeeks
          roles.push('Dev')
        }
      }

      if (isAssignedDevLead) {
        const devStart = project.dev_start_date ? parseISO(project.dev_start_date) : projectStart
        const devEnd = project.dev_end_date ? parseISO(project.dev_end_date) : projectEnd

        if (weekStart <= devEnd && weekEnd >= devStart) {
          const devDays = Math.max(7, differenceInCalendarDays(devEnd, devStart) + 1)
          const devWeeks = Math.max(1, devDays / 7)
          hours += (totalProjectHours * devPct / 100) * 0.1 / devWeeks
          roles.push('Dev Lead')
        }
      }
    }

    if (hours > 0) {
      const role = roles.join(' + ')
      result.push({ project, hours: Math.round(hours * 10) / 10, role })
    }
  }

  return result
}
