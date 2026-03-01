'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TeamMember, Project, WeeklyAllocation, TimeOff, Holiday } from '@/lib/types/database'
import {
  getCurrentWeekStart,
  getAvailableHours,
  getUtilizationPercent,
  getUtilizationColor,
  getUtilizationBgColor,
} from '@/lib/capacity'
import { WeekPicker } from '@/components/week-picker'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import {
  Users,
  AlertTriangle,
  TrendingUp,
  CalendarDays,
  FolderKanban,
  Loader2,
} from 'lucide-react'
import { format, parseISO, addDays } from 'date-fns'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MemberUtilization {
  id: string
  name: string
  department: string
  availableHours: number
  allocatedHours: number
  utilization: number
}

interface ProjectSummary {
  id: string
  projectName: string
  clientName: string
  projectType: string
  totalHours: number
  status: string | null
}

interface UpcomingPto {
  id: string
  memberName: string
  startDate: string
  endDate: string
  days: number | null
  type: string | null
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROJECT_TYPE_COLORS: Record<string, string> = {
  'Full Website': 'bg-blue-100 text-blue-800',
  'Service Agreement': 'bg-purple-100 text-purple-800',
  'Banner/Email': 'bg-orange-100 text-orange-800',
  'Internal': 'bg-gray-100 text-gray-700',
}

function getProjectTypeBadgeClass(type: string): string {
  return PROJECT_TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-700'
}

// ---------------------------------------------------------------------------
// Custom Recharts Tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: MemberUtilization }>
}) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="rounded-lg border bg-white px-3 py-2 shadow-md">
      <p className="text-sm font-semibold">{data.name}</p>
      <p className="text-xs text-muted-foreground">{data.department}</p>
      <Separator className="my-1.5" />
      <p className="text-sm">
        Utilization:{' '}
        <span className="font-medium">{data.utilization}%</span>
      </p>
      <p className="text-xs text-muted-foreground">
        {data.allocatedHours}h allocated / {data.availableHours}h available
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard Page
// ---------------------------------------------------------------------------

