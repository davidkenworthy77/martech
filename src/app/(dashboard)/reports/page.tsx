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
  addMonths,
} from 'date-fns'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, Download } from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ViewMode = 'weekly' | 'monthly'
type RangeMonths = 3 | 6 | 12

/** Generate weeks starting from the current week covering `monthCount` months forward */
function getWeeksForMonths(monthCount: number): string[] {
  const weekCount = Math.round(monthCount * 4.33)
  const current = getCurrentWeekStart()
  const weeks: string[] = []
  for (let i = 0; i < weekCount; i++) {
    weeks.push(navigateWeek(current, i))
  }
  return weeks
}

/** Generate `monthCount` months starting from the current month going forward */
function getMonthsForward(monthCount: number): { value: string; label: string; weeks: string[] }[] {
  const now = new Date()
  const months: { value: string; label: string; weeks: string[] }[] = []
  for (let i = 0; i < monthCount; i++) {
    const monthDate = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), i)
    const monthStr = format(monthDate, 'yyyy-MM')
    const start = startOfMonth(monthDate)
    const end = endOfMonth(monthDate)
    const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
      .map((w) => format(w, 'yyyy-MM-dd'))
    months.push({
      value: monthStr,
      label: format(monthDate, 'MMM yyyy'),
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
  const [rangeMonths, setRangeMonths] = useState<RangeMonths>(3)

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

  // Time periods — both go FORWARD, driven by rangeMonths
  const weeks = useMemo(() => getWeeksForMonths(rangeMonths), [rangeMonths])
  const months = useMemo(() => getMonthsForward(rangeMonths), [rangeMonths])

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
        const cells = weeks.map((week) => {
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
  }, [viewMode, sortedMembers, weeks, months, holidays, timeOff, projects])

  // Column headers
  const columnHeaders = useMemo(() => {
    if (viewMode === 'weekly') {
      return weeks.map((w) => format(parseISO(w), 'MMM d'))
    }
    return months.map((m) => m.label)
  }, [viewMode, weeks, months])

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
    link.download = `utilization-${viewMode}-${rangeMonths}mo.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

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
            Team utilization forecast — next {rangeMonths} months
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Range selector */}
          <div className="flex rounded-lg border overflow-hidden">
            {([3, 6, 12] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRangeMonths(m)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  rangeMonths === m
                    ? 'bg-slate-900 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {m}mo
              </button>
            ))}
          </div>
          {/* View mode */}
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
                  <th className="sticky left-[160px] z-10 bg-slate-800 px-3 py-3 text-left font-semibold min-w-[80px]">
                    Dept
                  </th>
                  {columnHeaders.map((header, i) => (
                    <th
                      key={`${header}-${i}`}
                      className={`px-3 py-3 text-center font-semibold whitespace-nowrap ${
                        viewMode === 'weekly' ? 'min-w-[64px]' : 'min-w-[80px]'
                      } ${i === 0 ? 'border-l-2 border-l-blue-400' : ''}`}
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
                          className={`px-2 py-2.5 text-center font-medium tabular-nums text-xs ${cellColor(util)} ${
                            colIndex === 0 ? 'border-l-2 border-l-blue-400' : ''
                          }`}
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
