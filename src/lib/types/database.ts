export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          name: string
          status: string | null
          notes: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          status?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Update: {
          id?: string
          name?: string
          status?: string | null
          notes?: string | null
          created_at?: string | null
        }
        Relationships: []
      }
      holidays: {
        Row: {
          countries: string[] | null
          date: string
          hours_lost: number | null
          id: string
          name: string
          notes: string | null
          type: string | null
          year: number | null
        }
        Insert: {
          countries?: string[] | null
          date: string
          hours_lost?: number | null
          id?: string
          name: string
          notes?: string | null
          type?: string | null
          year?: number | null
        }
        Update: {
          countries?: string[] | null
          date?: string
          hours_lost?: number | null
          id?: string
          name?: string
          notes?: string | null
          type?: string | null
          year?: number | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          category: string | null
          client_id: string | null
          client_name: string
          created_at: string | null
          design_split_pct: number | null
          dev_end_date: string | null
          dev_split_pct: number | null
          dev_start_date: string | null
          end_date: string | null
          id: string
          lead_dev_id: string | null
          lead_pm_id: string | null
          monthly_hours_total: number | null
          notes: string | null
          pm_split_pct: number | null
          project_id_display: string | null
          project_name: string
          project_type: string
          start_date: string | null
          status: string | null
          strategy_split_pct: number | null
        }
        Insert: {
          category?: string | null
          client_id?: string | null
          client_name: string
          created_at?: string | null
          design_split_pct?: number | null
          dev_end_date?: string | null
          dev_split_pct?: number | null
          dev_start_date?: string | null
          end_date?: string | null
          id?: string
          lead_dev_id?: string | null
          lead_pm_id?: string | null
          monthly_hours_total?: number | null
          notes?: string | null
          pm_split_pct?: number | null
          project_id_display?: string | null
          project_name: string
          project_type: string
          start_date?: string | null
          status?: string | null
          strategy_split_pct?: number | null
        }
        Update: {
          category?: string | null
          client_id?: string | null
          client_name?: string
          created_at?: string | null
          design_split_pct?: number | null
          dev_end_date?: string | null
          dev_split_pct?: number | null
          dev_start_date?: string | null
          end_date?: string | null
          id?: string
          lead_dev_id?: string | null
          lead_pm_id?: string | null
          monthly_hours_total?: number | null
          notes?: string | null
          pm_split_pct?: number | null
          project_id_display?: string | null
          project_name?: string
          project_type?: string
          start_date?: string | null
          status?: string | null
          strategy_split_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_dev_id_fkey"
            columns: ["lead_dev_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_lead_pm_id_fkey"
            columns: ["lead_pm_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          admin_hours: number | null
          created_at: string | null
          department: string
          id: string
          is_active: boolean | null
          location: string
          name: string
          reports_to: string | null
          role: string
          special_notes: string | null
          specializations: string[] | null
          weekly_hours: number | null
        }
        Insert: {
          admin_hours?: number | null
          created_at?: string | null
          department: string
          id?: string
          is_active?: boolean | null
          location: string
          name: string
          reports_to?: string | null
          role: string
          special_notes?: string | null
          specializations?: string[] | null
          weekly_hours?: number | null
        }
        Update: {
          admin_hours?: number | null
          created_at?: string | null
          department?: string
          id?: string
          is_active?: boolean | null
          location?: string
          name?: string
          reports_to?: string | null
          role?: string
          special_notes?: string | null
          specializations?: string[] | null
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "team_members_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      time_off: {
        Row: {
          created_at: string | null
          days: number | null
          end_date: string
          id: string
          notes: string | null
          start_date: string
          status: string | null
          team_member_id: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          days?: number | null
          end_date: string
          id?: string
          notes?: string | null
          start_date: string
          status?: string | null
          team_member_id: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          days?: number | null
          end_date?: string
          id?: string
          notes?: string | null
          start_date?: string
          status?: string | null
          team_member_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_off_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_allocations: {
        Row: {
          created_at: string | null
          hours_actual: number | null
          hours_allocated: number
          id: string
          notes: string | null
          project_id: string
          role_on_project: string | null
          team_member_id: string
          week_starting: string
        }
        Insert: {
          created_at?: string | null
          hours_actual?: number | null
          hours_allocated?: number
          id?: string
          notes?: string | null
          project_id: string
          role_on_project?: string | null
          team_member_id: string
          week_starting: string
        }
        Update: {
          created_at?: string | null
          hours_actual?: number | null
          hours_allocated?: number
          id?: string
          notes?: string | null
          project_id?: string
          role_on_project?: string | null
          team_member_id?: string
          week_starting?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_allocations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_allocations_team_member_id_fkey"
            columns: ["team_member_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Client = Database['public']['Tables']['clients']['Row']
export type TeamMember = Database['public']['Tables']['team_members']['Row']
export type Project = Database['public']['Tables']['projects']['Row']
export type WeeklyAllocation = Database['public']['Tables']['weekly_allocations']['Row']
export type TimeOff = Database['public']['Tables']['time_off']['Row']
export type Holiday = Database['public']['Tables']['holidays']['Row']