export default function DashboardPage() {
  const [weekStarting, setWeekStarting] = useState(getCurrentWeekStart)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [allocations, setAllocations] = useState<WeeklyAllocation[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)

  // -----------------------------------------------------------------------
  // Data fetching
  // -----------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [
      { data: members },
      { data: projectsData },
      { data: allocData },
      { data: timeOffData },
      { data: holidayData },
    ] = await Promise.all([
      supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('projects')
        .select('*')
        .eq('status', 'Active')
        .order('project_name'),
      supabase
        .from('weekly_allocations')
        .select('*')
        .eq('week_starting', weekStarting),
      supabase
        .from('time_off')
        .select('*')
        .eq('status', 'Approved'),
      supabase.from('holidays').select('*'),
    ])

    setTeamMembers(members ?? [])
    setProjects(projectsData ?? [])
    setAllocations(allocData ?? [])
    setTimeOff(timeOffData ?? [])
    setHolidays(holidayData ?? [])
    setLoading(false)
  }, [weekStarting])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  const memberUtilizations: MemberUtilization[] = useMemo(() => {
    return teamMembers.map((m) => {
      const available = getAvailableHours(m, weekStarting, holidays, timeOff)
      const allocated = allocations
        .filter((a) => a.team_member_id === m.id)
        .reduce((sum, a) => sum + a.hours_allocated, 0)
      const utilization = getUtilizationPercent(allocated, available)
      return {
        id: m.id,
        name: m.name,
        department: m.department,
        availableHours: available,
        allocatedHours: allocated,
        utilization,
      }
    })
  }, [teamMembers, allocations, weekStarting, holidays, timeOff])

  const departmentStats = useMemo(() => {
    const pm = memberUtilizations.filter((m) => m.department === 'PM')
    const dev = memberUtilizations.filter((m) => m.department === 'Dev')

    const avg = (members: MemberUtilization[]) => {
      if (members.length === 0) return 0
      const totalAllocated = members.reduce((s, m) => s + m.allocatedHours, 0)
      const totalAvailable = members.reduce((s, m) => s + m.availableHours, 0)
      return getUtilizationPercent(totalAllocated, totalAvailable)
    }

    return {
      pm: { count: pm.length, utilization: avg(pm) },
      dev: { count: dev.length, utilization: avg(dev) },
      overall: {
        count: memberUtilizations.length,
        utilization: avg(memberUtilizations),
      },
    }
  }, [memberUtilizations])

  const alerts = useMemo(() => {
    const overloaded = memberUtilizations.filter((m) => m.utilization > 95)
    const underutilized = memberUtilizations.filter(
      (m) => m.utilization < 70 && m.availableHours > 0
    )
    return { overloaded, underutilized }
  }, [memberUtilizations])

  const projectSummaries: ProjectSummary[] = useMemo(() => {
    return projects
      .map((p) => {
        const totalHours = allocations
          .filter((a) => a.project_id === p.id)
          .reduce((s, a) => s + a.hours_allocated, 0)
        return {
          id: p.id,
          projectName: p.project_name,
          clientName: p.client_name,
          projectType: p.project_type,
          totalHours,
          status: p.status,
        }
      })
      .filter((p) => p.totalHours > 0)
      .sort((a, b) => b.totalHours - a.totalHours)
  }, [projects, allocations])

  const upcomingPto: UpcomingPto[] = useMemo(() => {
    const today = new Date()
    const thirtyDaysOut = addDays(today, 30)
    const todayStr = format(today, 'yyyy-MM-dd')
    const futureStr = format(thirtyDaysOut, 'yyyy-MM-dd')

    return timeOff
      .filter((t) => t.end_date >= todayStr && t.start_date <= futureStr)
      .map((t) => {
        const member = teamMembers.find((m) => m.id === t.team_member_id)
        return {
          id: t.id,
          memberName: member?.name ?? 'Unknown',
          startDate: t.start_date,
          endDate: t.end_date,
          days: t.days,
          type: t.type,
        }
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
  }, [timeOff, teamMembers])

  // Chart data: sorted by utilization descending for visual clarity
  const chartData = useMemo(
    () => [...memberUtilizations].sort((a, b) => a.utilization - b.utilization),
    [memberUtilizations]
  )

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Weekly capacity overview for your team
          </p>
        </div>
        <WeekPicker weekStarting={weekStarting} onChange={setWeekStarting} />
      </div>

      {/* Department Utilization Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <UtilizationCard
          title="PM Team"
          icon={<Users className="h-4 w-4 text-blue-600" />}
          utilization={departmentStats.pm.utilization}
          memberCount={departmentStats.pm.count}
          accentColor="blue"
        />
        <UtilizationCard
          title="Dev Team"
          icon={<Users className="h-4 w-4 text-emerald-600" />}
          utilization={departmentStats.dev.utilization}
          memberCount={departmentStats.dev.count}
          accentColor="emerald"
        />
        <UtilizationCard
          title="Overall"
          icon={<TrendingUp className="h-4 w-4 text-slate-600" />}
          utilization={departmentStats.overall.utilization}
          memberCount={departmentStats.overall.count}
          accentColor="slate"
        />
      </div>

      {/* Main content: chart + alerts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Team Utilization Bar Chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Team Utilization</CardTitle>
            <CardDescription>
              Individual utilization for the selected week
            </CardDescription>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No team members found.
              </p>
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(300, chartData.length * 40 + 40)}
              >
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 0, right: 32, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="#e2e8f0"
                  />
                  <XAxis
                    type="number"
                    domain={[0, 120]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 12, fill: '#64748b' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: '#334155' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    content={<ChartTooltip />}
                    cursor={{ fill: '#f1f5f9' }}
                  />
                  <ReferenceLine
                    x={70}
                    stroke="#eab308"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: '70%',
                      position: 'top',
                      fontSize: 11,
                      fill: '#a16207',
                    }}
                  />
                  <ReferenceLine
                    x={95}
                    stroke="#ef4444"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: '95%',
                      position: 'top',
                      fontSize: 11,
                      fill: '#dc2626',
                    }}
                  />
                  <Bar dataKey="utilization" radius={[0, 4, 4, 0]} barSize={20}>
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.id}
                        fill={
                          entry.department === 'PM' ? '#3b82f6' : '#10b981'
                        }
                        fillOpacity={
                          entry.utilization > 95
                            ? 1
                            : entry.utilization < 70
                              ? 0.5
                              : 0.85
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
                PM
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
                Dev
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 border-l-2 border-dashed border-yellow-500" />
                70% target
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-0.5 border-l-2 border-dashed border-red-500" />
                95% cap
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Capacity Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Capacity Alerts
            </CardTitle>
            <CardDescription>
              {alerts.overloaded.length + alerts.underutilized.length === 0
                ? 'No alerts this week'
                : `${alerts.overloaded.length + alerts.underutilized.length} alert${alerts.overloaded.length + alerts.underutilized.length !== 1 ? 's' : ''}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-3">
                {alerts.overloaded.length === 0 &&
                  alerts.underutilized.length === 0 && (
                    <p className="py-4 text-center text-sm text-muted-foreground">
                      All team members are within normal utilization range.
                    </p>
                  )}

                {alerts.overloaded.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-600">
                      Overloaded ({'>'}95%)
                    </p>
                    {alerts.overloaded.map((m) => (
                      <AlertRow
                        key={m.id}
                        name={m.name}
                        department={m.department}
                        utilization={m.utilization}
                        variant="red"
                      />
                    ))}
                  </div>
                )}

                {alerts.overloaded.length > 0 &&
                  alerts.underutilized.length > 0 && (
                    <Separator />
                  )}

                {alerts.underutilized.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-yellow-600">
                      Under-utilized ({'<'}70%)
                    </p>
                    {alerts.underutilized.map((m) => (
                      <AlertRow
                        key={m.id}
                        name={m.name}
                        department={m.department}
                        utilization={m.utilization}
                        variant="yellow"
                      />
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Bottom row: Active Projects + Upcoming PTO */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Active Projects */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FolderKanban className="h-4 w-4 text-slate-500" />
              Active Projects
            </CardTitle>
            <CardDescription>
              Projects with allocations this week, sorted by hours
            </CardDescription>
          </CardHeader>
          <CardContent>
            {projectSummaries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No projects with allocations this week.
              </p>
            ) : (
              <div className="space-y-3">
                {projectSummaries.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {p.projectName}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {p.clientName}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        variant="secondary"
                        className={getProjectTypeBadgeClass(p.projectType)}
                      >
                        {p.projectType}
                      </Badge>
                      <span className="min-w-[48px] text-right text-sm font-semibold tabular-nums">
                        {p.totalHours}h
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming PTO */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4 text-slate-500" />
              Upcoming Time Off
            </CardTitle>
            <CardDescription>
              Approved time off in the next 30 days
            </CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingPto.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No upcoming time off in the next 30 days.
              </p>
            ) : (
              <div className="space-y-3">
                {upcomingPto.map((pto) => (
                  <div
                    key={pto.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{pto.memberName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateRange(pto.startDate, pto.endDate)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {pto.type && (
                        <span className="text-xs text-muted-foreground">
                          {pto.type}
                        </span>
                      )}
                      {pto.days != null && (
                        <Badge variant="outline" className="tabular-nums">
                          {pto.days}d
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UtilizationCard({
  title,
  icon,
  utilization,
  memberCount,
  accentColor,
}: {
  title: string
  icon: React.ReactNode
  utilization: number
  memberCount: number
  accentColor: 'blue' | 'emerald' | 'slate'
}) {
  const colorClasses = getUtilizationColor(utilization)
  const progressColor = getUtilizationBgColor(utilization)
  const bgMap = {
    blue: 'bg-blue-50',
    emerald: 'bg-emerald-50',
    slate: 'bg-slate-100',
  }

  return (
    <Card>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-lg ${bgMap[accentColor]}`}
            >
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">
                {title}
              </p>
              <p className="text-xs text-muted-foreground">
                {memberCount} member{memberCount !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{utilization}%</p>
          </div>
        </div>
        {/* Utilization bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(utilization, 100)}%`,
              backgroundColor: progressColor,
            }}
          />
        </div>
        <div className="mt-1.5 flex justify-between">
          <span className="text-[11px] text-muted-foreground">0%</span>
          <Badge variant="secondary" className={`text-[11px] ${colorClasses}`}>
            {utilization >= 95
              ? 'Over capacity'
              : utilization >= 85
                ? 'High'
                : utilization >= 70
                  ? 'Healthy'
                  : 'Low'}
          </Badge>
          <span className="text-[11px] text-muted-foreground">100%</span>
        </div>
      </CardContent>
    </Card>
  )
}

function AlertRow({
  name,
  department,
  utilization,
  variant,
}: {
  name: string
  department: string
  utilization: number
  variant: 'red' | 'yellow'
}) {
  const bg = variant === 'red' ? 'bg-red-50' : 'bg-yellow-50'
  const text = variant === 'red' ? 'text-red-700' : 'text-yellow-700'
  const badgeBg =
    variant === 'red'
      ? 'bg-red-100 text-red-800'
      : 'bg-yellow-100 text-yellow-800'

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 ${bg}`}>
      <div>
        <p className={`text-sm font-medium ${text}`}>{name}</p>
        <p className="text-xs text-muted-foreground">{department}</p>
      </div>
      <Badge variant="secondary" className={`tabular-nums ${badgeBg}`}>
        {utilization}%
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(start: string, end: string): string {
  const s = parseISO(start)
  const e = parseISO(end)
  if (start === end) {
    return format(s, 'MMM d, yyyy')
  }
  if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth()) {
    return `${format(s, 'MMM d')} - ${format(e, 'd, yyyy')}`
  }
  return `${format(s, 'MMM d')} - ${format(e, 'MMM d, yyyy')}`
}
