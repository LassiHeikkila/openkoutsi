'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'

interface ProviderCardProps {
  name: string
  connected: boolean
  onConnect: () => void
  onSync: () => void
  /** Called with deleteData=true or false depending on user's choice */
  onDisconnect: (deleteData: boolean) => void
  syncing?: boolean
}

export function ProviderCard({
  name,
  connected,
  onConnect,
  onSync,
  onDisconnect,
  syncing = false,
}: ProviderCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false)

  function handleDisconnectClick() {
    setDialogOpen(true)
  }

  function handleDisconnectOnly() {
    setDialogOpen(false)
    onDisconnect(false)
  }

  function handleDisconnectAndDelete() {
    setDialogOpen(false)
    onDisconnect(true)
  }

  return (
    <>
      <div className="flex items-center gap-3">
        {connected ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm">Connected</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
                {syncing ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                onClick={handleDisconnectClick}
              >
                Disconnect
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
            <span className="text-sm text-muted-foreground">Not connected</span>
            <Button size="sm" className="ml-auto" onClick={onConnect}>
              Connect {name}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Do you also want to delete all activities imported from {name}?
              This cannot be undone — deleted activities and their data will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button variant="outline" onClick={handleDisconnectOnly}>
              Disconnect only
            </Button>
            <Button variant="destructive" onClick={handleDisconnectAndDelete}>
              Disconnect and delete data
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
