'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TeamMember, WeeklyAllocation, Project, Holiday, TimeOff } from '@/lib/types/database'
import {
  getAvailableHours,
  getUtilizationPercent,
  getUtilizationColor,
  getCurrentWeekStart,
  getWeekLabel,
  getHolidayHoursForWeek,
  getPtoHoursForWeek,
} from '@/lib/capacity'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Users,
  MapPin,
  Clock,
  Briefcase,
  ChevronRight,
  Save,
  X,
  Loader2,
  Search,
  UserPlus,
  Pencil,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function departmentBadge(department: string) {
  switch (department) {
    case 'PM':
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200">
          PM
        </Badge>
      )
    case 'Dev':
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200">
          Dev
        </Badge>
      )
    default:
      return <Badge variant="secondary">{department}</Badge>
  }
}

function locationBadge(location: string) {
  switch (location) {
    case 'USA':
      return (
        <Badge
          variant="outline"
          className="bg-indigo-50 text-indigo-600 border-indigo-200"
        >
          USA
        </Badge>
      )
    case 'Canada':
      return (
        <Badge
          variant="outline"
          className="bg-red-50 text-red-600 border-red-200"
        >
          Canada
        </Badge>
      )
    case 'UK':
      return (
        <Badge
          variant="outline"
          className="bg-amber-50 text-amber-600 border-amber-200"
        >
          UK
        </Badge>
      )
    default:
      return <Badge variant="outline">{location}</Badge>
  }
}

// ---------------------------------------------------------------------------
// Types for joined data
// ---------------------------------------------------------------------------

