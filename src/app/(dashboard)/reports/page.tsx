'use client'

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getAvailableHours,
  getUtilizationPercent,
  getCurrentWeekStart,
  navigateWeek,
  getAssignedHoursForWeek,
} from '@/lib/capacity'
import type {
  TeamMember,
  Project,
  TimeOff,
  Holiday,
} from '@/lib/types/database'
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachWeekOfInterval,
  startOfYear,
  addMonths,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Download } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewMode = 'weekly' | 'monthly'

function getWeeksForRange(count: number): string[] {
  const current = getCurrentWeekStart()
  const weeks: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    weeks.push(navigateWeek(current, -i))
  }
  return weeks
}

function getMonthsForYear(year: number): { value: string; label: string; weeks: string[] }[] {
  const months: { value: string; label: string; weeks: string[] }[] = []
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(year, m, 1)
    const monthStr = format(monthDate, 'yyyy-MM')
    const start = startOfMonth(monthDate)
    const end = endOfMonth(monthDate)
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
      .map((w) => format(w, 'yyyy-MM-dd'))
    months.push({
      value: monthStr,
      label: format(monthDate, 'MMM'),
      weeks,
    })
  }
  return months
}

function cellColor(utilization: number): string {
  if (utilization >= 100) return 'bg-red-200 text-red-900'
  if (utilization >= 95) return 'bg-red-100 text-red-800'
  if (utilization >= 85) return 'bg-orange-100 text-orange-800'
  if (utilization >= 70) return 'bg-green-100 text-green-800'
  if (utilization >= 50) return 'bg-blue-50 text-blue-700'
  return 'bg-slate-50 text-slate-500'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ReportsPage() {
  const supabase = createClient()

  const [members, setMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)

  const [viewMode, setViewMode] = useState<ViewMode>('monthly')
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  // Fetch data
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [membersRes, projectsRes, holidaysRes, timeOffRes] =
        await Promise.all([
          supabase.from('team_members').select('*').eq('is_active', true).order('name'),
          supabase.from('projects').select('*'),
          supabase.from('holidays').select('*'),
          supabase.from('time_off').select('*'),
        ])

      setMembers(membersRes.data ?? [])
      setProjects(projectsRes.data ?? [])
      setHolidays(holidaysRes.data ?? [])
      setTimeOff(timeOffRes.data ?? [])
      setLoading(false)
    }
    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Time periods
  const weeks12 = useMemo(() => getWeeksForRange(12), [])
  const months = useMemo(() => getMonthsForYear(selectedYear), [selectedYear])

  // Sorted members: PM first, then Dev
  const sortedMembers = useMemo(() => {
    const pmMembers = members.filter((m) => m.department === 'PM')
    const devMembers = members.filter((m) => m.department === 'Dev')
    return [...pmMembers, ...devMembers]
  }, [members])

  // Compute utilization grid
  const gridData = useMemo(() => {
    if (viewMode === 'weekly') {
      return sortedMembers.map((member) => {
        const cells = weeks12.map((week) => {
          const available = getAvailableHours(member, week, holidays, timeOff)
          const assigned = getAssignedHoursForWeek(member.id, week, projects)
          return getUtilizationPercent(assigned, available)
        })
        return { member, cells }
      })
    } else {
      // Monthly: average weekly utilization for each month
      return sortedMembers.map((member) => {
        const cells = months.map((month) => {
          if (month.weeks.length === 0) return 0
          let totalUtilization = 0
          for (const week of month.weeks) {
            const available = getAvailableHours(member, week, holidays, timeOff)
            const assigned = getAssignedHoursForWeek(member.id, week, projects)
            totalUtilization += getUtilizationPercent(assigned, available)
          }
          return Math.round(totalUtilization / month.weeks.length)
        })
        return { member, cells }
      })
    }
  }, [viewMode, sortedMembers, weeks12, months, holidays, timeOff, projects])

  // Column headers
  const columnHeaders = useMemo(() => {
    if (viewMode === 'weekly') {
      return weeks12.map((w) => format(parseISO(w), 'MMM d'))
    }
    return months.map((m) => m.label)
  }, [viewMode, weeks12, months])

  // CSV export
  const exportCSV = () => {
    const headers = ['Person', 'Department', ...columnHeaders]
    let csv = headers.join(',') + '\n'
    for (const row of gridData) {
      const line = [
        `"${row.member.name}"`,
        row.member.department,
        ...row.cells.map((c) => `${c}%`),
      ]
      csv += line.join(',') + '\n'
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `utilization-${viewMode}-${selectedYear}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Year options
  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear()
    return [current - 1, current, current + 1]
  }, [])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-sm text-slate-500">Loading report data...</span>
      </div>
    )
  }

  // Find department boundary for visual separator
  const pmCount = sortedMembers.filter((m) => m.department === 'PM').length

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Team utilization overview
          </p>
        </div>
        <div className="flex items-center gap-3">
          {viewMode === 'monthly' && (
            <Select
              value={String(selectedYear)}
              onValueChange={(v) => setSelectedYear(parseInt(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex rounded-lg border overflow-hidden">
            <button
              onClick={() => setViewMode('weekly')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'weekly'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => setViewMode('monthly')}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                viewMode === 'monthly'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 hover:bg-slate-50'
              }`}
            >
              Monthly
            </button>
          </div>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </div>
      </div>

      {/* Utilization Grid */}
      <Card className="py-0">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800 text-white">
                  <th className="sticky left-0 z-10 bg-slate-800 px-4 py-3 text-left font-semibold min-w-[160px]">
                    Person
                  </th>
                  <th className="sticky left-[160px] z-10 bg-slate-800 px-3 py-3 text-left font-semibold min-w-[100px]">
                    Department
                  </th>
                  {columnHeaders.map((header) => (
                    <th
                      key={header}
                      className="px-3 py-3 text-center font-semibold min-w-[72px]"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridData.map((row, rowIndex) => {
                  const showSeparator = rowIndex === pmCount && pmCount > 0
                  return (
                    <tr
                      key={row.member.id}
                      className={`border-b border-slate-100 hover:bg-slate-50/50 ${
                        showSeparator ? 'border-t-2 border-t-slate-300' : ''
                      }`}
                    >
                      <td className="sticky left-0 z-10 bg-white px-4 py-2.5 font-semibold text-slate-900 whitespace-nowrap">
                        {row.member.name}
                      </td>
                      <td className="sticky left-[160px] z-10 bg-white px-3 py-2.5 text-slate-500">
                        {row.member.department}
                      </td>
                      {row.cells.map((util, colIndex) => (
                        <td
                          key={colIndex}
                          className={`px-3 py-2.5 text-center font-medium tabular-nums ${cellColor(util)}`}
                        >
                          {util}%
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="font-medium text-slate-700">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-red-200" />
          100%+
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-red-100" />
          95-99%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-orange-100" />
          85-94%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-green-100" />
          70-84%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-blue-50" />
          50-69%
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-6 rounded bg-slate-50 border border-slate-200" />
          &lt;50%
        </span>
      </div>
    </div>
  )
}
