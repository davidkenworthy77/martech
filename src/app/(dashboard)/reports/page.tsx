'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getAvailableHours,
  getUtilizationPercent,
  getUtilizationBgColor,
  getCurrentWeekStart,
  navigateWeek,
} from '@/lib/capacity'
import type {
  TeamMember,
  Project,
  WeeklyAllocation,
  TimeOff,
  Holiday,
} from '@/lib/types/database'
import { format, parseISO, startOfMonth, endOfMonth, eachWeekOfInterval, addMonths } from 'date-fns'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Download, TrendingUp, BarChart3, Users, AlertTriangle } from 'lucide-react'

// --- Color palette for chart lines ---
const LINE_COLORS = [
  '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
  '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1',
  '#d946ef', '#84cc16', '#0ea5e9', '#e11d48', '#a855f7',
]

// --- Specializations tracked in the system ---
const SPECIALIZATIONS = ['Drupal', 'WordPress', 'Front End', 'Banner/Email']

// --- Helper: format a date string as short week label ---
function weekLabel(weekStarting: string): string {
  return format(parseISO(weekStarting), 'MMM d')
}

// --- Helper: get past N weeks starting Monday ---
function getPastWeeks(count: number): string[] {
  const current = getCurrentWeekStart()
  const weeks: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    weeks.push(navigateWeek(current, -i))
  }
  return weeks
}

// --- Helper: get month options for selectors ---
function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date()
  const months: { value: string; label: string }[] = []
  for (let i = -2; i <= 3; i++) {
    const d = addMonths(now, i)
    months.push({
      value: format(d, 'yyyy-MM'),
      label: format(d, 'MMMM yyyy'),
    })
  }
  return months
}

// --- Helper: get weeks within a given month ---
function getWeeksInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split('-').map(Number)
  const start = startOfMonth(new Date(year, month - 1))
  const end = endOfMonth(new Date(year, month - 1))
  const weeks = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 })
  return weeks.map((w) => format(w, 'yyyy-MM-dd'))
}

// =======================================================
// Main Reports Page
// =======================================================

