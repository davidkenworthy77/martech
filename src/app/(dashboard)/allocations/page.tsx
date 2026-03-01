'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Loader2, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getAvailableHours,
  getCurrentWeekStart,
  getUtilizationColor,
  getUtilizationPercent,
  navigateWeek,
} from '@/lib/capacity'
import { WeekPicker } from '@/components/week-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type {
  Holiday,
  Project,
  TeamMember,
  TimeOff,
  WeeklyAllocation,
} from '@/lib/types/database'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AllocationMap = Record<string, Record<string, number>>
// allocationMap[teamMemberId][projectId] = hours_allocated

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildAllocationMap(allocations: WeeklyAllocation[]): AllocationMap {
  const map: AllocationMap = {}
  for (const a of allocations) {
    if (!map[a.team_member_id]) map[a.team_member_id] = {}
    map[a.team_member_id][a.project_id] = a.hours_allocated
  }
  return map
}

/** Collect the unique set of project IDs that appear in allocations */
function activeProjectIds(allocationMap: AllocationMap): Set<string> {
  const ids = new Set<string>()
  for (const memberProjects of Object.values(allocationMap)) {
    for (const pid of Object.keys(memberProjects)) {
      ids.add(pid)
    }
  }
  return ids
}

/** Short project label for column headers */
function projectLabel(p: Project): string {
  if (p.project_id_display) return p.project_id_display
  return p.project_name.length > 18
    ? p.project_name.slice(0, 16) + '...'
    : p.project_name
}

// ---------------------------------------------------------------------------
// Inline editable cell
// ---------------------------------------------------------------------------

