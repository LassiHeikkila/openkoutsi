'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
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
import { toast } from '@/components/ui/use-toast'

interface ProviderCardProps {
  name: string
  connected: boolean
  /** Whether the server has credentials configured for this provider. Undefined = still loading. */
  configured?: boolean
  onConnect: () => void
  onSync: () => void
  /** Called with deleteData=true or false depending on user's choice */
  onDisconnect: (deleteData: boolean) => void
  syncing?: boolean
}

export function ProviderCard({
  name,
  connected,
  configured,
  onConnect,
  onSync,
  onDisconnect,
  syncing = false,
}: ProviderCardProps) {
  const t = useTranslations('app')
  const tCommon = useTranslations('common')
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

  function handleConnectClick() {
    if (configured === false) {
      toast({
        title: t('profile.provider.notConfiguredTitle', { name }),
        description: t('profile.provider.notConfiguredDesc', { name }),
        variant: 'destructive',
      })
      return
    }
    onConnect()
  }

  const notConfigured = configured === false

  return (
    <>
      <div className="flex items-center gap-3">
        {connected ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
            <span className="text-sm">{t('profile.provider.connected')}</span>
            <div className="ml-auto flex gap-2">
              <Button variant="outline" size="sm" onClick={onSync} disabled={syncing}>
                {syncing ? t('profile.provider.syncing') : t('profile.provider.syncNow')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30"
                onClick={handleDisconnectClick}
              >
                {t('profile.provider.disconnect')}
              </Button>
            </div>
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-gray-300" />
            <span className="text-sm text-muted-foreground">{t('profile.provider.notConnected')}</span>
            <Button
              size="sm"
              className="ml-auto"
              variant={notConfigured ? 'outline' : 'default'}
              disabled={configured === undefined}
              aria-disabled={notConfigured}
              onClick={handleConnectClick}
            >
              {t('profile.provider.connectBtn', { name })}
            </Button>
          </>
        )}
      </div>

      {notConfigured && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          {t('profile.provider.notConfigured', { name })}
        </p>
      )}

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('profile.provider.disconnectTitle', { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('profile.provider.disconnectDesc', { name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogCancel className="mt-0">{tCommon('cancel')}</AlertDialogCancel>
            <Button variant="outline" onClick={handleDisconnectOnly}>
              {t('profile.provider.disconnectOnly')}
            </Button>
            <Button variant="destructive" onClick={handleDisconnectAndDelete}>
              {t('profile.provider.disconnectAndDelete')}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
