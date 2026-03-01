'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { TeamMember, TimeOff, Holiday } from '@/lib/types/database'
import { format, parseISO, eachDayOfInterval, isWeekend } from 'date-fns'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
// ScrollArea removed — using overflow-y-auto instead
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CalendarIcon, Plus, MoreHorizontal, Check, X, Filter, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBusinessDays(start: Date, end: Date): number {
  if (end < start) return 0
  const days = eachDayOfInterval({ start, end })
  return days.filter((d) => !isWeekend(d)).length
}

function statusColor(status: string) {
  switch (status) {
    case 'Approved':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'Pending':
      return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'Denied':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return ''
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'Vacation':
      return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Personal':
      return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'Sick':
      return 'bg-red-100 text-red-700 border-red-200'
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200'
  }
}

function countryBadge(country: string) {
  switch (country) {
    case 'US':
      return { flag: '\u{1F1FA}\u{1F1F8}', className: 'bg-blue-100 text-blue-700 border-blue-200' }
    case 'Canada':
      return { flag: '\u{1F1E8}\u{1F1E6}', className: 'bg-red-100 text-red-700 border-red-200' }
    case 'UK':
      return { flag: '\u{1F1EC}\u{1F1E7}', className: 'bg-indigo-100 text-indigo-700 border-indigo-200' }
    default:
      return { flag: '\u{1F30D}', className: 'bg-slate-100 text-slate-700 border-slate-200' }
  }
}

function locationToCountry(location: string): string {
  switch (location) {
    case 'USA':
      return 'US'
    case 'Canada':
      return 'Canada'
    case 'UK':
      return 'UK'
    default:
      return 'US'
  }
}

// ---------------------------------------------------------------------------
// Types for PTO form
// ---------------------------------------------------------------------------

type PtoFormData = {
  teamMemberId: string
  type: string
  startDate: Date | undefined
  endDate: Date | undefined
  status: string
}