type AllocationWithProject = WeeklyAllocation & {
  project: Project | null
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TeamPage() {
  const supabase = createClient()
  const weekStarting = getCurrentWeekStart()

  // ---- Data state ----
  const [members, setMembers] = useState<TeamMember[]>([])
  const [allocations, setAllocations] = useState<AllocationWithProject[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [timeOff, setTimeOff] = useState<TimeOff[]>([])
  const [projects, setProjects] = useState<Project[]>([])

  // ---- UI state ----
  const [loading, setLoading] = useState(true)
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // ---- Edit state (for Sheet) ----
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editRole, setEditRole] = useState('')
  const [editDepartment, setEditDepartment] = useState<string>('PM')
  const [editLocation, setEditLocation] = useState<string>('USA')
  const [editWeeklyHours, setEditWeeklyHours] = useState<number>(40)
  const [editAdminHours, setEditAdminHours] = useState<number>(4)
  const [editSpecializations, setEditSpecializations] = useState<string>('')
  const [editReportsTo, setEditReportsTo] = useState<string>('')
  const [editSpecialNotes, setEditSpecialNotes] = useState<string>('')
  const [saving, setSaving] = useState(false)

  // ---- Add member dialog state ----
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('')
  const [newDepartment, setNewDepartment] = useState<string>('Dev')
  const [newLocation, setNewLocation] = useState<string>('USA')
  const [newWeeklyHours, setNewWeeklyHours] = useState<number>(40)
  const [newAdminHours, setNewAdminHours] = useState<number>(4)
  const [newSpecializations, setNewSpecializations] = useState<string>('')
  const [newReportsTo, setNewReportsTo] = useState<string>('')
  const [newSpecialNotes, setNewSpecialNotes] = useState<string>('')
  const [addingSaving, setAddingSaving] = useState(false)

  // ---- Fetch all data ----
  const fetchData = useCallback(async () => {
    setLoading(true)
    const [membersRes, allocationsRes, holidaysRes, timeOffRes, projectsRes] =
      await Promise.all([
        supabase
          .from('team_members')
          .select('*')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('weekly_allocations')
          .select('*')
          .eq('week_starting', weekStarting),
        supabase.from('holidays').select('*'),
        supabase.from('time_off').select('*').eq('status', 'Approved'),
        supabase.from('projects').select('*'),
      ])

    if (membersRes.data) setMembers(membersRes.data)
    if (holidaysRes.data) setHolidays(holidaysRes.data)
    if (timeOffRes.data) setTimeOff(timeOffRes.data)
    if (projectsRes.data) setProjects(projectsRes.data)

    if (allocationsRes.data && projectsRes.data) {
      const joined: AllocationWithProject[] = allocationsRes.data.map((a) => ({
        ...a,
        project:
          projectsRes.data.find((p) => p.id === a.project_id) ?? null,
      }))
      setAllocations(joined)
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStarting])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---- Derived data ----
  const membersMap = useMemo(() => {
    const map = new Map<string, TeamMember>()
    members.forEach((m) => map.set(m.id, m))
    return map
  }, [members])

  const filteredMembers = useMemo(() => {
    let filtered = members

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(
        (m) => m.department.toLowerCase() === departmentFilter
      )
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.role.toLowerCase().includes(q) ||
          m.location.toLowerCase().includes(q) ||
          (m.specializations ?? []).some((s) => s.toLowerCase().includes(q))
      )
    }

    return filtered
  }, [members, departmentFilter, searchQuery])

  function getMemberAllocations(memberId: string): AllocationWithProject[] {
    return allocations.filter((a) => a.team_member_id === memberId)
  }

  function getTotalAllocated(memberId: string): number {
    return getMemberAllocations(memberId).reduce(
      (sum, a) => sum + a.hours_allocated,
      0
    )
  }

  // ---- Sheet handlers ----
  function openMemberSheet(member: TeamMember) {
    setSelectedMember(member)
    setEditName(member.name)
    setEditRole(member.role)
    setEditDepartment(member.department)
    setEditLocation(member.location)
    setEditWeeklyHours(member.weekly_hours ?? 40)
    setEditAdminHours(member.admin_hours ?? 4)
    setEditSpecializations((member.specializations ?? []).join(', '))
    setEditReportsTo(member.reports_to ?? '')
    setEditSpecialNotes(member.special_notes ?? '')
    setEditing(false)
    setSheetOpen(true)
  }

  async function handleSave() {
    if (!selectedMember) return
    setSaving(true)

    const specializations = editSpecializations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const updates = {
      name: editName.trim(),
      role: editRole.trim(),
      department: editDepartment,
      location: editLocation,
      weekly_hours: editWeeklyHours,
      admin_hours: editAdminHours,
      specializations,
      reports_to: editReportsTo || null,
      special_notes: editSpecialNotes.trim() || null,
    }

    const { error } = await supabase
      .from('team_members')
      .update(updates)
      .eq('id', selectedMember.id)

    if (!error) {
      const updatedMember = { ...selectedMember, ...updates }
      setMembers((prev) =>
        prev.map((m) => (m.id === selectedMember.id ? updatedMember : m))
      )
      setSelectedMember(updatedMember)
      setEditing(false)
    }

    setSaving(false)
  }

  async function handleAddMember() {
    if (!newName.trim() || !newRole.trim()) return
    setAddingSaving(true)

    const specializations = newSpecializations
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    const { data, error } = await supabase
      .from('team_members')
      .insert({
        name: newName.trim(),
        role: newRole.trim(),
        department: newDepartment,
        location: newLocation,
        weekly_hours: newWeeklyHours,
        admin_hours: newAdminHours,
        specializations: specializations.length > 0 ? specializations : null,
        reports_to: newReportsTo || null,
        special_notes: newSpecialNotes.trim() || null,
        is_active: true,
      })
      .select()
      .single()

    if (!error && data) {
      setMembers((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setAddDialogOpen(false)
      // Reset form
      setNewName('')
      setNewRole('')
      setNewDepartment('Dev')
      setNewLocation('USA')
      setNewWeeklyHours(40)
      setNewAdminHours(4)
      setNewSpecializations('')
      setNewReportsTo('')
      setNewSpecialNotes('')
    }

    setAddingSaving(false)
  }

  // ---- Counts per department ----
  const counts = useMemo(() => {
    const all = members.length
    const pm = members.filter((m) => m.department === 'PM').length
    const dev = members.filter((m) => m.department === 'Dev').length
    return { all, pm, dev }
  }, [members])

  // ---- Render ----
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Team Members
          </h1>
          <p className="text-sm text-slate-500">
            Manage your team, view capacity, and edit member details.
          </p>
        </div>
        <Button onClick={() => setAddDialogOpen(true)}>
          <UserPlus className="h-4 w-4 mr-2" />
          Add Team Member
        </Button>
      </div>

      {/* Filters row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={departmentFilter}
          onValueChange={setDepartmentFilter}
          className="w-full sm:w-auto"
        >
          <TabsList>
            <TabsTrigger value="all">
              All
              <span className="ml-1.5 rounded-full bg-slate-200 px-1.5 py-0.5 text-xs font-medium text-slate-600">
                {counts.all}
              </span>
            </TabsTrigger>
            <TabsTrigger value="pm">
              PM
              <span className="ml-1.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                {counts.pm}
              </span>
            </TabsTrigger>
            <TabsTrigger value="dev">
              Dev
              <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
                {counts.dev}
              </span>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search by name, role, or skill..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Week indicator */}
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Clock className="h-4 w-4" />
        <span>
          Showing capacity for: <strong>{getWeekLabel(weekStarting)}</strong>
        </span>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="pl-4">Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Location</TableHead>
              <TableHead className="text-right">Weekly Hrs</TableHead>
              <TableHead className="text-right">Admin Hrs</TableHead>
              <TableHead className="text-right">Available</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Utilization</TableHead>
              <TableHead>Specializations</TableHead>
              <TableHead>Reports To</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredMembers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={12}
                  className="py-12 text-center text-slate-400"
                >
                  No team members found.
                </TableCell>
              </TableRow>
            ) : (
              filteredMembers.map((member) => {
                const available = getAvailableHours(
                  member,
                  weekStarting,
                  holidays,
                  timeOff
                )
                const allocated = getTotalAllocated(member.id)
                const utilization = getUtilizationPercent(allocated, available)
                const utilizationStyle = getUtilizationColor(utilization)
                const manager = member.reports_to
                  ? membersMap.get(member.reports_to)
                  : null

                return (
                  <TableRow
                    key={member.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                    onClick={() => openMemberSheet(member)}
                  >
                    <TableCell className="pl-4">
                      <div className="flex items-center gap-3">
                        <Avatar size="sm">
                          <AvatarFallback className="bg-slate-200 text-slate-600 text-xs">
                            {getInitials(member.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-slate-900">
                          {member.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-600">
                      {member.role}
                    </TableCell>
                    <TableCell>{departmentBadge(member.department)}</TableCell>
                    <TableCell>{locationBadge(member.location)}</TableCell>
                    <TableCell className="text-right font-medium text-slate-700">
                      {member.weekly_hours ?? 40}
                    </TableCell>
                    <TableCell className="text-right text-slate-500">
                      {member.admin_hours ?? 4}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-700">
                      {available}
                    </TableCell>
                    <TableCell className="text-right font-medium text-slate-700">
                      {allocated}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${utilizationStyle}`}
                      >
                        {utilization}%
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {(member.specializations ?? [])
                          .slice(0, 3)
                          .map((spec) => (
                            <Badge
                              key={spec}
                              variant="secondary"
                              className="text-xs"
                            >
                              {spec}
                            </Badge>
                          ))}
                        {(member.specializations ?? []).length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{(member.specializations ?? []).length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-slate-500">
                      {manager ? manager.name : '\u2014'}
                    </TableCell>
                    <TableCell>
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col"
        >
          {selectedMember && (
            <MemberDetailPanel
              member={selectedMember}
              membersMap={membersMap}
              allocations={getMemberAllocations(selectedMember.id)}
              holidays={holidays}
              timeOff={timeOff}
              weekStarting={weekStarting}
              editing={editing}
              setEditing={setEditing}
              editName={editName}
              setEditName={setEditName}
              editRole={editRole}
              setEditRole={setEditRole}
              editDepartment={editDepartment}
              setEditDepartment={setEditDepartment}
              editLocation={editLocation}
              setEditLocation={setEditLocation}
              editWeeklyHours={editWeeklyHours}
              setEditWeeklyHours={setEditWeeklyHours}
              editAdminHours={editAdminHours}
              setEditAdminHours={setEditAdminHours}
              editSpecializations={editSpecializations}
              setEditSpecializations={setEditSpecializations}
              editReportsTo={editReportsTo}
              setEditReportsTo={setEditReportsTo}
              editSpecialNotes={editSpecialNotes}
              setEditSpecialNotes={setEditSpecialNotes}
              saving={saving}
              onSave={handleSave}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Add Team Member Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Add a new person to the team. They&apos;ll be available for weekly
              allocations immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label htmlFor="new-name">Full Name *</Label>
                <Input
                  id="new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Jane Smith"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="new-role">Role *</Label>
                <Input
                  id="new-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  placeholder="e.g. Developer, PM"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Department *</Label>
                <Select value={newDepartment} onValueChange={setNewDepartment}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PM">PM</SelectItem>
                    <SelectItem value="Dev">Dev</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location *</Label>
                <Select value={newLocation} onValueChange={setNewLocation}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USA">USA</SelectItem>
                    <SelectItem value="Canada">Canada</SelectItem>
                    <SelectItem value="UK">UK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reports To</Label>
                <Select value={newReportsTo} onValueChange={setNewReportsTo}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {members
                      .filter((m) =>
                        m.role.toLowerCase().includes('lead') ||
                        m.role.toLowerCase().includes('head')
                      )
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </SelectItem>
                      ))}
                    {members
                      .filter(
                        (m) =>
                          !m.role.toLowerCase().includes('lead') &&
                          !m.role.toLowerCase().includes('head')
                      )
                      .map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name} ({m.role})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="new-weekly">Weekly Hours</Label>
                <Input
                  id="new-weekly"
                  type="number"
                  min={0}
                  max={60}
                  value={newWeeklyHours}
                  onChange={(e) => setNewWeeklyHours(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="new-admin">Admin Hours</Label>
                <Input
                  id="new-admin"
                  type="number"
                  min={0}
                  max={40}
                  value={newAdminHours}
                  onChange={(e) => setNewAdminHours(Number(e.target.value))}
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="new-specs">
                  Specializations (comma-separated)
                </Label>
                <Input
                  id="new-specs"
                  value={newSpecializations}
                  onChange={(e) => setNewSpecializations(e.target.value)}
                  placeholder="e.g. Drupal, Front End, WordPress"
                  className="mt-1"
                />
              </div>
              <div className="col-span-2">
                <Label htmlFor="new-notes">Special Notes</Label>
                <Input
                  id="new-notes"
                  value={newSpecialNotes}
                  onChange={(e) => setNewSpecialNotes(e.target.value)}
                  placeholder="Any special scheduling notes..."
                  className="mt-1"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setAddDialogOpen(false)}
                disabled={addingSaving}
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddMember}
                disabled={addingSaving || !newName.trim() || !newRole.trim()}
              >
                {addingSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4 mr-2" />
                )}
                Add Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sheet Detail Panel
// ---------------------------------------------------------------------------

function MemberDetailPanel({
  member,
  membersMap,
  allocations,
  holidays,
  timeOff,
  weekStarting,
  editing,
  setEditing,
  editName,
  setEditName,
  editRole,
  setEditRole,
  editDepartment,
  setEditDepartment,
  editLocation,
  setEditLocation,
  editWeeklyHours,
  setEditWeeklyHours,
  editAdminHours,
  setEditAdminHours,
  editSpecializations,
  setEditSpecializations,
  editReportsTo,
  setEditReportsTo,
  editSpecialNotes,
  setEditSpecialNotes,
  saving,
  onSave,
}: {
  member: TeamMember
  membersMap: Map<string, TeamMember>
  allocations: AllocationWithProject[]
  holidays: Holiday[]
  timeOff: TimeOff[]
  weekStarting: string
  editing: boolean
  setEditing: (v: boolean) => void
  editName: string
  setEditName: (v: string) => void
  editRole: string
  setEditRole: (v: string) => void
  editDepartment: string
  setEditDepartment: (v: string) => void
  editLocation: string
  setEditLocation: (v: string) => void
  editWeeklyHours: number
  setEditWeeklyHours: (v: number) => void
  editAdminHours: number
  setEditAdminHours: (v: number) => void
  editSpecializations: string
  setEditSpecializations: (v: string) => void
  editReportsTo: string
  setEditReportsTo: (v: string) => void
  editSpecialNotes: string
  setEditSpecialNotes: (v: string) => void
  saving: boolean
  onSave: () => void
}) {
  const weeklyHours = member.weekly_hours ?? 40
  const adminHours = member.admin_hours ?? 4
  const holidayHours = getHolidayHoursForWeek(member, weekStarting, holidays)
  const ptoHours = getPtoHoursForWeek(member, weekStarting, timeOff)
  const available = getAvailableHours(member, weekStarting, holidays, timeOff)
  const totalAllocated = allocations.reduce(
    (sum, a) => sum + a.hours_allocated,
    0
  )
  const utilization = getUtilizationPercent(totalAllocated, available)
  const utilizationStyle = getUtilizationColor(utilization)
  const manager = member.reports_to
    ? membersMap.get(member.reports_to)
    : null

  // Find direct reports
  const directReports: TeamMember[] = []
  membersMap.forEach((m) => {
    if (m.reports_to === member.id) {
      directReports.push(m)
    }
  })

  // Build a list of potential managers for the reports-to selector
  const managerOptions: TeamMember[] = []
  membersMap.forEach((m) => {
    if (m.id !== member.id) managerOptions.push(m)
  })
  managerOptions.sort((a, b) => {
    const aLead =
      a.role.toLowerCase().includes('lead') ||
      a.role.toLowerCase().includes('head')
    const bLead =
      b.role.toLowerCase().includes('lead') ||
      b.role.toLowerCase().includes('head')
    if (aLead && !bLead) return -1
    if (!aLead && bLead) return 1
    return a.name.localeCompare(b.name)
  })

  return (
    <>
      <SheetHeader className="pb-0">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback className="bg-slate-200 text-slate-700 font-semibold">
                {getInitials(editing ? editName : member.name)}
              </AvatarFallback>
            </Avatar>
            {editing ? (
              <div className="flex flex-col gap-1.5 flex-1">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-lg font-semibold h-8"
                  placeholder="Full name"
                />
                <Input
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="text-sm h-7 text-muted-foreground"
                  placeholder="Role title"
                />
              </div>
            ) : (
              <div>
                <SheetTitle className="text-lg">{member.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-0.5">
                  {member.role}
                </SheetDescription>
              </div>
            )}
          </div>
          {!editing && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditing(true)}
              className="shrink-0"
            >
              <Pencil className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
        </div>
        {editing ? (
          <div className="flex items-center gap-2 mt-3">
            <Select value={editDepartment} onValueChange={setEditDepartment}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PM">PM</SelectItem>
                <SelectItem value="Dev">Dev</SelectItem>
              </SelectContent>
            </Select>
            <Select value={editLocation} onValueChange={setEditLocation}>
              <SelectTrigger className="w-28 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USA">USA</SelectItem>
                <SelectItem value="Canada">Canada</SelectItem>
                <SelectItem value="UK">UK</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-3">
            {departmentBadge(member.department)}
            {locationBadge(member.location)}
          </div>
        )}
        {editing && (
          <div className="flex items-center gap-1 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button size="sm" onClick={onSave} disabled={saving || !editName.trim() || !editRole.trim()}>
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </SheetHeader>

      <ScrollArea className="flex-1 px-4">
        <div className="flex flex-col gap-5 pb-6">
          {/* Reporting Structure */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-500" />
              Reporting Structure
            </h3>
            <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Reports to</span>
                {manager ? (
                  <div className="flex items-center gap-2">
                    <Avatar size="sm">
                      <AvatarFallback className="bg-slate-200 text-slate-600 text-xs">
                        {getInitials(manager.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium text-slate-700">
                      {manager.name}
                    </span>
                  </div>
                ) : (
                  <span className="text-slate-400">{'\u2014'}</span>
                )}
              </div>
              {directReports.length > 0 && (
                <>
                  <Separator />
                  <div className="text-sm">
                    <span className="text-slate-500">Direct reports</span>
                    <div className="mt-1.5 flex flex-col gap-1.5">
                      {directReports.map((dr) => (
                        <div
                          key={dr.id}
                          className="flex items-center gap-2"
                        >
                          <Avatar size="sm">
                            <AvatarFallback className="bg-slate-200 text-slate-600 text-xs">
                              {getInitials(dr.name)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium text-slate-700">
                            {dr.name}
                          </span>
                          <span className="text-slate-400 text-xs">
                            {dr.role}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>

          <Separator />

          {/* Reports To (editable) */}
          {editing && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                Reports To
              </h3>
              <Select value={editReportsTo || 'none'} onValueChange={(v) => setEditReportsTo(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {managerOptions.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} ({m.role})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </section>
          )}

          {editing && <Separator />}

          {/* Hours & Capacity */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Clock className="h-4 w-4 text-slate-500" />
                Hours & Capacity
              </h3>
            </div>

            <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
              {editing ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor="weekly-hours" className="text-xs mb-1">
                        Weekly Hours
                      </Label>
                      <Input
                        id="weekly-hours"
                        type="number"
                        min={0}
                        max={60}
                        value={editWeeklyHours}
                        onChange={(e) =>
                          setEditWeeklyHours(Number(e.target.value))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="admin-hours" className="text-xs mb-1">
                        Admin Hours
                      </Label>
                      <Input
                        id="admin-hours"
                        type="number"
                        min={0}
                        max={40}
                        value={editAdminHours}
                        onChange={(e) =>
                          setEditAdminHours(Number(e.target.value))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label
                      htmlFor="specializations"
                      className="text-xs mb-1"
                    >
                      Specializations (comma-separated)
                    </Label>
                    <Input
                      id="specializations"
                      value={editSpecializations}
                      onChange={(e) =>
                        setEditSpecializations(e.target.value)
                      }
                      placeholder="e.g. React, Node.js, AWS"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Weekly hours</span>
                      <span className="font-medium text-slate-700">
                        {weeklyHours}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Admin hours</span>
                      <span className="font-medium text-slate-700">
                        {adminHours}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Holiday hours</span>
                      <span className="font-medium text-slate-700">
                        {holidayHours}h
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">PTO hours</span>
                      <span className="font-medium text-slate-700">
                        {ptoHours}h
                      </span>
                    </div>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-900">
                      Available this week
                    </span>
                    <span className="text-lg font-bold text-slate-900">
                      {available}h
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* Utilization bar */}
            {!editing && (
              <div className="mt-3 rounded-lg border bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-500 font-medium">
                    Utilization
                  </span>
                  <span
                    className={`text-xs font-semibold rounded-full px-2 py-0.5 ${utilizationStyle}`}
                  >
                    {utilization}%
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${Math.min(utilization, 100)}%`,
                      backgroundColor:
                        utilization >= 95
                          ? '#ef4444'
                          : utilization >= 85
                            ? '#f97316'
                            : utilization >= 70
                              ? '#22c55e'
                              : '#eab308',
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-xs text-slate-400">
                  <span>{totalAllocated}h allocated</span>
                  <span>{available}h available</span>
                </div>
              </div>
            )}
          </section>

          {/* Specializations (read-only view when not editing) */}
          {!editing && (member.specializations ?? []).length > 0 && (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Specializations
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(member.specializations ?? []).map((spec) => (
                    <Badge
                      key={spec}
                      variant="secondary"
                      className="text-xs"
                    >
                      {spec}
                    </Badge>
                  ))}
                </div>
              </section>
            </>
          )}

          <Separator />

          {/* Allocations for this week */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-2 flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-500" />
              Allocations &mdash; {getWeekLabel(weekStarting)}
            </h3>

            {allocations.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-400">
                No allocations this week
              </div>
            ) : (
              <div className="space-y-2">
                {allocations.map((alloc) => (
                  <div
                    key={alloc.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">
                        {alloc.project?.project_name ?? 'Unknown Project'}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {alloc.project?.client_name ?? ''}
                        {alloc.role_on_project && (
                          <span className="ml-1">
                            &middot; {alloc.role_on_project}
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className="text-sm font-bold text-slate-900">
                        {alloc.hours_allocated}h
                      </p>
                      {alloc.hours_actual != null && (
                        <p className="text-xs text-slate-400">
                          {alloc.hours_actual}h actual
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {/* Total bar */}
                <div className="flex items-center justify-between rounded-lg bg-slate-100 p-3 mt-1">
                  <span className="text-sm font-medium text-slate-700">
                    Total Allocated
                  </span>
                  <span className="text-sm font-bold text-slate-900">
                    {totalAllocated}h / {available}h available
                  </span>
                </div>
              </div>
            )}
          </section>

          {/* Notes */}
          {editing ? (
            <>
              <Separator />
              <section>
                <h3 className="text-sm font-semibold text-slate-900 mb-2">
                  Special Notes
                </h3>
                <Input
                  value={editSpecialNotes}
                  onChange={(e) => setEditSpecialNotes(e.target.value)}
                  placeholder="Any special scheduling notes..."
                />
              </section>
            </>
          ) : (
            member.special_notes && (
              <>
                <Separator />
                <section>
                  <h3 className="text-sm font-semibold text-slate-900 mb-2">
                    Notes
                  </h3>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3">
                    {member.special_notes}
                  </p>
                </section>
              </>
            )
          )}
        </div>
      </ScrollArea>
    </>
  )
}
