'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Project, TeamMember, Client } from '@/lib/types/database'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
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
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar } from '@/components/ui/calendar'
import {
  Hammer,
  Loader2,
  Plus,
  Save,
  Search,
  Pencil,
  X,
  CalendarIcon,
  Trash2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProjectWithLeads = Project & {
  lead_pm?: TeamMember | null
  lead_dev?: TeamMember | null
}

const STATUSES = ['All', 'Planning', 'Active', 'On Hold', 'Complete'] as const

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'Planning':
      return 'bg-yellow-100 text-yellow-700 hover:bg-yellow-100'
    case 'Active':
      return 'bg-green-100 text-green-700 hover:bg-green-100'
    case 'On Hold':
      return 'bg-orange-100 text-orange-700 hover:bg-orange-100'
    case 'Complete':
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
    default:
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
  }
}

// ---------------------------------------------------------------------------
// Date formatter
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ProjectsPage() {
  const supabase = createClient()

  // Data state
  const [projects, setProjects] = useState<ProjectWithLeads[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)

  // Filter state
  const [statusFilter, setStatusFilter] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Detail sheet state
  const [selectedProject, setSelectedProject] = useState<ProjectWithLeads | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  // PM/Dev/Design/Strategy split editing
  const [editPmSplit, setEditPmSplit] = useState<number>(0)
  const [editDevSplit, setEditDevSplit] = useState<number>(0)
  const [editDesignSplit, setEditDesignSplit] = useState<number>(0)
  const [editStrategySplit, setEditStrategySplit] = useState<number>(0)
  const [saving, setSaving] = useState(false)

  // Edit mode
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editClientId, setEditClientId] = useState<string>('none')
  const [editStatus, setEditStatus] = useState('Active')
  const [editTotalHours, setEditTotalHours] = useState<number>(0)
  const [editLeadPmId, setEditLeadPmId] = useState<string>('')
  const [editLeadDevId, setEditLeadDevId] = useState<string>('')
  const [editStartDate, setEditStartDate] = useState<Date | undefined>(undefined)
  const [editEndDate, setEditEndDate] = useState<Date | undefined>(undefined)
  const [editDevStartDate, setEditDevStartDate] = useState<Date | undefined>(undefined)
  const [editDevEndDate, setEditDevEndDate] = useState<Date | undefined>(undefined)
  const [editNotes, setEditNotes] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addName, setAddName] = useState('')
  const [addClientId, setAddClientId] = useState<string>('none')
  const [addStatus, setAddStatus] = useState('Active')
  const [addTotalHours, setAddTotalHours] = useState<number>(0)
  const [addSaving, setAddSaving] = useState(false)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('projects')
      .select('*, lead_pm:team_members!projects_lead_pm_id_fkey(*), lead_dev:team_members!projects_lead_dev_id_fkey(*)')
      .eq('category', 'project')
      .order('project_id_display', { ascending: true })

    if (!error && data) {
      setProjects(data as unknown as ProjectWithLeads[])
    }
    setLoading(false)
  }, [supabase])

  const fetchTeamMembers = useCallback(async () => {
    const { data } = await supabase
      .from('team_members')
      .select('*')
      .eq('is_active', true)
      .order('name')
    if (data) setTeamMembers(data)
  }, [supabase])

  const fetchClients = useCallback(async () => {
    const { data } = await supabase
      .from('clients')
      .select('*')
      .order('name')
    if (data) setClients(data)
  }, [supabase])

  useEffect(() => {
    fetchProjects()
    fetchTeamMembers()
    fetchClients()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const handleProjectClick = (project: ProjectWithLeads) => {
    setSelectedProject(project)
    setEditPmSplit(project.pm_split_pct ?? 50)
    setEditDevSplit(project.dev_split_pct ?? 50)
    setEditDesignSplit(project.design_split_pct ?? 0)
    setEditStrategySplit(project.strategy_split_pct ?? 0)
    setEditName(project.project_name)
    setEditClientId(project.client_id ?? 'none')
    setEditStatus(project.status ?? 'Active')
    setEditTotalHours(project.monthly_hours_total ?? 0)
    setEditLeadPmId(project.lead_pm_id ?? 'none')
    setEditLeadDevId(project.lead_dev_id ?? 'none')
    setEditStartDate(project.start_date ? parseISO(project.start_date) : undefined)
    setEditEndDate(project.end_date ? parseISO(project.end_date) : undefined)
    setEditDevStartDate(project.dev_start_date ? parseISO(project.dev_start_date) : undefined)
    setEditDevEndDate(project.dev_end_date ? parseISO(project.dev_end_date) : undefined)
    setEditNotes(project.notes ?? '')
    setConfirmDelete(false)
    setEditing(false)
    setSheetOpen(true)
  }

  const handleSave = async () => {
    if (!selectedProject) return
    setSaving(true)

    const selectedClient = clients.find(c => c.id === editClientId)
    const updates = {
      project_name: editName,
      client_id: editClientId === 'none' ? null : editClientId,
      client_name: selectedClient?.name ?? '',
      status: editStatus,
      monthly_hours_total: editTotalHours,
      pm_split_pct: editPmSplit,
      dev_split_pct: editDevSplit,
      design_split_pct: editDesignSplit,
      strategy_split_pct: editStrategySplit,
      lead_pm_id: editLeadPmId === 'none' ? null : editLeadPmId,
      lead_dev_id: editLeadDevId === 'none' ? null : editLeadDevId,
      start_date: editStartDate ? format(editStartDate, 'yyyy-MM-dd') : null,
      end_date: editEndDate ? format(editEndDate, 'yyyy-MM-dd') : null,
      dev_start_date: editDevStartDate ? format(editDevStartDate, 'yyyy-MM-dd') : null,
      dev_end_date: editDevEndDate ? format(editDevEndDate, 'yyyy-MM-dd') : null,
      notes: editNotes || null,
    }

    const { error } = await supabase
      .from('projects')
      .update(updates)
      .eq('id', selectedProject.id)

    if (!error) {
      await fetchProjects()
      const leadPm = teamMembers.find(m => m.id === editLeadPmId) ?? null
      const leadDev = teamMembers.find(m => m.id === editLeadDevId) ?? null
      setSelectedProject(prev => prev ? {
        ...prev,
        ...updates,
        lead_pm: leadPm,
        lead_dev: leadDev,
      } : prev)
      setEditing(false)
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    if (!selectedProject) return
    setDeleting(true)
    const { error } = await supabase
      .from('projects')
      .delete()
      .eq('id', selectedProject.id)

    if (!error) {
      await fetchProjects()
      setSheetOpen(false)
      setSelectedProject(null)
      setConfirmDelete(false)
    }
    setDeleting(false)
  }

  const handleAddProject = async () => {
    if (!addName.trim()) return
    setAddSaving(true)

    // Generate next project ID display
    const existingIds = projects
      .map((p) => p.project_id_display)
      .filter((id): id is string => !!id && id.startsWith('WEB-'))
      .map((id) => parseInt(id.replace('WEB-', ''), 10))
      .filter((n) => !isNaN(n))
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1
    const projectIdDisplay = `WEB-${String(nextNum).padStart(3, '0')}`

    const selectedClient = clients.find((c) => c.id === addClientId)

    const { error } = await supabase.from('projects').insert({
      project_id_display: projectIdDisplay,
      project_name: addName.trim(),
      project_type: 'Website',
      category: 'project',
      client_id: addClientId === 'none' ? null : addClientId,
      client_name: selectedClient?.name ?? '',
      status: addStatus,
      monthly_hours_total: addTotalHours,
      pm_split_pct: 50,
      dev_split_pct: 50,
      design_split_pct: 0,
      strategy_split_pct: 0,
    })

    if (!error) {
      await fetchProjects()
      setShowAddDialog(false)
      setAddName('')
      setAddClientId('none')
      setAddStatus('Active')
      setAddTotalHours(0)
    }
    setAddSaving(false)
  }

  // -------------------------------------------------------------------------
  // Derived / filtered data
  // -------------------------------------------------------------------------

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      if (statusFilter !== 'All' && p.status !== statusFilter) return false
      if (searchQuery) {
        const q = searchQuery.toLowerCase()
        const searchable = [
          p.project_id_display,
          p.client_name,
          p.project_name,
          p.lead_pm?.name,
          p.lead_dev?.name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!searchable.includes(q)) return false
      }
      return true
    })
  }, [projects, statusFilter, searchQuery])

  // -------------------------------------------------------------------------
  // Calculated hours
  // -------------------------------------------------------------------------

  const calcPmHours = (project: ProjectWithLeads) => {
    const total = project.monthly_hours_total ?? 0
    const pct = project.pm_split_pct ?? 0
    return Math.round((total * pct) / 100)
  }

  const calcDevHours = (project: ProjectWithLeads) => {
    const total = project.monthly_hours_total ?? 0
    const pct = project.dev_split_pct ?? 0
    return Math.round((total * pct) / 100)
  }

  const calcDesignHours = (project: ProjectWithLeads) => {
    const total = project.monthly_hours_total ?? 0
    const pct = project.design_split_pct ?? 0
    return Math.round((total * pct) / 100)
  }

  const calcStrategyHours = (project: ProjectWithLeads) => {
    const total = project.monthly_hours_total ?? 0
    const pct = project.strategy_split_pct ?? 0
    return Math.round((total * pct) / 100)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
        <p className="text-sm text-slate-500 mt-1">
          Website builds and larger project work
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 w-64"
          />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {s === 'All' ? 'All Statuses' : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(statusFilter !== 'All' || searchQuery) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setStatusFilter('All')
              setSearchQuery('')
            }}
          >
            Clear filters
          </Button>
        )}

        <span className="ml-auto text-sm text-slate-500">
          {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
        </span>
        <Button size="sm" onClick={() => { setAddName(''); setAddClientId('none'); setAddStatus('Active'); setAddTotalHours(0); setShowAddDialog(true) }}>
          <Plus className="h-4 w-4" />
          Add Project
        </Button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading projects...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredProjects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Hammer className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No projects found</p>
          <p className="text-sm">Try adjusting your filters</p>
        </div>
      )}

      {/* Table View */}
      {!loading && filteredProjects.length > 0 && (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="pl-4">ID</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Project Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total Hrs</TableHead>
                  <TableHead className="text-right">PM Hrs</TableHead>
                  <TableHead className="text-right">Dev Hrs</TableHead>
                  <TableHead className="text-right">Design Hrs</TableHead>
                  <TableHead className="text-right">Strategy Hrs</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>PM</TableHead>
                  <TableHead>Dev</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow
                    key={project.id}
                    className="cursor-pointer"
                    onClick={() => handleProjectClick(project)}
                  >
                    <TableCell className="pl-4 font-mono text-xs text-slate-500">
                      {project.project_id_display ?? '--'}
                    </TableCell>
                    <TableCell className="font-medium text-slate-900">
                      {project.client_name}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {project.project_name}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={statusBadgeClass(project.status ?? '')}
                      >
                        {project.status ?? 'Unknown'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {project.monthly_hours_total ?? 0}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {calcPmHours(project)}
                      <span className="text-slate-400 text-xs ml-1">
                        ({project.pm_split_pct ?? 0}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {calcDevHours(project)}
                      <span className="text-slate-400 text-xs ml-1">
                        ({project.dev_split_pct ?? 0}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {calcDesignHours(project)}
                      <span className="text-slate-400 text-xs ml-1">
                        ({project.design_split_pct ?? 0}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-slate-600">
                      {calcStrategyHours(project)}
                      <span className="text-slate-400 text-xs ml-1">
                        ({project.strategy_split_pct ?? 0}%)
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDate(project.start_date)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {formatDate(project.end_date)}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {project.lead_pm?.name ?? '--'}
                    </TableCell>
                    <TableCell className="text-slate-700">
                      {project.lead_dev?.name ?? '--'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Project Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg" showCloseButton={false}>
          {selectedProject && (
            <>
              {!editing ? (
                <>
                  {/* ---- VIEW MODE ---- */}
                  <SheetHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">
                          {selectedProject.project_id_display}
                        </span>
                        <Badge variant="secondary" className={statusBadgeClass(selectedProject.status ?? '')}>
                          {selectedProject.status}
                        </Badge>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Button>
                    </div>
                    <SheetTitle className="text-lg">{selectedProject.project_name}</SheetTitle>
                    <SheetDescription>{selectedProject.client_name}</SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4">
                    <div className="space-y-6 pb-6">
                      {/* Hours summary */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">
                          Total Hours Breakdown
                        </h4>
                        <div className="rounded-lg border bg-slate-50 p-3 text-center mb-3">
                          <p className="text-xs text-slate-500">Total Project Hours</p>
                          <p className="text-2xl font-bold text-slate-900 tabular-nums">
                            {selectedProject.monthly_hours_total ?? 0}
                          </p>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                          <div className="rounded-lg border bg-blue-50/50 p-2.5 text-center">
                            <p className="text-[10px] text-blue-600">PM</p>
                            <p className="text-lg font-bold text-blue-700 tabular-nums">
                              {calcPmHours(selectedProject)}
                            </p>
                            <p className="text-[10px] text-blue-400">{selectedProject.pm_split_pct ?? 0}%</p>
                          </div>
                          <div className="rounded-lg border bg-emerald-50/50 p-2.5 text-center">
                            <p className="text-[10px] text-emerald-600">Dev</p>
                            <p className="text-lg font-bold text-emerald-700 tabular-nums">
                              {calcDevHours(selectedProject)}
                            </p>
                            <p className="text-[10px] text-emerald-400">{selectedProject.dev_split_pct ?? 0}%</p>
                          </div>
                          <div className="rounded-lg border bg-purple-50/50 p-2.5 text-center">
                            <p className="text-[10px] text-purple-600">Design</p>
                            <p className="text-lg font-bold text-purple-700 tabular-nums">
                              {calcDesignHours(selectedProject)}
                            </p>
                            <p className="text-[10px] text-purple-400">{selectedProject.design_split_pct ?? 0}%</p>
                          </div>
                          <div className="rounded-lg border bg-amber-50/50 p-2.5 text-center">
                            <p className="text-[10px] text-amber-600">Strategy</p>
                            <p className="text-lg font-bold text-amber-700 tabular-nums">
                              {calcStrategyHours(selectedProject)}
                            </p>
                            <p className="text-[10px] text-amber-400">{selectedProject.strategy_split_pct ?? 0}%</p>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Timeline */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">
                          Timeline
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                              Project Start
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatDate(selectedProject.start_date)}
                            </p>
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                              Project End
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatDate(selectedProject.end_date)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-500 mb-1">
                              Dev Start
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatDate(selectedProject.dev_start_date)}
                            </p>
                          </div>
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3">
                            <p className="text-[10px] uppercase tracking-wider text-emerald-500 mb-1">
                              Dev End
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {formatDate(selectedProject.dev_end_date)}
                            </p>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-2">
                          PM hours spread across full project. Dev hours only during dev dates.
                        </p>
                      </div>

                      <Separator />

                      {/* Hours Split - read-only */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">
                          Hours Split
                        </h4>
                        <div className="space-y-2">
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                            <div
                              className="bg-blue-400 transition-all duration-200"
                              style={{ width: `${selectedProject.pm_split_pct ?? 0}%` }}
                            />
                            <div
                              className="bg-emerald-400 transition-all duration-200"
                              style={{ width: `${selectedProject.dev_split_pct ?? 0}%` }}
                            />
                            <div
                              className="bg-purple-400 transition-all duration-200"
                              style={{ width: `${selectedProject.design_split_pct ?? 0}%` }}
                            />
                            <div
                              className="bg-amber-400 transition-all duration-200"
                              style={{ width: `${selectedProject.strategy_split_pct ?? 0}%` }}
                            />
                          </div>
                          <div className="flex items-center gap-3 text-[10px]">
                            <span className="text-blue-500">PM {selectedProject.pm_split_pct ?? 0}%</span>
                            <span className="text-emerald-500">Dev {selectedProject.dev_split_pct ?? 0}%</span>
                            <span className="text-purple-500">Design {selectedProject.design_split_pct ?? 0}%</span>
                            <span className="text-amber-500">Strategy {selectedProject.strategy_split_pct ?? 0}%</span>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Leads */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">
                          Assigned Team
                        </h4>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                              PM
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {selectedProject.lead_pm?.name ?? 'Unassigned'}
                            </p>
                            {selectedProject.lead_pm && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {selectedProject.lead_pm.role}
                              </p>
                            )}
                          </div>
                          <div className="rounded-lg border p-3">
                            <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-1">
                              Dev
                            </p>
                            <p className="text-sm font-medium text-slate-900">
                              {selectedProject.lead_dev?.name ?? 'Unassigned'}
                            </p>
                            {selectedProject.lead_dev && (
                              <p className="text-xs text-slate-500 mt-0.5">
                                {selectedProject.lead_dev.role}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Notes */}
                      {selectedProject.notes && (
                        <>
                          <Separator />
                          <div>
                            <h4 className="text-sm font-semibold text-slate-900 mb-2">
                              Notes
                            </h4>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap">
                              {selectedProject.notes}
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* ---- EDIT MODE ---- */}
                  <SheetHeader>
                    <div className="flex items-center justify-between">
                      <SheetTitle className="text-lg">Edit Project</SheetTitle>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                          <X className="h-4 w-4" />
                          Cancel
                        </Button>
                        <Button size="sm" onClick={handleSave} disabled={saving}>
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {saving ? 'Saving...' : 'Save'}
                        </Button>
                      </div>
                    </div>
                    <SheetDescription>Edit project details below</SheetDescription>
                  </SheetHeader>

                  <div className="flex-1 min-h-0 overflow-y-auto px-4">
                    <div className="space-y-6 pb-6">
                      {/* Project Name */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Project Name</Label>
                        <Input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                        />
                      </div>

                      {/* Client */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Client</Label>
                        <Select value={editClientId} onValueChange={setEditClientId}>
                          <SelectTrigger><SelectValue placeholder="Select Client" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Client</SelectItem>
                            {clients.map(c => (
                              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Status */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Status</Label>
                        <Select value={editStatus} onValueChange={setEditStatus}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Planning">Planning</SelectItem>
                            <SelectItem value="Active">Active</SelectItem>
                            <SelectItem value="On Hold">On Hold</SelectItem>
                            <SelectItem value="Complete">Complete</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Total Hours */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Total Hours</Label>
                        <Input
                          type="number"
                          min={0}
                          value={editTotalHours}
                          onChange={(e) => setEditTotalHours(parseInt(e.target.value) || 0)}
                        />
                      </div>

                      <Separator />

                      {/* Hours Split */}
                      <div>
                        <h4 className="text-sm font-semibold text-slate-900 mb-3">
                          Hours Split
                        </h4>
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs text-blue-600">PM (%)</Label>
                              <Input
                                type="number" min={0} max={100}
                                value={editPmSplit}
                                onChange={(e) => setEditPmSplit(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-emerald-600">Dev (%)</Label>
                              <Input
                                type="number" min={0} max={100}
                                value={editDevSplit}
                                onChange={(e) => setEditDevSplit(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-purple-600">Design (%)</Label>
                              <Input
                                type="number" min={0} max={100}
                                value={editDesignSplit}
                                onChange={(e) => setEditDesignSplit(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs text-amber-600">Strategy (%)</Label>
                              <Input
                                type="number" min={0} max={100}
                                value={editStrategySplit}
                                onChange={(e) => setEditStrategySplit(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
                              />
                            </div>
                          </div>

                          {/* Split visual bar */}
                          <div className="h-2.5 w-full rounded-full bg-slate-100 overflow-hidden flex">
                            <div className="bg-blue-400 transition-all duration-200" style={{ width: `${editPmSplit}%` }} />
                            <div className="bg-emerald-400 transition-all duration-200" style={{ width: `${editDevSplit}%` }} />
                            <div className="bg-purple-400 transition-all duration-200" style={{ width: `${editDesignSplit}%` }} />
                            <div className="bg-amber-400 transition-all duration-200" style={{ width: `${editStrategySplit}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <div className="flex items-center gap-3">
                              <span className="text-blue-500">PM {editPmSplit}%</span>
                              <span className="text-emerald-500">Dev {editDevSplit}%</span>
                              <span className="text-purple-500">Design {editDesignSplit}%</span>
                              <span className="text-amber-500">Strategy {editStrategySplit}%</span>
                            </div>
                            <span className={`font-medium ${editPmSplit + editDevSplit + editDesignSplit + editStrategySplit === 100 ? 'text-green-600' : 'text-red-500'}`}>
                              {editPmSplit + editDevSplit + editDesignSplit + editStrategySplit}%
                            </span>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* Start Date */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Start Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editStartDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {editStartDate ? format(editStartDate, 'MMM d, yyyy') : 'Select date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={editStartDate} onSelect={setEditStartDate} />
                          </PopoverContent>
                        </Popover>
                      </div>

                      {/* End Date */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">End Date</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editEndDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {editEndDate ? format(editEndDate, 'MMM d, yyyy') : 'Select date'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={editEndDate} onSelect={setEditEndDate} />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <Separator />

                      {/* Dev Timeline */}
                      <div>
                        <h4 className="text-sm font-semibold text-emerald-700 mb-1">Dev Timeline</h4>
                        <p className="text-[10px] text-slate-400 mb-3">
                          Dev hours are only allocated during this window. Defaults to full project if not set.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs text-emerald-600">Dev Start Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editDevStartDate && "text-muted-foreground")}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editDevStartDate ? format(editDevStartDate, 'MMM d, yyyy') : 'Not set'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={editDevStartDate} onSelect={setEditDevStartDate} />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs text-emerald-600">Dev End Date</Label>
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !editDevEndDate && "text-muted-foreground")}>
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editDevEndDate ? format(editDevEndDate, 'MMM d, yyyy') : 'Not set'}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <Calendar mode="single" selected={editDevEndDate} onSelect={setEditDevEndDate} />
                              </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </div>

                      <Separator />

                      {/* PM */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">PM</Label>
                        <Select value={editLeadPmId} onValueChange={setEditLeadPmId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select PM" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {teamMembers
                              .filter((m) => m.department === 'PM')
                              .map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Dev */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Dev</Label>
                        <Select value={editLeadDevId} onValueChange={setEditLeadDevId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Dev" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {teamMembers
                              .filter((m) => m.department === 'Dev')
                              .map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  {m.name}
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Notes */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">Notes</Label>
                        <Input
                          value={editNotes}
                          onChange={(e) => setEditNotes(e.target.value)}
                          placeholder="Add notes..."
                        />
                      </div>

                      {/* Delete */}
                      <Separator />
                      <div>
                        {!confirmDelete ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => setConfirmDelete(true)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete Project
                          </Button>
                        ) : (
                          <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-3">
                            <p className="text-sm text-red-700 font-medium">
                              Are you sure? This will permanently delete this project.
                            </p>
                            <div className="flex items-center gap-2">
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={handleDelete}
                                disabled={deleting}
                              >
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDelete(false)}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Project Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Project</DialogTitle>
            <DialogDescription>
              Create a new website build or project.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Project Name</Label>
              <Input
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                placeholder="e.g. Client Website Redesign"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Client</Label>
              <Select value={addClientId} onValueChange={setAddClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Client</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Status</Label>
                <Select value={addStatus} onValueChange={setAddStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Planning">Planning</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Hold">On Hold</SelectItem>
                    <SelectItem value="Complete">Complete</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Total Hours</Label>
                <Input
                  type="number"
                  min={0}
                  value={addTotalHours}
                  onChange={(e) => setAddTotalHours(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddProject} disabled={addSaving || !addName.trim()}>
              {addSaving ? 'Creating...' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
