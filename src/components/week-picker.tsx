'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getWeekLabel, navigateWeek, getCurrentWeekStart } from '@/lib/capacity'

interface WeekPickerProps {
  weekStarting: string
  onChange: (week: string) => void
}

export function WeekPicker({ weekStarting, onChange }: WeekPickerProps) {
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(navigateWeek(weekStarting, -1))}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="min-w-[220px] text-center">
        <span className="text-sm font-medium">{getWeekLabel(weekStarting)}</span>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={() => onChange(navigateWeek(weekStarting, 1))}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(getCurrentWeekStart())}
        className="ml-2 text-xs"
      >
        Today
      </Button>
    </div>
  )
}