function AllocationCell({
  value,
  onChange,
}: {
  value: number
  onChange: (v: number) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDraft(String(value))
  }, [value])

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  function commit() {
    setEditing(false)
    const parsed = parseFloat(draft)
    if (isNaN(parsed) || parsed < 0) {
      setDraft(String(value))
      return
    }
    const rounded = Math.round(parsed * 2) / 2 // snap to 0.5
    if (rounded !== value) {
      onChange(rounded)
    }
    setDraft(String(rounded))
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        step="0.5"
        min="0"
        max="60"
        className="h-7 w-14 rounded border border-blue-400 bg-white px-1.5 text-center text-sm font-medium shadow-sm outline-none focus:ring-2 focus:ring-blue-500"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setDraft(String(value))
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      className={cn(
        'flex h-7 w-14 items-center justify-center rounded text-sm font-medium transition-colors',
        value > 0
          ? 'bg-blue-50 text-blue-700 hover:bg-blue-100'
          : 'text-muted-foreground hover:bg-slate-100'
      )}
      onClick={() => setEditing(true)}
    >
      {value > 0 ? value : '-'}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Add allocation dialog
// ---------------------------------------------------------------------------

function AddAllocationDialog({
  open,
  onOpenChange,
  members,
  projects,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  members: TeamMember[]
  projects: Project[]
  onAdd: (memberId: string, projectId: string, hours: number) => void
}) {
  const [memberId, setMemberId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [hours, setHours] = useState('8')

  function handleSubmit() {
    if (!memberId || !projectId) return
    const h = parseFloat(hours)
    if (isNaN(h) || h <= 0) return
    onAdd(memberId, projectId, Math.round(h * 2) / 2)
    setMemberId('')
    setProjectId('')
    setHours('8')
    onOpenChange(false)
  }

  const pmMembers = members.filter((m) => m.department === 'PM')
  const devMembers = members.filter((m) => m.department === 'Dev')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Allocation</DialogTitle>
          <DialogDescription>
            Assign hours for a team member on a project this week.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="add-member">Team Member</Label>
            <Select value={memberId} onValueChange={setMemberId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {pmMembers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>PM Team</SelectLabel>
                    {pmMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {devMembers.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Dev Team</SelectLabel>
                    {devMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-project">Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.project_name} ({p.client_name})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="add-hours">Hours</Label>
            <Input
              id="add-hours"
              type="number"
              step="0.5"
              min="0.5"
              max="60"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-24"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!memberId || !projectId}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AllocationsPage() {
  const supabase = useMemo(() => createClient(), [])

  // ---- State ----
  const [weekStarting, setWeekStarting] = useState(getCurrentWeekStart)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [allocations, setAllocations] = useState<WeeklyAllocation[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [loading, setLoading] = useState(true)
  const [copying, setCopying] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)

  // Derived
  const allocationMap = useMemo(() => buildAllocationMap(allocations), [allocations])

  // ---- Data fetching ----

  const fetchData = useCallback(
    async (week: string) => {
      setLoading(true)
      const [membersRes, projectsRes, allocRes, holidaysRes, timeOffRes] =
        await Promise.all([
          supabase
            .from('team_members')
            .select('*')
            .eq('is_active', true)
            .order('name'),
          supabase
            .from('projects')
            .select('*')
            .in('status', ['Active', 'Planning'])
            .order('project_name'),
          supabase
            .from('weekly_allocations')
            .select('*')
            .eq('week_starting', week),
          supabase.from('holidays').select('*'),
          supabase.from('time_off').select('*').eq('status', 'Approved'),
        ])

      if (membersRes.data) setMembers(membersRes.data)
      if (projectsRes.data) setProjects(projectsRes.data)
      if (allocRes.data) setAllocations(allocRes.data)
      if (holidaysRes.data) setHolidays(holidaysRes.data)
      if (timeOffRes.data) setTimeOff(timeOffRes.data)
      setLoading(false)
    },
    [supabase]
  )

  useEffect(() => {
    fetchData(weekStarting)
  }, [weekStarting, fetchData])

  // ---- Grouped members ----

  const pmMembers = useMemo(
    () => members.filter((m) => m.department === 'PM'),
    [members]
  )
  const devMembers = useMemo(
    () => members.filter((m) => m.department === 'Dev'),
    [members]
  )

  // ---- Visible projects (union of all allocated projects + all active projects) ----

  const visibleProjects = useMemo(() => {
    const allocPids = activeProjectIds(allocationMap)
    // Show allocated projects first, then remaining projects
    const allocated: Project[] = []
    const rest: Project[] = []
    for (const p of projects) {
      if (allocPids.has(p.id)) {
        allocated.push(p)
      } else {
        rest.push(p)
      }
    }
    return [...allocated, ...rest]
  }, [projects, allocationMap])

  // ---- Upsert a single allocation (optimistic) ----

  const upsertAllocation = useCallback(
    async (memberId: string, projectId: string, hours: number) => {
      // Optimistic update
      setAllocations((prev) => {
        const existing = prev.find(
          (a) =>
            a.team_member_id === memberId &&
            a.project_id === projectId &&
            a.week_starting === weekStarting
        )
        if (hours === 0) {
          // Remove the allocation
          return prev.filter((a) => a !== existing)
        }
        if (existing) {
          return prev.map((a) =>
            a === existing ? { ...a, hours_allocated: hours } : a
          )
        }
        // Create new
        const newAlloc: WeeklyAllocation = {
          id: crypto.randomUUID(),
          team_member_id: memberId,
          project_id: projectId,
          week_starting: weekStarting,
          hours_allocated: hours,
          hours_actual: null,
          notes: null,
          role_on_project: null,
          created_at: new Date().toISOString(),
        }
        return [...prev, newAlloc]
      })

      // Persist
      if (hours === 0) {
        await supabase
          .from('weekly_allocations')
          .delete()
          .eq('team_member_id', memberId)
          .eq('project_id', projectId)
          .eq('week_starting', weekStarting)
      } else {
        await supabase.from('weekly_allocations').upsert(
          {
            team_member_id: memberId,
            project_id: projectId,
            week_starting: weekStarting,
            hours_allocated: hours,
          },
          { onConflict: 'week_starting,team_member_id,project_id' }
        )
      }
    },
    [supabase, weekStarting]
  )

  // ---- Copy previous week ----

  const copyPreviousWeek = useCallback(async () => {
    setCopying(true)
    const prevWeek = navigateWeek(weekStarting, -1)
    const { data: prevAllocations } = await supabase
      .from('weekly_allocations')
      .select('*')
      .eq('week_starting', prevWeek)

    if (!prevAllocations || prevAllocations.length === 0) {
      setCopying(false)
      return
    }

    // Build new allocations for current week
    const newAllocations = prevAllocations.map((a) => ({
      team_member_id: a.team_member_id,
      project_id: a.project_id,
      week_starting: weekStarting,
      hours_allocated: a.hours_allocated,
      role_on_project: a.role_on_project,
    }))

    // Upsert all
    const { error } = await supabase
      .from('weekly_allocations')
      .upsert(newAllocations, {
        onConflict: 'week_starting,team_member_id,project_id',
      })

    if (!error) {
      // Re-fetch current week
      const { data } = await supabase
        .from('weekly_allocations')
        .select('*')
        .eq('week_starting', weekStarting)
      if (data) setAllocations(data)
    }
    setCopying(false)
  }, [supabase, weekStarting])

  // ---- Add allocation handler ----

  const handleAddAllocation = useCallback(
    (memberId: string, projectId: string, hours: number) => {
      upsertAllocation(memberId, projectId, hours)
    },
    [upsertAllocation]
  )

  // ---- Per-member summaries ----

  function getMemberSummary(member: TeamMember) {
    const memberAllocs = allocationMap[member.id] || {}
    const totalAllocated = Object.values(memberAllocs).reduce(
      (sum, h) => sum + h,
      0
    )
    const capacity = getAvailableHours(member, weekStarting, holidays, timeOff)
    const remaining = capacity - totalAllocated
    const utilization = getUtilizationPercent(totalAllocated, capacity)
    return { totalAllocated, capacity, remaining, utilization }
  }

  // ---- Per-project totals ----

  function getProjectTotal(projectId: string): number {
    let total = 0
    for (const memberAllocs of Object.values(allocationMap)) {
      if (memberAllocs[projectId]) {
        total += memberAllocs[projectId]
      }
    }
    return total
  }

  // Grand totals
  const grandTotalAllocated = useMemo(() => {
    let total = 0
    for (const memberAllocs of Object.values(allocationMap)) {
      for (const h of Object.values(memberAllocs)) {
        total += h
      }
    }
    return total
  }, [allocationMap])

  const grandTotalCapacity = useMemo(() => {
    return members.reduce(
      (sum, m) => sum + getAvailableHours(m, weekStarting, holidays, timeOff),
      0
    )
  }, [members, weekStarting, holidays, timeOff])

  // ---- Render helpers ----

  function renderMemberRow(member: TeamMember) {
    const { totalAllocated, capacity, remaining, utilization } =
      getMemberSummary(member)
    const utilClass = getUtilizationColor(utilization)

    return (
      <tr
        key={member.id}
        className="group border-b border-slate-100 transition-colors hover:bg-slate-50/60"
      >
        {/* Name */}
        <td className="sticky left-0 z-10 bg-white px-4 py-2 group-hover:bg-slate-50/60">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {member.name
                .split(' ')
                .map((n) => n[0])
                .join('')
                .slice(0, 2)}
            </div>
            <div>
              <div className="text-sm font-medium text-slate-900">
                {member.name}
              </div>
              <div className="text-xs text-slate-500">{member.role}</div>
            </div>
          </div>
        </td>

        {/* Project columns */}
        {visibleProjects.map((project) => {
          const hours =
            allocationMap[member.id]?.[project.id] ?? 0
          return (
            <td
              key={project.id}
              className="px-1.5 py-2 text-center"
            >
              <AllocationCell
                value={hours}
                onChange={(v) => upsertAllocation(member.id, project.id, v)}
              />
            </td>
          )
        })}

        {/* Summary columns */}
        <td className="border-l border-slate-200 px-3 py-2 text-center">
          <span className="text-sm font-semibold text-slate-900">
            {totalAllocated}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          <span className="text-sm text-slate-600">{capacity}</span>
        </td>
        <td className="px-3 py-2 text-center">
          <span
            className={cn(
              'text-sm font-medium',
              remaining < 0 ? 'text-red-600' : 'text-slate-600'
            )}
          >
            {remaining}
          </span>
        </td>
        <td className="px-3 py-2 text-center">
          <Badge
            variant="secondary"
            className={cn('text-xs font-semibold tabular-nums', utilClass)}
          >
            {utilization}%
          </Badge>
        </td>
      </tr>
    )
  }

  function renderGroupHeader(label: string, count: number, colorClass: string) {
    return (
      <tr key={`group-${label}`}>
        <td
          colSpan={visibleProjects.length + 5}
          className={cn(
            'sticky left-0 z-10 px-4 py-2 text-xs font-bold uppercase tracking-wider',
            colorClass
          )}
        >
          {label}{' '}
          <span className="ml-1 font-normal text-slate-500">
            ({count} {count === 1 ? 'member' : 'members'})
          </span>
        </td>
      </tr>
    )
  }

  // ---- Main render ----

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col">
        {/* Top bar */}
        <div className="shrink-0 border-b bg-white px-6 py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Weekly Allocations
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Assign and manage team hours across projects
              </p>
            </div>
            <div className="flex items-center gap-3">
              <WeekPicker
                weekStarting={weekStarting}
                onChange={setWeekStarting}
              />
            </div>
          </div>

          {/* Action bar */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={copyPreviousWeek}
              disabled={copying || loading}
            >
              {copying ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Copy className="mr-1.5 h-4 w-4" />
              )}
              Copy Previous Week
            </Button>
            <Button size="sm" onClick={() => setAddDialogOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Add Allocation
            </Button>

            {/* Quick stats */}
            <div className="ml-auto flex items-center gap-4 text-xs text-slate-500">
              <span>
                Total Allocated:{' '}
                <span className="font-semibold text-slate-900">
                  {grandTotalAllocated}h
                </span>
              </span>
              <span>
                Total Capacity:{' '}
                <span className="font-semibold text-slate-900">
                  {grandTotalCapacity}h
                </span>
              </span>
              <span>
                Team Utilization:{' '}
                <span
                  className={cn(
                    'font-semibold',
                    getUtilizationColor(
                      getUtilizationPercent(grandTotalAllocated, grandTotalCapacity)
                    )
                      .split(' ')
                      .find((c) => c.startsWith('text-')) || ''
                  )}
                >
                  {getUtilizationPercent(grandTotalAllocated, grandTotalCapacity)}%
                </span>
              </span>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-slate-500">
              <p className="text-sm">No active team members found.</p>
            </div>
          ) : (
            <div className="min-w-full overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                {/* Header */}
                <thead className="sticky top-0 z-20 bg-white shadow-[0_1px_0_0_theme(colors.slate.200)]">
                  <tr>
                    <th className="sticky left-0 z-30 bg-white px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Team Member
                    </th>

                    {visibleProjects.map((p) => (
                      <th
                        key={p.id}
                        className="px-1.5 py-3 text-center"
                      >
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex flex-col items-center gap-0.5">
                              <span className="max-w-[80px] truncate text-xs font-semibold text-slate-700">
                                {projectLabel(p)}
                              </span>
                              <span className="text-[10px] text-slate-400 max-w-[80px] truncate">
                                {p.client_name}
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {p.project_name} - {p.client_name}
                            </p>
                            <p className="text-muted-foreground">
                              {p.status} | {p.project_type}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </th>
                    ))}

                    <th className="border-l border-slate-200 px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Allocated
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Capacity
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Remaining
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Util %
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* PM Team */}
                  {pmMembers.length > 0 && (
                    <>
                      {renderGroupHeader(
                        'PM Team',
                        pmMembers.length,
                        'bg-purple-50 text-purple-700 border-b border-purple-100'
                      )}
                      {pmMembers.map(renderMemberRow)}
                    </>
                  )}

                  {/* Dev Team */}
                  {devMembers.length > 0 && (
                    <>
                      {renderGroupHeader(
                        'Dev Team',
                        devMembers.length,
                        'bg-sky-50 text-sky-700 border-b border-sky-100'
                      )}
                      {devMembers.map(renderMemberRow)}
                    </>
                  )}

                  {/* Totals row */}
                  <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-xs uppercase tracking-wider text-slate-600">
                      Totals
                    </td>
                    {visibleProjects.map((p) => {
                      const total = getProjectTotal(p.id)
                      return (
                        <td
                          key={p.id}
                          className="px-1.5 py-3 text-center"
                        >
                          <span
                            className={cn(
                              'text-sm font-semibold',
                              total > 0 ? 'text-slate-900' : 'text-slate-300'
                            )}
                          >
                            {total > 0 ? total : '-'}
                          </span>
                        </td>
                      )
                    })}
                    <td className="border-l border-slate-200 px-3 py-3 text-center text-sm text-slate-900">
                      {grandTotalAllocated}
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-slate-600">
                      {grandTotalCapacity}
                    </td>
                    <td className="px-3 py-3 text-center text-sm">
                      <span
                        className={cn(
                          grandTotalCapacity - grandTotalAllocated < 0
                            ? 'text-red-600'
                            : 'text-slate-600'
                        )}
                      >
                        {grandTotalCapacity - grandTotalAllocated}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge
                        variant="secondary"
                        className={cn(
                          'text-xs font-semibold',
                          getUtilizationColor(
                            getUtilizationPercent(
                              grandTotalAllocated,
                              grandTotalCapacity
                            )
                          )
                        )}
                      >
                        {getUtilizationPercent(
                          grandTotalAllocated,
                          grandTotalCapacity
                        )}
                        %
                      </Badge>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add Allocation Dialog */}
        <AddAllocationDialog
          open={addDialogOpen}
          onOpenChange={setAddDialogOpen}
          members={members}
          projects={projects}
          onAdd={handleAddAllocation}
        />
      </div>
    </TooltipProvider>
  )
}
