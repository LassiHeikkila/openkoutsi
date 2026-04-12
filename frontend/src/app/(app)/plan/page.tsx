'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { TrainingPlan } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
import { PlanCalendar } from '@/components/plan/PlanCalendar'
import { toast } from '@/components/ui/use-toast'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Plus, ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { differenceInWeeks } from 'date-fns'

function GeneratePlanDialog({ onGenerated }: { onGenerated: () => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [weeks, setWeeks] = useState('8')
  const [goal, setGoal] = useState('')
  const [generating, setGenerating] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setGenerating(true)
    try {
      await apiFetch('/api/plans/', {
        method: 'POST',
        body: JSON.stringify({
          name,
          start_date: startDate,
          weeks: parseInt(weeks),
          goal: goal || null,
        }),
      })
      toast({ title: 'Training plan generated!' })
      setOpen(false)
      onGenerated()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>

      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Generate plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Generate training plan</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="plan-name">Plan name *</Label>
            <Input
              id="plan-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Summer base build"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="plan-start">Start date *</Label>
              <Input
                id="plan-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan-weeks">Weeks</Label>
              <Input
                id="plan-weeks"
                type="number"
                min="2"
                max="52"
                value={weeks}
                onChange={(e) => setWeeks(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-goal">Goal</Label>
            <Input
              id="plan-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. build_base, peak_fitness"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={generating}>
              {generating ? 'Generating…' : 'Generate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function PlanPage() {
  const { data: plans, mutate } = useSWR<TrainingPlan[]>('/api/plans/', fetcher)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const activePlan = plans?.find((p) => p.status === 'active')

  const currentWeek = activePlan
    ? Math.max(1, differenceInWeeks(new Date(), new Date(activePlan.start_date)) + 1)
    : 1

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleArchive(id: string) {
    try {
      await apiFetch(`/api/plans/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'archived' }),
      })
      await mutate()
      toast({ title: 'Plan archived' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(id: string) {
    try {
      await apiFetch(`/api/plans/${id}`, { method: 'DELETE' })
      await mutate()
      toast({ title: 'Plan deleted' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Training plan</h1>
        <GeneratePlanDialog onGenerated={() => mutate()} />
      </div>

      {!activePlan && plans?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No training plan yet.</p>
            <p className="text-sm text-muted-foreground mt-1">
              Generate a plan to see your weekly schedule here.
            </p>
          </CardContent>
        </Card>
      )}

      {activePlan && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{activePlan.name}</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleArchive(activePlan.id)}
              >
                Archive
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <PlanCalendar plan={activePlan} currentWeek={currentWeek} />
          </CardContent>
        </Card>
      )}

      {plans && plans.filter((p) => p.status !== 'active').length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Archived plans
          </h2>
          <div className="space-y-2">
            {plans
              .filter((p) => p.status !== 'active')
              .map((plan) => {
                const isOpen = expanded.has(plan.id)
                const planWeek = Math.max(
                  1,
                  differenceInWeeks(new Date(), new Date(plan.start_date)) + 1,
                )
                return (
                  <Card key={plan.id}>
                    <CardContent className="py-3">
                      <div className="flex items-center gap-2">
                        <button
                          className="flex-1 flex items-center justify-between text-left gap-2 min-w-0"
                          onClick={() => toggleExpanded(plan.id)}
                        >
                          <p className="text-sm font-medium truncate">{plan.name}</p>
                          <span className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground">
                            {plan.weeks} weeks
                            {isOpen
                              ? <ChevronUp className="h-3.5 w-3.5" />
                              : <ChevronDown className="h-3.5 w-3.5" />
                            }
                          </span>
                        </button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete plan?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{plan.name}" will be permanently deleted.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => handleDelete(plan.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                      {isOpen && (
                        <div className="mt-4 border-t pt-4">
                          <PlanCalendar plan={plan} currentWeek={planWeek} />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