export default function ReportsPage() {
  const supabase = createClient()

  // --- Core data ---
  const [members, setMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [allocations, setAllocations] = useState<WeeklyAllocation[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)

  // --- UI state ---
  const [trendMode, setTrendMode] = useState<'person' | 'department'>('person')
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [activeTab, setActiveTab] = useState('utilization')

  // --- Fetch all data on mount ---
  useEffect(() => {
    async function fetchData() {
      setLoading(true)
      const [membersRes, projectsRes, allocationsRes, holidaysRes, timeOffRes] =
        await Promise.all([
          supabase.from('team_members').select('*').eq('is_active', true),
          supabase.from('projects').select('*'),
          supabase.from('weekly_allocations').select('*'),
          supabase.from('holidays').select('*'),
          supabase.from('time_off').select('*'),
        ])

      setMembers(membersRes.data ?? [])
      setProjects(projectsRes.data ?? [])
      setAllocations(allocationsRes.data ?? [])
      setHolidays(holidaysRes.data ?? [])
      setTimeOff(timeOffRes.data ?? [])
      setLoading(false)
    }

    fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // =====================================================
  // 1. UTILIZATION TRENDS (last 12 weeks)
  // =====================================================
  const weeks12 = useMemo(() => getPastWeeks(12), [])

  const utilizationByPerson = useMemo(() => {
    return weeks12.map((week) => {
      const point: Record<string, number | string> = { week: weekLabel(week) }
      for (const member of members) {
        const available = getAvailableHours(member, week, holidays, timeOff)
        const allocated = allocations
          .filter((a) => a.team_member_id === member.id && a.week_starting === week)
          .reduce((sum, a) => sum + a.hours_allocated, 0)
        point[member.name] = getUtilizationPercent(allocated, available)
      }
      return point
    })
  }, [weeks12, members, allocations, holidays, timeOff])

  const utilizationByDepartment = useMemo(() => {
    const departments = [...new Set(members.map((m) => m.department))]
    return weeks12.map((week) => {
      const point: Record<string, number | string> = { week: weekLabel(week) }
      for (const dept of departments) {
        const deptMembers = members.filter((m) => m.department === dept)
        let totalAllocated = 0
        let totalAvailable = 0
        for (const member of deptMembers) {
          totalAvailable += getAvailableHours(member, week, holidays, timeOff)
          totalAllocated += allocations
            .filter((a) => a.team_member_id === member.id && a.week_starting === week)
            .reduce((sum, a) => sum + a.hours_allocated, 0)
        }
        point[dept] = getUtilizationPercent(totalAllocated, totalAvailable)
      }
      return point
    })
  }, [weeks12, members, allocations, holidays, timeOff])

  const trendData = trendMode === 'person' ? utilizationByPerson : utilizationByDepartment
  const trendKeys = useMemo(() => {
    if (trendMode === 'person') return members.map((m) => m.name)
    return [...new Set(members.map((m) => m.department))]
  }, [trendMode, members])

  // =====================================================
  // 2. PROJECT HOURS SUMMARY (selected month)
  // =====================================================
  const projectHoursData = useMemo(() => {
    const weeksInMonth = getWeeksInMonth(selectedMonth)
    const projectMap = new Map<string, number>()

    for (const alloc of allocations) {
      if (weeksInMonth.includes(alloc.week_starting)) {
        const project = projects.find((p) => p.id === alloc.project_id)
        const name = project ? project.project_name : 'Unknown'
        projectMap.set(name, (projectMap.get(name) ?? 0) + alloc.hours_allocated)
      }
    }

    return Array.from(projectMap.entries())
      .map(([name, hours]) => ({ name, hours: Math.round(hours * 10) / 10 }))
      .sort((a, b) => b.hours - a.hours)
  }, [selectedMonth, allocations, projects])

  // =====================================================
  // 3. SKILLS GAP ANALYSIS (selected month)
  // =====================================================
  const skillsGapData = useMemo(() => {
    const weeksInMonth = getWeeksInMonth(selectedMonth)

    return SPECIALIZATIONS.map((spec) => {
      const specMembers = members.filter(
        (m) => m.specializations?.includes(spec)
      )

      let totalCapacity = 0
      let totalAllocated = 0

      for (const week of weeksInMonth) {
        for (const member of specMembers) {
          totalCapacity += getAvailableHours(member, week, holidays, timeOff)
          totalAllocated += allocations
            .filter((a) => a.team_member_id === member.id && a.week_starting === week)
            .reduce((sum, a) => sum + a.hours_allocated, 0)
        }
      }

      const utilization = getUtilizationPercent(totalAllocated, totalCapacity)
      const remaining = Math.max(0, totalCapacity - totalAllocated)

      return {
        specialization: spec,
        memberCount: specMembers.length,
        totalCapacity: Math.round(totalCapacity),
        totalAllocated: Math.round(totalAllocated),
        remaining: Math.round(remaining),
        utilization,
        color: getUtilizationBgColor(utilization),
      }
    })
  }, [selectedMonth, members, allocations, holidays, timeOff])

  // =====================================================
  // CSV EXPORT
  // =====================================================
  const exportCSV = useCallback(() => {
    let csvContent = ''
    let filename = ''

    if (activeTab === 'utilization') {
      const headers = ['Week', ...trendKeys]
      csvContent = headers.join(',') + '\n'
      for (const row of trendData) {
        const line = [row.week, ...trendKeys.map((k) => row[k] ?? 0)]
        csvContent += line.join(',') + '\n'
      }
      filename = `utilization-trends-${trendMode}.csv`
    } else if (activeTab === 'projects') {
      csvContent = 'Project,Allocated Hours\n'
      for (const row of projectHoursData) {
        csvContent += `"${row.name}",${row.hours}\n`
      }
      filename = `project-hours-${selectedMonth}.csv`
    } else if (activeTab === 'skills') {
      csvContent =
        'Specialization,Team Members,Capacity Hours,Allocated Hours,Remaining Hours,Utilization %\n'
      for (const row of skillsGapData) {
        csvContent += `"${row.specialization}",${row.memberCount},${row.totalCapacity},${row.totalAllocated},${row.remaining},${row.utilization}\n`
      }
      filename = `skills-gap-${selectedMonth}.csv`
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, [activeTab, trendMode, trendKeys, trendData, projectHoursData, skillsGapData, selectedMonth])

  // =====================================================
  // RENDER
  // =====================================================

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-muted-foreground text-sm">Loading report data...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Page Header */}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports</h1>
          <p className="text-sm text-slate-500">
            Utilization trends, project summaries, and capacity analysis
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="utilization">
            <TrendingUp className="h-4 w-4" />
            Utilization Trends
          </TabsTrigger>
          <TabsTrigger value="projects">
            <BarChart3 className="h-4 w-4" />
            Project Hours
          </TabsTrigger>
          <TabsTrigger value="skills">
            <Users className="h-4 w-4" />
            Skills Gap
          </TabsTrigger>
        </TabsList>

        {/* ===== TAB 1: Utilization Trends ===== */}
        <TabsContent value="utilization">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Utilization Trends</CardTitle>
                  <CardDescription>
                    Weekly utilization percentage over the last 12 weeks
                  </CardDescription>
                </div>
                <Select
                  value={trendMode}
                  onValueChange={(v) => setTrendMode(v as 'person' | 'department')}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person">By Person</SelectItem>
                    <SelectItem value="department">By Department</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="week"
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      domain={[0, 120]}
                      tick={{ fontSize: 12, fill: '#64748b' }}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip
                      formatter={(value) => [`${value}%`, undefined]}
                      contentStyle={{
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                        fontSize: '13px',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                    />
                    <ReferenceLine
                      y={70}
                      stroke="#eab308"
                      strokeDasharray="6 4"
                      label={{ value: '70%', position: 'right', fill: '#eab308', fontSize: 11 }}
                    />
                    <ReferenceLine
                      y={95}
                      stroke="#ef4444"
                      strokeDasharray="6 4"
                      label={{ value: '95%', position: 'right', fill: '#ef4444', fontSize: 11 }}
                    />
                    {trendKeys.map((key, i) => (
                      <Line
                        key={key}
                        type="monotone"
                        dataKey={key}
                        stroke={LINE_COLORS[i % LINE_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              {/* Legend badges for thresholds */}
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                <span className="text-xs text-slate-500">Thresholds:</span>
                <Badge variant="outline" className="gap-1.5 border-yellow-300 text-yellow-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-yellow-400" />
                  70% target
                </Badge>
                <Badge variant="outline" className="gap-1.5 border-red-300 text-red-700">
                  <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
                  95% overloaded
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 2: Project Hours ===== */}
        <TabsContent value="projects">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Project Hours Summary</CardTitle>
                  <CardDescription>
                    Total allocated hours per project for the selected month
                  </CardDescription>
                </div>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {getMonthOptions().map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {projectHoursData.length === 0 ? (
                <div className="flex h-60 items-center justify-center text-sm text-slate-400">
                  No allocation data for this month
                </div>
              ) : (
                <div className="h-[420px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={projectHoursData}
                      layout="vertical"
                      margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        tickLine={false}
                        axisLine={{ stroke: '#e2e8f0' }}
                        label={{
                          value: 'Hours',
                          position: 'insideBottomRight',
                          offset: -5,
                          style: { fontSize: 12, fill: '#94a3b8' },
                        }}
                      />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tick={{ fontSize: 12, fill: '#334155' }}
                        tickLine={false}
                        axisLine={false}
                        width={160}
                      />
                      <Tooltip
                        formatter={(value) => [`${value} hrs`, 'Allocated']}
                        contentStyle={{
                          borderRadius: '8px',
                          border: '1px solid #e2e8f0',
                          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                          fontSize: '13px',
                        }}
                      />
                      <Bar
                        dataKey="hours"
                        fill="#3b82f6"
                        radius={[0, 4, 4, 0]}
                        barSize={24}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {/* Summary stats */}
              {projectHoursData.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4">
                  <div className="text-sm text-slate-500">
                    <span className="font-medium text-slate-700">
                      {projectHoursData.length}
                    </span>{' '}
                    projects
                  </div>
                  <div className="text-sm text-slate-500">
                    <span className="font-medium text-slate-700">
                      {Math.round(projectHoursData.reduce((s, p) => s + p.hours, 0))}
                    </span>{' '}
                    total hours
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ===== TAB 3: Skills Gap Analysis ===== */}
        <TabsContent value="skills">
          <div className="flex flex-col gap-4">
            {/* Month selector for skills view */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Skills / Specialization Gap Analysis
                </h2>
                <p className="text-sm text-slate-500">
                  Capacity vs allocation by specialization for the selected month
                </p>
              </div>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getMonthOptions().map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Skills cards grid */}
            <div className="grid gap-4 sm:grid-cols-2">
              {skillsGapData.map((skill) => {
                const barPercent = Math.min(skill.utilization, 100)
                const isOverloaded = skill.utilization >= 95
                const isLow = skill.utilization < 70

                return (
                  <Card key={skill.specialization}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-base">{skill.specialization}</CardTitle>
                          <CardDescription>
                            {skill.memberCount} team member{skill.memberCount !== 1 ? 's' : ''}
                          </CardDescription>
                        </div>
                        <Badge
                          variant="outline"
                          className={
                            isOverloaded
                              ? 'border-red-200 bg-red-50 text-red-700'
                              : isLow
                                ? 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                : 'border-green-200 bg-green-50 text-green-700'
                          }
                        >
                          {skill.utilization}%
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${barPercent}%`,
                              backgroundColor: skill.color,
                            }}
                          />
                        </div>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div>
                          <div className="text-lg font-semibold text-slate-900">
                            {skill.totalCapacity}
                          </div>
                          <div className="text-xs text-slate-500">Capacity</div>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-slate-900">
                            {skill.totalAllocated}
                          </div>
                          <div className="text-xs text-slate-500">Allocated</div>
                        </div>
                        <div>
                          <div
                            className={`text-lg font-semibold ${
                              skill.remaining === 0 ? 'text-red-600' : 'text-green-600'
                            }`}
                          >
                            {skill.remaining}
                          </div>
                          <div className="text-xs text-slate-500">Remaining</div>
                        </div>
                      </div>

                      {/* Warning for maxed out */}
                      {isOverloaded && (
                        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                          This specialization is at or near capacity
                        </div>
                      )}
                      {isLow && skill.remaining > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                          <TrendingUp className="h-3.5 w-3.5 shrink-0" />
                          {skill.remaining} hours of capacity available
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
