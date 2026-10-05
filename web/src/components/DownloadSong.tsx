import { useMutation } from '@tanstack/react-query'
import { downloadSong, downloadWithBrowser, SAVE_LOCATION } from '../lib/files'
import { isNative } from '../lib/platform'
import { errorMessage } from '../lib/supabase'
import type { Song } from '../lib/types'
import { Button, ErrorBox } from './ui'

export function DownloadSong({ song }: { song: Song }) {
  const dl = useMutation({ mutationFn: () => downloadSong(song) })
  return (
    <div>
      <Button variant="secondary" className="w-full" loading={dl.isPending} onClick={() => dl.mutate()}>
        ⬇ Descargar audio
      </Button>
      {dl.isSuccess && (
        <p className="mt-2 text-center text-xs text-emerald-400">
          {isNative ? `✓ Guardada en ${SAVE_LOCATION}` : '✓ Descargando… revisa tu carpeta de Descargas.'}
        </p>
      )}
      {dl.error && (
        <div className="mt-2">
          <ErrorBox
            action={isNative && <Button variant="secondary" onClick={() => downloadWithBrowser(song)}>Descargar con el navegador</Button>}
          >
            {errorMessage(dl.error)}
          </ErrorBox>
        </div>
      )}
    </div>
  )
}
