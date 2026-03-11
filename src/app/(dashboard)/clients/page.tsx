'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Client, Project } from '@/lib/types/database'

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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Loader2,
  Search,
  Plus,
  Pencil,
  Save,
  X,
  Trash2,
  Building2,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Badge helpers
// ---------------------------------------------------------------------------

function clientStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Active':
      return 'bg-green-100 text-green-700 hover:bg-green-100'
    case 'Inactive':
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
    default:
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
  }
}

function companyBadgeClass(company: string): string {
  switch (company) {
    case 'MMGY':
      return 'bg-blue-100 text-blue-700 hover:bg-blue-100'
    case 'Origin':
      return 'bg-purple-100 text-purple-700 hover:bg-purple-100'
    case 'Other':
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
    default:
      return 'bg-gray-100 text-gray-700 hover:bg-gray-100'
  }
}

function projectStatusBadgeClass(status: string): string {
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
// Main page component
// ---------------------------------------------------------------------------

export default function ClientsPage() {
  const supabase = createClient()

  // Data state
  const [clients, setClients] = useState<Client[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  // Edit state
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editStatus, setEditStatus] = useState('Active')
  const [editCompany, setEditCompany] = useState('MMGY')
  const [editNotes, setEditNotes] = useState('')
  const [saving, setSaving] = useState(false)

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [clientsRes, projectsRes] = await Promise.all([
      supabase.from('clients').select('*').order('name'),
      supabase
        .from('projects')
        .select(
          'id, client_id, category, project_name, status, monthly_hours_total, project_id_display'
        ),
    ])

    if (clientsRes.data) setClients(clientsRes.data)
    if (projectsRes.data) setProjects(projectsRes.data as Project[])
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients
    const q = searchQuery.toLowerCase()
    return clients.filter((c) => c.name.toLowerCase().includes(q))
  }, [clients, searchQuery])

  function getClientRetainers(clientId: string): Project[] {
    return projects.filter(
      (p) => p.client_id === clientId && p.category === 'retainer'
    )
  }

  function getClientProjects(clientId: string): Project[] {
    return projects.filter(
      (p) => p.client_id === clientId && p.category === 'project'
    )
  }

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function openClientSheet(client: Client) {
    setSelectedClient(client)
    setEditName(client.name)
    setEditStatus(client.status ?? 'Active')
    setEditCompany(client.company ?? 'MMGY')
    setEditNotes(client.notes ?? '')
    setEditing(false)
    setSheetOpen(true)
  }

  function handleAddClient() {
    setSelectedClient(null)
    setEditName('')
    setEditStatus('Active')
    setEditCompany('MMGY')
    setEditNotes('')
    setEditing(true)
    setSheetOpen(true)
  }

  async function handleSaveClient() {
    if (!editName.trim()) return
    setSaving(true)

    const payload = {
      name: editName.trim(),
      status: editStatus,
      company: editCompany,
      notes: editNotes.trim() || null,
    }

    if (selectedClient) {
      // UPDATE
      const { error } = await supabase
        .from('clients')
        .update(payload)
        .eq('id', selectedClient.id)

      if (!error) {
        const updatedClient = { ...selectedClient, ...payload }
        setClients((prev) =>
          prev
            .map((c) => (c.id === selectedClient.id ? updatedClient : c))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
        setSelectedClient(updatedClient)
        setEditing(false)
      }
    } else {
      // INSERT
      const { data, error } = await supabase
        .from('clients')
        .insert(payload)
        .select()
        .single()

      if (!error && data) {
        setClients((prev) =>
          [...prev, data].sort((a, b) => a.name.localeCompare(b.name))
        )
        setSelectedClient(data)
        setEditing(false)
      }
    }

    setSaving(false)
  }

  async function handleDeleteClient() {
    if (!selectedClient) return
    setSaving(true)

    const { error } = await supabase
      .from('clients')
      .delete()
      .eq('id', selectedClient.id)

    if (!error) {
      setClients((prev) => prev.filter((c) => c.id !== selectedClient.id))
      setSheetOpen(false)
      setSelectedClient(null)
    }

    setSaving(false)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="flex flex-col gap-6 p-6 lg:p-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Clients
          </h1>
          <p className="text-sm text-slate-500">
            Manage clients, view their retainers and projects.
          </p>
        </div>
        <Button onClick={handleAddClient}>
          <Plus className="h-4 w-4 mr-2" />
          Add Client
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Search clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <span className="ml-auto text-sm text-slate-500">
          {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-slate-500">Loading clients...</span>
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredClients.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Building2 className="h-12 w-12 mb-3" />
          <p className="text-lg font-medium">No clients found</p>
          <p className="text-sm">Try adjusting your search or add a new client</p>
        </div>
      )}

      {/* Table */}
      {!loading && filteredClients.length > 0 && (
        <Card className="py-0">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/80">
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right"># Retainers</TableHead>
                  <TableHead className="text-right"># Projects</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.map((client) => {
                  const retainerCount = getClientRetainers(client.id).length
                  const projectCount = getClientProjects(client.id).length

                  return (
                    <TableRow
                      key={client.id}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                      onClick={() => openClientSheet(client)}
                    >
                      <TableCell className="pl-4 font-medium text-slate-900">
                        {client.name}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={companyBadgeClass(client.company)}
                        >
                          {client.company}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={clientStatusBadgeClass(
                            client.status ?? 'Active'
                          )}
                        >
                          {client.status ?? 'Active'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-slate-700">
                        {retainerCount}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums text-slate-700">
                        {projectCount}
                      </TableCell>
                      <TableCell className="text-slate-500 max-w-[250px] truncate">
                        {client.notes ?? '\u2014'}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Client Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg flex flex-col"
          showCloseButton={false}
        >
          {editing ? (
            <EditModePanel
              selectedClient={selectedClient}
              editName={editName}
              setEditName={setEditName}
              editStatus={editStatus}
              setEditStatus={setEditStatus}
              editCompany={editCompany}
              setEditCompany={setEditCompany}
              editNotes={editNotes}
              setEditNotes={setEditNotes}
              saving={saving}
              onSave={handleSaveClient}
              onCancel={() => {
                if (selectedClient) {
                  setEditName(selectedClient.name)
                  setEditStatus(selectedClient.status ?? 'Active')
                  setEditCompany(selectedClient.company ?? 'MMGY')
                  setEditNotes(selectedClient.notes ?? '')
                  setEditing(false)
                } else {
                  setSheetOpen(false)
                }
              }}
              onDelete={handleDeleteClient}
            />
          ) : (
            selectedClient && (
              <ViewModePanel
                client={selectedClient}
                retainers={getClientRetainers(selectedClient.id)}
                clientProjects={getClientProjects(selectedClient.id)}
                onEdit={() => setEditing(true)}
              />
            )
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// View Mode Panel
// ---------------------------------------------------------------------------

function ViewModePanel({
  client,
  retainers,
  clientProjects,
  onEdit,
}: {
  client: Client
  retainers: Project[]
  clientProjects: Project[]
  onEdit: () => void
}) {
  return (
    <>
      <SheetHeader className="pb-0">
        <div className="flex items-start justify-between">
          <div>
            <SheetTitle className="text-lg">{client.name}</SheetTitle>
            <SheetDescription className="flex items-center gap-2 mt-1">
              <Badge
                variant="secondary"
                className={companyBadgeClass(client.company)}
              >
                {client.company}
              </Badge>
              <Badge
                variant="secondary"
                className={clientStatusBadgeClass(client.status ?? 'Active')}
              >
                {client.status ?? 'Active'}
              </Badge>
            </SheetDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="shrink-0"
          >
            <Pencil className="h-3.5 w-3.5 mr-1" />
            Edit
          </Button>
        </div>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        <div className="flex flex-col gap-5 pb-6">
          {/* Notes */}
          {client.notes && (
            <section>
              <h3 className="text-sm font-semibold text-slate-900 mb-2">
                Notes
              </h3>
              <p className="text-sm text-slate-600 whitespace-pre-wrap rounded-lg border bg-slate-50 p-3">
                {client.notes}
              </p>
            </section>
          )}

          <Separator />

          {/* Retainers */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Retainers
            </h3>
            {retainers.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-400">
                No retainers for this client
              </div>
            ) : (
              <div className="space-y-2">
                {retainers.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {r.project_id_display && (
                          <span className="font-mono text-xs text-slate-400">
                            {r.project_id_display}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className={projectStatusBadgeClass(r.status ?? '')}
                        >
                          {r.status ?? 'Unknown'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900 mt-1 truncate">
                        {r.project_name}
                      </p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className="text-sm font-bold text-slate-900 tabular-nums">
                        {r.monthly_hours_total ?? 0}h
                      </p>
                      <p className="text-[10px] text-slate-400">hrs/month</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Projects */}
          <section>
            <h3 className="text-sm font-semibold text-slate-900 mb-2">
              Projects
            </h3>
            {clientProjects.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-slate-50 p-4 text-center text-sm text-slate-400">
                No projects for this client
              </div>
            ) : (
              <div className="space-y-2">
                {clientProjects.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border bg-white p-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {p.project_id_display && (
                          <span className="font-mono text-xs text-slate-400">
                            {p.project_id_display}
                          </span>
                        )}
                        <Badge
                          variant="secondary"
                          className={projectStatusBadgeClass(p.status ?? '')}
                        >
                          {p.status ?? 'Unknown'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-slate-900 mt-1 truncate">
                        {p.project_name}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Edit Mode Panel
// ---------------------------------------------------------------------------

function EditModePanel({
  selectedClient,
  editName,
  setEditName,
  editStatus,
  setEditStatus,
  editCompany,
  setEditCompany,
  editNotes,
  setEditNotes,
  saving,
  onSave,
  onCancel,
  onDelete,
}: {
  selectedClient: Client | null
  editName: string
  setEditName: (v: string) => void
  editStatus: string
  setEditStatus: (v: string) => void
  editCompany: string
  setEditCompany: (v: string) => void
  editNotes: string
  setEditNotes: (v: string) => void
  saving: boolean
  onSave: () => void
  onCancel: () => void
  onDelete: () => void
}) {
  return (
    <>
      <SheetHeader className="pb-0">
        <div className="flex items-start justify-between">
          <SheetTitle className="text-lg">
            {selectedClient ? 'Edit Client' : 'New Client'}
          </SheetTitle>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={saving}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onSave}
              disabled={saving || !editName.trim()}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save
            </Button>
          </div>
        </div>
        <SheetDescription>
          {selectedClient
            ? 'Update client details below.'
            : 'Fill in the details for the new client.'}
        </SheetDescription>
      </SheetHeader>

      <div className="flex-1 min-h-0 overflow-y-auto px-4">
        <div className="flex flex-col gap-5 pb-6">
          {/* Name */}
          <div>
            <Label htmlFor="edit-name" className="text-sm font-medium">
              Name
            </Label>
            <Input
              id="edit-name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="Client name"
              className="mt-1"
            />
          </div>

          {/* Status */}
          <div>
            <Label className="text-sm font-medium">Status</Label>
            <Select value={editStatus} onValueChange={setEditStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Company */}
          <div>
            <Label className="text-sm font-medium">Company</Label>
            <Select value={editCompany} onValueChange={setEditCompany}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Origin">Origin</SelectItem>
                <SelectItem value="MMGY">MMGY</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="edit-notes" className="text-sm font-medium">
              Notes
            </Label>
            <Input
              id="edit-notes"
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Any notes about this client..."
              className="mt-1"
            />
          </div>

          {/* Delete */}
          {selectedClient && (
            <>
              <Separator />
              <Button
                variant="destructive"
                onClick={onDelete}
                disabled={saving}
                className="w-full"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4 mr-2" />
                )}
                Delete Client
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
