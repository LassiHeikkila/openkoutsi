'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { fetcher, apiFetch } from '@/lib/api'
import type { Goal, GoalCreate } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog'
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
import { toast } from '@/components/ui/use-toast'
import { Plus, Trash2, CheckCircle2 } from 'lucide-react'
import { formatDate } from '@/lib/utils'

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  achieved: 'secondary',
  abandoned: 'outline',
}

function GoalForm({ onSave }: { onSave: (data: GoalCreate) => Promise<void> }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [targetDate, setTargetDate] = useState('')
  const [metric, setMetric] = useState('')
  const [targetValue, setTargetValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await onSave({
        title,
        description: description || undefined,
        target_date: targetDate || undefined,
        metric: metric || undefined,
        target_value: targetValue ? parseFloat(targetValue) : undefined,
      })
      setTitle('')
      setDescription('')
      setTargetDate('')
      setMetric('')
      setTargetValue('')
      setOpen(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Add goal
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New goal</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="goal-title">Title *</Label>
            <Input
              id="goal-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Sub-1h 40k TT"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="goal-desc">Description</Label>
            <Input
              id="goal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-metric">Metric</Label>
              <Input
                id="goal-metric"
                value={metric}
                onChange={(e) => setMetric(e.target.value)}
                placeholder="e.g. ftp_w"
              />
            </div>
          </div>
          {metric && (
            <div className="space-y-2">
              <Label htmlFor="goal-target">Target value</Label>
              <Input
                id="goal-target"
                type="number"
                value={targetValue}
                onChange={(e) => setTargetValue(e.target.value)}
                placeholder="e.g. 300"
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Create goal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default function GoalsPage() {
  const { data: goals, mutate } = useSWR<Goal[]>('/api/goals/', fetcher)

  async function handleCreate(data: GoalCreate) {
    try {
      await apiFetch('/api/goals/', { method: 'POST', body: JSON.stringify(data) })
      await mutate()
      toast({ title: 'Goal created' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
      throw err
    }
  }

  async function handleAchieve(id: number) {
    try {
      await apiFetch(`/api/goals/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'achieved' }),
      })
      await mutate()
      toast({ title: 'Goal marked as achieved!' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/api/goals/${id}`, { method: 'DELETE' })
      await mutate()
      toast({ title: 'Goal deleted' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      })
    }
  }

  const active = goals?.filter((g) => g.status === 'active') ?? []
  const achieved = goals?.filter((g) => g.status === 'achieved') ?? []

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Goals</h1>
        <GoalForm onSave={handleCreate} />
      </div>

      {active.length === 0 && achieved.length === 0 && (
        <p className="text-sm text-muted-foreground">No goals yet. Add one to get started!</p>
      )}

      {active.length > 0 && (
        <div className="space-y-3">
          {active.map((goal) => (
            <Card key={goal.id}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{goal.title}</p>
                    {goal.description && (
                      <p className="text-sm text-muted-foreground mt-0.5">{goal.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      {goal.target_date && <span>Target: {formatDate(goal.target_date)}</span>}
                      {goal.metric && goal.target_value != null && (
                        <span>
                          {goal.metric}: {goal.current_value ?? '—'} / {goal.target_value}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-green-600"
                      title="Mark achieved"
                      onClick={() => handleAchieve(goal.id)}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete goal?</AlertDialogTitle>
                          <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => handleDelete(goal.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {achieved.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2 uppercase tracking-wide">
            Achieved
          </h2>
          <div className="space-y-2">
            {achieved.map((goal) => (
              <Card key={goal.id} className="opacity-70">
                <CardContent className="pt-3 pb-3 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium line-through text-muted-foreground">
                      {goal.title}
                    </p>
                  </div>
                  <Badge variant="secondary">Achieved</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