const emptyPtoForm: PtoFormData = {
  teamMemberId: '',
  type: 'Vacation',
  startDate: undefined,
  endDate: undefined,
  status: 'Pending',
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function TimeOffPage() {
  const supabase = createClient()

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [timeOffEntries, setTimeOffEntries] = useState<TimeOff[]>([])
  const [holidays, setHolidays] = useState<Holiday[]>([])
  const [loading, setLoading] = useState(true)

  // PTO dialog
  const [showPtoDialog, setShowPtoDialog] = useState(false)
  const [ptoForm, setPtoForm] = useState<PtoFormData>(emptyPtoForm)
  const [saving, setSaving] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Holiday filters
  const [showUS, setShowUS] = useState(true)
  const [showCanada, setShowCanada] = useState(true)
  const [showUK, setShowUK] = useState(true)

  // Holiday Sheet state
  const [selectedHoliday, setSelectedHoliday] = useState<Holiday | null>(null)
  const [holidaySheetOpen, setHolidaySheetOpen] = useState(false)
  const [editingHoliday, setEditingHoliday] = useState(false)
  const [editHolidayName, setEditHolidayName] = useState('')
  const [editHolidayDate, setEditHolidayDate] = useState<Date | undefined>(undefined)
  const [editHolidayCountries, setEditHolidayCountries] = useState<string[]>([])
  const [editHolidayType, setEditHolidayType] = useState('full_day')
  const [editHolidayHoursLost, setEditHolidayHoursLost] = useState('8')
  const [editHolidayNotes, setEditHolidayNotes] = useState('')
  const [editHolidayMemberIds, setEditHolidayMemberIds] = useState<string[]>([])
  const [savingHoliday, setSavingHoliday] = useState(false)

  // PTO edit sheet state
  const [selectedPto, setSelectedPto] = useState<TimeOff | null>(null)
  const [ptoSheetOpen, setPtoSheetOpen] = useState(false)
  const [editingPto, setEditingPto] = useState(false)
  const [editPtoMemberId, setEditPtoMemberId] = useState('')
  const [editPtoType, setEditPtoType] = useState('Vacation')
  const [editPtoStartDate, setEditPtoStartDate] = useState<Date | undefined>(undefined)
  const [editPtoEndDate, setEditPtoEndDate] = useState<Date | undefined>(undefined)
  const [editPtoStatus, setEditPtoStatus] = useState('Pending')
  const [savingPto, setSavingPto] = useState(false)
  const [confirmDeletePto, setConfirmDeletePto] = useState(false)
  const [deletingPto, setDeletingPto] = useState(false)

  // ---------- Data Fetching ----------

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [membersRes, timeOffRes, holidaysRes] = await Promise.all([
      supabase
        .from('team_members')
        .select('*')
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('time_off')
        .select('*')
        .order('start_date', { ascending: false }),
      supabase
        .from('holidays')
        .select('*')
        .order('date'),
    ])

    if (membersRes.data) setTeamMembers(membersRes.data)
    if (timeOffRes.data) setTimeOffEntries(timeOffRes.data)
    if (holidaysRes.data) setHolidays(holidaysRes.data)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------- Derived ----------

  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>()
    teamMembers.forEach((m) => map.set(m.id, m))
    return map
  }, [teamMembers])

  const filteredTimeOff = useMemo(() => {
    if (statusFilter === 'all') return timeOffEntries
    return timeOffEntries.filter((t) => t.status === statusFilter)
  }, [timeOffEntries, statusFilter])

  const filteredHolidays = useMemo(() => {
    return holidays.filter((h) => {
      const countries = h.countries ?? []
      // Show holiday if any of its countries are enabled
      const matchesUS = countries.includes('US') && showUS
      const matchesCanada = countries.includes('Canada') && showCanada
      const matchesUK = countries.includes('UK') && showUK
      return matchesUS || matchesCanada || matchesUK
    })
  }, [holidays, showUS, showCanada, showUK])

  // Members affected by each holiday (based on location -> country match)
  const membersAffectedByHoliday = useCallback(
    (holiday: Holiday) => {
      const countries = holiday.countries ?? []
      return teamMembers.filter(
        (m) => countries.includes(locationToCountry(m.location))
      )
    },
    [teamMembers]
  )

  // Members affected by countries array (for live preview in edit mode)
  const membersAffectedByCountries = useCallback(
    (countries: string[]) => {
      return teamMembers.filter(
        (m) => countries.includes(locationToCountry(m.location))
      )
    },
    [teamMembers]
  )

  // ---------- Holiday Sheet ----------

  function openHolidaySheet(holiday: Holiday) {
    setSelectedHoliday(holiday)
    setEditHolidayName(holiday.name)
    setEditHolidayDate(parseISO(holiday.date))
    setEditHolidayCountries(holiday.countries ?? [])
    setEditHolidayType(holiday.type ?? 'full_day')
    setEditHolidayHoursLost(String(holiday.hours_lost ?? 8))
    setEditHolidayNotes(holiday.notes ?? '')
    // Use stored member ids, or fall back to country-based matching
    if (holiday.team_member_ids && holiday.team_member_ids.length > 0) {
      setEditHolidayMemberIds(holiday.team_member_ids)
    } else {
      const countries = holiday.countries ?? []
      setEditHolidayMemberIds(
        teamMembers
          .filter((m) => countries.includes(locationToCountry(m.location)))
          .map((m) => m.id)
      )
    }
    setEditingHoliday(false)
    setHolidaySheetOpen(true)
  }

  function openNewHolidaySheet() {
    setSelectedHoliday(null)
    setEditHolidayName('')
    setEditHolidayDate(undefined)
    setEditHolidayCountries([])
    setEditHolidayType('full_day')
    setEditHolidayHoursLost('8')
    setEditHolidayNotes('')
    setEditHolidayMemberIds([])
    setEditingHoliday(true)
    setHolidaySheetOpen(true)
  }

  function toggleEditCountry(country: string) {
    setEditHolidayCountries((prev) => {
      const newCountries = prev.includes(country)
        ? prev.filter((c) => c !== country)
        : [...prev, country]

      // Auto-update member selection when countries change
      if (!prev.includes(country)) {
        // Adding a country — add matching members that aren't already selected
        const newMemberIds = teamMembers
          .filter((m) => locationToCountry(m.location) === country)
          .map((m) => m.id)
        setEditHolidayMemberIds((prevIds) => {
          const set = new Set(prevIds)
          newMemberIds.forEach((id) => set.add(id))
          return Array.from(set)
        })
      } else {
        // Removing a country — remove members that belong ONLY to that country
        const remainingCountries = newCountries
        const membersStillCovered = new Set(
          teamMembers
            .filter((m) => remainingCountries.includes(locationToCountry(m.location)))
            .map((m) => m.id)
        )
        setEditHolidayMemberIds((prevIds) =>
          prevIds.filter((id) => membersStillCovered.has(id))
        )
      }

      return newCountries
    })
  }

  function toggleEditMember(memberId: string) {
    setEditHolidayMemberIds((prev) =>
      prev.includes(memberId)
        ? prev.filter((id) => id !== memberId)
        : [...prev, memberId]
    )
  }

  async function handleSaveHoliday() {
    if (!editHolidayName.trim() || !editHolidayDate || editHolidayCountries.length === 0) return
    setSavingHoliday(true)

    const dateStr = format(editHolidayDate, 'yyyy-MM-dd')
    const hoursLost = parseFloat(editHolidayHoursLost) || 8

    const payload = {
      name: editHolidayName.trim(),
      date: dateStr,
      countries: editHolidayCountries,
      type: editHolidayType,
      hours_lost: hoursLost,
      notes: editHolidayNotes.trim() || null,
      year: editHolidayDate.getFullYear(),
      team_member_ids: editHolidayMemberIds.length > 0 ? editHolidayMemberIds : null,
    }

    if (selectedHoliday) {
      // UPDATE existing holiday
      const { error } = await supabase
        .from('holidays')
        .update(payload)
        .eq('id', selectedHoliday.id)

      if (!error) {
        const updated = { ...selectedHoliday, ...payload }
        setHolidays((prev) =>
          prev.map((h) => (h.id === selectedHoliday.id ? updated : h))
        )
        setSelectedHoliday(updated)
        setEditingHoliday(false)
      }
    } else {
      // INSERT new holiday
      const { data, error } = await supabase
        .from('holidays')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        setHolidays((prev) => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)))
        setSelectedHoliday(data)
        setEditingHoliday(false)
      }
    }

    setSavingHoliday(false)
  }

  async function handleDeleteHoliday() {
    if (!selectedHoliday) return
    setSavingHoliday(true)

    const { error } = await supabase
      .from('holidays')
      .delete()
      .eq('id', selectedHoliday.id)

    if (!error) {
      setHolidays((prev) => prev.filter((h) => h.id !== selectedHoliday.id))
      setHolidaySheetOpen(false)
      setSelectedHoliday(null)
    }

    setSavingHoliday(false)
  }

  // ---------- PTO CRUD ----------

  const businessDays = useMemo(() => {
    if (!ptoForm.startDate || !ptoForm.endDate) return 0
    return getBusinessDays(ptoForm.startDate, ptoForm.endDate)
  }, [ptoForm.startDate, ptoForm.endDate])

  async function handleAddPto() {
    if (!ptoForm.teamMemberId || !ptoForm.startDate || !ptoForm.endDate) return
    setSaving(true)

    const { error } = await supabase.from('time_off').insert({
      team_member_id: ptoForm.teamMemberId,
      type: ptoForm.type,
      start_date: format(ptoForm.startDate, 'yyyy-MM-dd'),
      end_date: format(ptoForm.endDate, 'yyyy-MM-dd'),
      days: businessDays,
      status: ptoForm.status,
    })

    if (!error) {
      setShowPtoDialog(false)
      setPtoForm(emptyPtoForm)
      fetchData()
    }
    setSaving(false)
  }

  async function handleUpdateStatus(id: string, newStatus: string) {
    await supabase.from('time_off').update({ status: newStatus }).eq('id', id)
    fetchData()
  }

  // ---------- PTO Edit Sheet ----------

  function openPtoSheet(entry: TimeOff) {
    setSelectedPto(entry)
    setEditPtoMemberId(entry.team_member_id)
    setEditPtoType(entry.type ?? 'Vacation')
    setEditPtoStartDate(parseISO(entry.start_date))
    setEditPtoEndDate(parseISO(entry.end_date))
    setEditPtoStatus(entry.status ?? 'Pending')
    setConfirmDeletePto(false)
    setEditingPto(false)
    setPtoSheetOpen(true)
  }

  const editPtoBusinessDays = useMemo(() => {
    if (!editPtoStartDate || !editPtoEndDate) return 0
    return getBusinessDays(editPtoStartDate, editPtoEndDate)
  }, [editPtoStartDate, editPtoEndDate])

  async function handleSavePto() {
    if (!selectedPto || !editPtoMemberId || !editPtoStartDate || !editPtoEndDate) return
    setSavingPto(true)

    const { error } = await supabase
      .from('time_off')
      .update({
        team_member_id: editPtoMemberId,
        type: editPtoType,
        start_date: format(editPtoStartDate, 'yyyy-MM-dd'),
        end_date: format(editPtoEndDate, 'yyyy-MM-dd'),
        days: editPtoBusinessDays,
        status: editPtoStatus,
      })
      .eq('id', selectedPto.id)

    if (!error) {
      await fetchData()
      setEditingPto(false)
      // Update selectedPto with new values
      setSelectedPto((prev) =>
        prev
          ? {
              ...prev,
              team_member_id: editPtoMemberId,
              type: editPtoType,
              start_date: format(editPtoStartDate, 'yyyy-MM-dd'),
              end_date: format(editPtoEndDate, 'yyyy-MM-dd'),
              days: editPtoBusinessDays,
              status: editPtoStatus,
            }
          : prev
      )
    }
    setSavingPto(false)
  }

  async function handleDeletePto() {
    if (!selectedPto) return
    setDeletingPto(true)

    const { error } = await supabase
      .from('time_off')
      .delete()
      .eq('id', selectedPto.id)

    if (!error) {
      await fetchData()
      setPtoSheetOpen(false)
      setSelectedPto(null)
      setConfirmDeletePto(false)
    }
    setDeletingPto(false)
  }

  // Affected members for the sheet (live preview during editing)
  const sheetAffectedMembers = useMemo(() => {
    if (editingHoliday) {
      // In edit mode, use the explicit member id selection
      return teamMembers.filter((m) => editHolidayMemberIds.includes(m.id))
    }
    if (selectedHoliday) {
      // In view mode, use stored ids or fall back to country matching
      if (selectedHoliday.team_member_ids && selectedHoliday.team_member_ids.length > 0) {
        return teamMembers.filter((m) => selectedHoliday.team_member_ids!.includes(m.id))
      }
      return membersAffectedByHoliday(selectedHoliday)
    }
    return []
  }, [editingHoliday, editHolidayMemberIds, selectedHoliday, teamMembers, membersAffectedByHoliday])

  // ---------- Render ----------

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          PTO &amp; Holidays
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage time off requests and view company holiday calendars.
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="time-off" className="w-full">
        <TabsList>
          <TabsTrigger value="time-off">PTO</TabsTrigger>
          <TabsTrigger value="holidays">Holiday Calendar</TabsTrigger>
        </TabsList>

        {/* ---------------------------------------------------------------- */}
        {/*  TAB 1 -- Time Off Requests                                      */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="time-off" className="mt-4">
          <div className="rounded-lg border bg-white shadow-sm">
            {/* Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger className="h-8 w-[140px] text-xs">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Denied">Denied</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setPtoForm(emptyPtoForm)
                  setShowPtoDialog(true)
                }}
              >
                <Plus className="h-4 w-4" />
                Add PTO
              </Button>
            </div>

            {/* Table */}
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="pl-4">Team Member</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTimeOff.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No time off requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredTimeOff.map((entry) => {
                    const member = memberMap.get(entry.team_member_id)
                    return (
                      <TableRow
                        key={entry.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => openPtoSheet(entry)}
                      >
                        <TableCell className="pl-4 font-medium">
                          {member?.name ?? 'Unknown'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs font-medium',
                              typeColor(entry.type ?? '')
                            )}
                          >
                            {entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(entry.start_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(entry.end_date), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {entry.days ?? '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-xs font-medium',
                              statusColor(entry.status ?? '')
                            )}
                          >
                            {entry.status}
                          </Badge>
                        </TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {entry.status === 'Pending' ? (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon-xs"
                                  className="text-muted-foreground"
                                >
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleUpdateStatus(entry.id, 'Approved')
                                  }
                                >
                                  <Check className="h-4 w-4 text-emerald-600" />
                                  Approve
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() =>
                                    handleUpdateStatus(entry.id, 'Denied')
                                  }
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                  Deny
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ---------------------------------------------------------------- */}
        {/*  TAB 2 -- Holiday Calendar                                       */}
        {/* ---------------------------------------------------------------- */}
        <TabsContent value="holidays" className="mt-4">
          <div className="rounded-lg border bg-white shadow-sm">
            {/* Country Toggles + Add Holiday */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-3">
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-sm font-medium text-muted-foreground">
                  Show:
                </span>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={showUS}
                    onCheckedChange={(v) => setShowUS(v === true)}
                  />
                  <span className="text-sm">
                    {'\u{1F1FA}\u{1F1F8}'} US Holidays
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={showCanada}
                    onCheckedChange={(v) => setShowCanada(v === true)}
                  />
                  <span className="text-sm">
                    {'\u{1F1E8}\u{1F1E6}'} Canadian Holidays
                  </span>
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <Checkbox
                    checked={showUK}
                    onCheckedChange={(v) => setShowUK(v === true)}
                  />
                  <span className="text-sm">
                    {'\u{1F1EC}\u{1F1E7}'} UK Holidays
                  </span>
                </label>
              </div>
              <Button size="sm" onClick={openNewHolidaySheet}>
                <Plus className="h-4 w-4" />
                Add Holiday
              </Button>
            </div>

            {/* Holiday Table */}
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="pl-4">Holiday</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Country</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">
                    Hours Lost
                  </TableHead>
                  <TableHead>Affected Members</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredHolidays.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-32 text-center text-muted-foreground"
                    >
                      No holidays match the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredHolidays.map((holiday) => {
                    const countries = holiday.countries ?? []
                    const affected = membersAffectedByHoliday(holiday)
                    return (
                      <TableRow
                        key={holiday.id}
                        className="cursor-pointer hover:bg-slate-50"
                        onClick={() => openHolidaySheet(holiday)}
                      >
                        <TableCell className="pl-4 font-medium">
                          {holiday.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(parseISO(holiday.date), 'EEE, MMM d')}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {countries.map((c) => {
                              const cb = countryBadge(c)
                              return (
                                <Badge
                                  key={c}
                                  variant="outline"
                                  className={cn(
                                    'text-xs font-medium',
                                    cb.className
                                  )}
                                >
                                  {cb.flag} {c}
                                </Badge>
                              )
                            })}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs capitalize text-muted-foreground">
                            {(holiday.type ?? 'full_day').replace(
                              '_',
                              ' '
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="text-center font-medium">
                          {holiday.hours_lost ?? 8}
                        </TableCell>
                        <TableCell>
                          {affected.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {affected.length <= 3 ? (
                                affected.map((m) => (
                                  <Badge
                                    key={m.id}
                                    variant="secondary"
                                    className="text-xs font-normal"
                                  >
                                    {m.name.split(' ')[0]}
                                  </Badge>
                                ))
                              ) : (
                                <>
                                  {affected.slice(0, 2).map((m) => (
                                    <Badge
                                      key={m.id}
                                      variant="secondary"
                                      className="text-xs font-normal"
                                    >
                                      {m.name.split(' ')[0]}
                                    </Badge>
                                  ))}
                                  <Badge
                                    variant="secondary"
                                    className="text-xs font-normal"
                                  >
                                    +{affected.length - 2} more
                                  </Badge>
                                </>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              --
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                          {holiday.notes ?? '--'}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* ------------------------------------------------------------------ */}
      {/*  Add PTO Dialog                                                     */}
      {/* ------------------------------------------------------------------ */}
      <Dialog open={showPtoDialog} onOpenChange={setShowPtoDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Time Off Request</DialogTitle>
            <DialogDescription>
              Create a new PTO or time off request for a team member.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Team Member */}
            <div className="grid gap-1.5">
              <Label htmlFor="pto-member">Team Member</Label>
              <Select
                value={ptoForm.teamMemberId}
                onValueChange={(v) =>
                  setPtoForm((prev) => ({ ...prev, teamMemberId: v }))
                }
              >
                <SelectTrigger id="pto-member" className="w-full">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Type */}
            <div className="grid gap-1.5">
              <Label htmlFor="pto-type">Type</Label>
              <Select
                value={ptoForm.type}
                onValueChange={(v) =>
                  setPtoForm((prev) => ({ ...prev, type: v }))
                }
              >
                <SelectTrigger id="pto-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Vacation">Vacation</SelectItem>
                  <SelectItem value="Personal">Personal</SelectItem>
                  <SelectItem value="Sick">Sick</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="grid gap-1.5">
              <Label>Start Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !ptoForm.startDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {ptoForm.startDate
                      ? format(ptoForm.startDate, 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={ptoForm.startDate}
                    onSelect={(d) =>
                      setPtoForm((prev) => ({
                        ...prev,
                        startDate: d ?? undefined,
                      }))
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* End Date */}
            <div className="grid gap-1.5">
              <Label>End Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal',
                      !ptoForm.endDate && 'text-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {ptoForm.endDate
                      ? format(ptoForm.endDate, 'MMM d, yyyy')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={ptoForm.endDate}
                    onSelect={(d) =>
                      setPtoForm((prev) => ({
                        ...prev,
                        endDate: d ?? undefined,
                      }))
                    }
                    disabled={(date) =>
                      ptoForm.startDate ? date < ptoForm.startDate : false
                    }
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Calculated Business Days */}
            {ptoForm.startDate && ptoForm.endDate && (
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-sm text-muted-foreground">
                  Business days:{' '}
                  <span className="font-semibold text-slate-900">
                    {businessDays}
                  </span>
                </p>
              </div>
            )}

            {/* Status */}
            <div className="grid gap-1.5">
              <Label htmlFor="pto-status">Status</Label>
              <Select
                value={ptoForm.status}
                onValueChange={(v) =>
                  setPtoForm((prev) => ({ ...prev, status: v }))
                }
              >
                <SelectTrigger id="pto-status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Denied">Denied</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowPtoDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddPto}
              disabled={
                saving ||
                !ptoForm.teamMemberId ||
                !ptoForm.startDate ||
                !ptoForm.endDate
              }
            >
              {saving ? 'Saving...' : 'Add Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ------------------------------------------------------------------ */}
      {/*  Holiday Detail / Edit Sheet                                        */}
      {/* ------------------------------------------------------------------ */}
      <Sheet open={holidaySheetOpen} onOpenChange={(open) => {
        setHolidaySheetOpen(open)
        if (!open) {
          setEditingHoliday(false)
        }
      }}>
        <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-lg flex flex-col">
          <SheetHeader className="flex-none">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <SheetTitle className="text-lg">
                  {editingHoliday ? (selectedHoliday ? 'Edit Holiday' : 'Add Holiday') : (selectedHoliday?.name ?? '')}
                </SheetTitle>
                <SheetDescription>
                  {editingHoliday
                    ? (selectedHoliday ? 'Update the holiday details below.' : 'Fill in the holiday details below.')
                    : (selectedHoliday ? format(parseISO(selectedHoliday.date), 'EEEE, MMMM d, yyyy') : '')}
                </SheetDescription>
              </div>
              {!editingHoliday && selectedHoliday && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingHoliday(true)}
                  className="shrink-0"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Button>
              )}
              {editingHoliday && (
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedHoliday) {
                        // Reset fields and exit edit
                        setEditHolidayName(selectedHoliday.name)
                        setEditHolidayDate(parseISO(selectedHoliday.date))
                        setEditHolidayCountries(selectedHoliday.countries ?? [])
                        setEditHolidayType(selectedHoliday.type ?? 'full_day')
                        setEditHolidayHoursLost(String(selectedHoliday.hours_lost ?? 8))
                        setEditHolidayNotes(selectedHoliday.notes ?? '')
                        if (selectedHoliday.team_member_ids && selectedHoliday.team_member_ids.length > 0) {
                          setEditHolidayMemberIds(selectedHoliday.team_member_ids)
                        } else {
                          const countries = selectedHoliday.countries ?? []
                          setEditHolidayMemberIds(
                            teamMembers
                              .filter((m) => countries.includes(locationToCountry(m.location)))
                              .map((m) => m.id)
                          )
                        }
                        setEditingHoliday(false)
                      } else {
                        // New holiday — just close
                        setHolidaySheetOpen(false)
                      }
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSaveHoliday}
                    disabled={
                      savingHoliday ||
                      !editHolidayName.trim() ||
                      !editHolidayDate ||
                      editHolidayCountries.length === 0
                    }
                  >
                    {savingHoliday ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-4">
            <div className="grid gap-5 py-4">
              {/* Holiday Name */}
              {editingHoliday ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-name">Holiday Name</Label>
                  <Input
                    id="holiday-name"
                    value={editHolidayName}
                    onChange={(e) => setEditHolidayName(e.target.value)}
                    placeholder="e.g. New Year's Day"
                  />
                </div>
              ) : (
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Holiday Name</span>
                  <span className="text-sm font-medium text-slate-900">
                    {selectedHoliday?.name}
                  </span>
                </div>
              )}

              {/* Date */}
              {editingHoliday ? (
                <div className="grid gap-1.5">
                  <Label>Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          'w-full justify-start text-left font-normal',
                          !editHolidayDate && 'text-muted-foreground'
                        )}
                      >
                        <CalendarIcon className="h-4 w-4" />
                        {editHolidayDate
                          ? format(editHolidayDate, 'EEEE, MMMM d, yyyy')
                          : 'Pick a date'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={editHolidayDate}
                        onSelect={(d) => setEditHolidayDate(d ?? undefined)}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              ) : (
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Date</span>
                  <span className="text-sm text-slate-900">
                    {selectedHoliday
                      ? format(parseISO(selectedHoliday.date), 'EEEE, MMMM d, yyyy')
                      : ''}
                  </span>
                </div>
              )}

              {/* Countries */}
              {editingHoliday ? (
                <div className="grid gap-2">
                  <Label>Countries</Label>
                  <div className="flex flex-wrap gap-4">
                    {(['US', 'Canada', 'UK'] as const).map((c) => {
                      const cb = countryBadge(c)
                      return (
                        <label key={c} className="flex cursor-pointer items-center gap-2">
                          <Checkbox
                            checked={editHolidayCountries.includes(c)}
                            onCheckedChange={() => toggleEditCountry(c)}
                          />
                          <span className="text-sm">{cb.flag} {c}</span>
                        </label>
                      )
                    })}
                  </div>
                  {editHolidayCountries.length === 0 && (
                    <p className="text-xs text-red-500">Select at least one country.</p>
                  )}
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">Countries</span>
                  <div className="flex flex-wrap gap-1.5">
                    {(selectedHoliday?.countries ?? []).map((c) => {
                      const cb = countryBadge(c)
                      return (
                        <Badge
                          key={c}
                          variant="outline"
                          className={cn('text-xs font-medium', cb.className)}
                        >
                          {cb.flag} {c}
                        </Badge>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Type & Hours Lost */}
              <div className="grid grid-cols-2 gap-4">
                {editingHoliday ? (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor="holiday-type">Type</Label>
                      <Select
                        value={editHolidayType}
                        onValueChange={setEditHolidayType}
                      >
                        <SelectTrigger id="holiday-type" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="full_day">Full Day</SelectItem>
                          <SelectItem value="half_day">Half Day</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="holiday-hours">Hours Lost</Label>
                      <Input
                        id="holiday-hours"
                        type="number"
                        min="0"
                        max="24"
                        step="0.5"
                        value={editHolidayHoursLost}
                        onChange={(e) => setEditHolidayHoursLost(e.target.value)}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Type</span>
                      <span className="text-sm capitalize text-slate-900">
                        {(selectedHoliday?.type ?? 'full_day').replace('_', ' ')}
                      </span>
                    </div>
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Hours Lost</span>
                      <span className="text-sm font-medium text-slate-900">
                        {selectedHoliday?.hours_lost ?? 8}h
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes */}
              {editingHoliday ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="holiday-notes">Notes</Label>
                  <Input
                    id="holiday-notes"
                    value={editHolidayNotes}
                    onChange={(e) => setEditHolidayNotes(e.target.value)}
                    placeholder="Optional notes..."
                  />
                </div>
              ) : (
                <div className="grid gap-1">
                  <span className="text-xs font-medium text-muted-foreground">Notes</span>
                  <span className="text-sm text-slate-900">
                    {selectedHoliday?.notes || '--'}
                  </span>
                </div>
              )}

              <Separator />

              {/* Affected Team Members */}
              <div className="grid gap-2">
                <span className="text-xs font-medium text-muted-foreground">
                  {editingHoliday ? 'Team Members' : 'Affected Team Members'} ({sheetAffectedMembers.length})
                </span>

                {editingHoliday ? (
                  <div className="grid gap-1.5 max-h-[300px] overflow-y-auto">
                    {teamMembers.map((m) => {
                      const memberCountry = locationToCountry(m.location)
                      const cb = countryBadge(memberCountry)
                      const isChecked = editHolidayMemberIds.includes(m.id)
                      return (
                        <label
                          key={m.id}
                          className={cn(
                            'flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer transition-colors',
                            isChecked ? 'bg-slate-50 border-slate-300' : 'opacity-60 hover:opacity-100'
                          )}
                        >
                          <Checkbox
                            checked={isChecked}
                            onCheckedChange={() => toggleEditMember(m.id)}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {m.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.role} &middot; {m.department}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn('text-xs shrink-0', cb.className)}
                          >
                            {cb.flag} {m.location}
                          </Badge>
                        </label>
                      )
                    })}
                  </div>
                ) : sheetAffectedMembers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No team members are affected by this holiday.
                  </p>
                ) : (
                  <div className="grid gap-1.5">
                    {sheetAffectedMembers.map((m) => {
                      const memberCountry = locationToCountry(m.location)
                      const cb = countryBadge(memberCountry)
                      return (
                        <div
                          key={m.id}
                          className="flex items-center gap-3 rounded-md border px-3 py-2"
                        >
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                            {m.name
                              .split(' ')
                              .map((n) => n[0])
                              .join('')}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-900 truncate">
                              {m.name}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {m.role} &middot; {m.department}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn('text-xs shrink-0', cb.className)}
                          >
                            {cb.flag} {m.location}
                          </Badge>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Delete Button (only for existing holidays in edit mode) */}
              {editingHoliday && selectedHoliday && (
                <>
                  <Separator />
                  <div className="grid gap-2">
                    <span className="text-xs font-medium text-red-600">Danger Zone</span>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full"
                      onClick={handleDeleteHoliday}
                      disabled={savingHoliday}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {savingHoliday ? 'Deleting...' : 'Delete Holiday'}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ------------------------------------------------------------------ */}
      {/*  PTO Detail / Edit Sheet                                            */}
      {/* ------------------------------------------------------------------ */}
      <Sheet open={ptoSheetOpen} onOpenChange={(open) => {
        setPtoSheetOpen(open)
        if (!open) {
          setEditingPto(false)
          setConfirmDeletePto(false)
        }
      }}>
        <SheetContent side="right" showCloseButton={false} className="w-full sm:max-w-lg flex flex-col">
          {selectedPto && (
            <>
              <SheetHeader className="flex-none">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-lg">
                      {editingPto ? 'Edit Time Off' : 'Time Off Details'}
                    </SheetTitle>
                    <SheetDescription>
                      {editingPto
                        ? 'Update the time off request below.'
                        : `${memberMap.get(selectedPto.team_member_id)?.name ?? 'Unknown'} — ${selectedPto.type ?? 'PTO'}`}
                    </SheetDescription>
                  </div>
                  {!editingPto && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingPto(true)}
                      className="shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                  )}
                  {editingPto && (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditPtoMemberId(selectedPto.team_member_id)
                          setEditPtoType(selectedPto.type ?? 'Vacation')
                          setEditPtoStartDate(parseISO(selectedPto.start_date))
                          setEditPtoEndDate(parseISO(selectedPto.end_date))
                          setEditPtoStatus(selectedPto.status ?? 'Pending')
                          setConfirmDeletePto(false)
                          setEditingPto(false)
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        onClick={handleSavePto}
                        disabled={savingPto || !editPtoMemberId || !editPtoStartDate || !editPtoEndDate}
                      >
                        {savingPto ? 'Saving...' : 'Save'}
                      </Button>
                    </div>
                  )}
                </div>
              </SheetHeader>

              <div className="flex-1 min-h-0 overflow-y-auto px-4">
                <div className="grid gap-5 py-4">
                  {/* Team Member */}
                  {editingPto ? (
                    <div className="grid gap-1.5">
                      <Label>Team Member</Label>
                      <Select value={editPtoMemberId} onValueChange={setEditPtoMemberId}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                        <SelectContent>
                          {teamMembers.map((m) => (
                            <SelectItem key={m.id} value={m.id}>
                              {m.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Team Member</span>
                      <span className="text-sm font-medium text-slate-900">
                        {memberMap.get(selectedPto.team_member_id)?.name ?? 'Unknown'}
                      </span>
                    </div>
                  )}

                  {/* Type */}
                  {editingPto ? (
                    <div className="grid gap-1.5">
                      <Label>Type</Label>
                      <Select value={editPtoType} onValueChange={setEditPtoType}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Vacation">Vacation</SelectItem>
                          <SelectItem value="Personal">Personal</SelectItem>
                          <SelectItem value="Sick">Sick</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Type</span>
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-medium w-fit', typeColor(selectedPto.type ?? ''))}
                      >
                        {selectedPto.type}
                      </Badge>
                    </div>
                  )}

                  {/* Dates */}
                  {editingPto ? (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label>Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal',
                                !editPtoStartDate && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="h-4 w-4" />
                              {editPtoStartDate ? format(editPtoStartDate, 'MMM d, yyyy') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={editPtoStartDate}
                              onSelect={(d) => setEditPtoStartDate(d ?? undefined)}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      <div className="grid gap-1.5">
                        <Label>End Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn(
                                'w-full justify-start text-left font-normal',
                                !editPtoEndDate && 'text-muted-foreground'
                              )}
                            >
                              <CalendarIcon className="h-4 w-4" />
                              {editPtoEndDate ? format(editPtoEndDate, 'MMM d, yyyy') : 'Pick a date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={editPtoEndDate}
                              onSelect={(d) => setEditPtoEndDate(d ?? undefined)}
                              disabled={(date) => editPtoStartDate ? date < editPtoStartDate : false}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1">
                        <span className="text-xs font-medium text-muted-foreground">Start Date</span>
                        <span className="text-sm text-slate-900">
                          {format(parseISO(selectedPto.start_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <div className="grid gap-1">
                        <span className="text-xs font-medium text-muted-foreground">End Date</span>
                        <span className="text-sm text-slate-900">
                          {format(parseISO(selectedPto.end_date), 'MMM d, yyyy')}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Business Days */}
                  <div className="grid gap-1">
                    <span className="text-xs font-medium text-muted-foreground">Business Days</span>
                    <span className="text-sm font-semibold text-slate-900">
                      {editingPto ? editPtoBusinessDays : (selectedPto.days ?? '-')}
                    </span>
                  </div>

                  {/* Status */}
                  {editingPto ? (
                    <div className="grid gap-1.5">
                      <Label>Status</Label>
                      <Select value={editPtoStatus} onValueChange={setEditPtoStatus}>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Approved">Approved</SelectItem>
                          <SelectItem value="Denied">Denied</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="grid gap-1">
                      <span className="text-xs font-medium text-muted-foreground">Status</span>
                      <Badge
                        variant="outline"
                        className={cn('text-xs font-medium w-fit', statusColor(selectedPto.status ?? ''))}
                      >
                        {selectedPto.status}
                      </Badge>
                    </div>
                  )}

                  {/* Delete */}
                  {editingPto && (
                    <>
                      <Separator />
                      <div>
                        {!confirmDeletePto ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setConfirmDeletePto(true)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Time Off
                          </Button>
                        ) : (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                            <p className="text-sm text-red-700 font-medium">
                              Are you sure? This will permanently delete this time off record.
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleDeletePto}
                                disabled={deletingPto}
                              >
                                <Trash2 className="h-4 w-4" />
                                {deletingPto ? 'Deleting...' : 'Yes, Delete'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeletePto(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
