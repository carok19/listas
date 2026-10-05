import type { ReactNode } from 'react'
import { Header, Page } from '../components/Layout'
import { APK_DOWNLOAD_URL, isNative } from '../lib/platform'

function Topic({ title, children, open }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl bg-slate-900 p-4 [&_li]:mt-1.5">
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 font-semibold">
        {title}
        <span aria-hidden className="text-slate-400 transition group-open:rotate-90">›</span>
      </summary>
      <div className="mt-2 text-[15px] leading-relaxed text-slate-300">{children}</div>
    </details>
  )
}

export default function Help() {
  return (
    <>
      <Header title="¿Cómo se usa?" back />
      <Page>
        <div className="space-y-3">
          <Topic title="Agregar canciones (director)" open>
            <p>En <b>Canciones › + Agregar</b> hay cuatro formas:</p>
            <ul className="list-disc pl-5">
              <li><b>YouTube</b>: busca la canción y toca un resultado. El audio se descarga en tu celular, se guarda en el grupo y la letra se busca sola.</li>
              <li><b>Subir MP3</b>: elige uno o varios audios del celular (MP3 o M4A).</li>
              <li><b>Link</b>: pega el link de un video de YouTube, Facebook, Instagram u otro sitio.</li>
              <li><b>Solo letra</b>: crea la canción sin audio.</li>
            </ul>
            <p className="mt-2">Si una descarga falla, no se guarda nada: prueba con otro resultado o sube el audio.</p>
          </Topic>

          <Topic title="Escuchar con la letra">
            <p>Abre una canción: el reproductor queda abajo y la letra se lee mientras suena. Con <b>A− / A+</b> cambias el tamaño de la letra. La pantalla no se apaga mientras suena.</p>
          </Topic>

          <Topic title="Letras">
            <p>Se buscan solas en letras.com y LRCLIB. Si no es la correcta, toca <b>Buscar otra letra</b>. Si no aparece, usa los botones <b>Google</b> o <b>letras.com</b>: copia la letra en el navegador, vuelve y toca <b>Pegar lo copiado</b>. También puedes escribirla con <b>Editar</b>.</p>
          </Topic>

          <Topic title="Listas para el servicio">
            <ul className="list-disc pl-5">
              <li>En <b>Listas › + Nueva</b> eliges la fecha y agregas canciones de la biblioteca.</li>
              <li>Arrastra <b>≡</b> para cambiar el orden.</li>
              <li><b>Tono</b> cambia el tono solo para ese servicio.</li>
              <li><b>Ensayar / Presentar</b> muestra la letra en grande; desliza a los lados para pasar de canción.</li>
            </ul>
          </Topic>

          <Topic title="Sin internet y descargas">
            <ul className="list-disc pl-5">
              <li><b>Guardar sin internet</b> (en cada lista): guarda letras y audios <i>dentro de la app</i> para ensayar sin conexión. Se borra solo un mes después del servicio, o antes con <b>Quitar</b>.</li>
              <li><b>Descargar audio</b>: copia el archivo a tu celular{isNative ? ' (carpeta Documentos › Alabanza)' : ''} para escucharlo en otras apps o enviarlo.</li>
            </ul>
          </Topic>

          <Topic title="Invitar al equipo">
            <p>En <b>Grupo › Invitar</b> comparte por WhatsApp o muestra el QR. Les llega el link de la app y el código del grupo. Los <b>miembros</b> ven, escuchan y descargan; solo los <b>administradores</b> agregan y editan. Puedes hacer administrador a otra persona desde la lista de miembros.</p>
          </Topic>

          {isNative && (
            <Topic title="Actualizar la app">
              <p>
                Cuando haya una versión nueva aparece un aviso en la pantalla de inicio. También puedes bajarla cuando quieras desde{' '}
                <a className="text-indigo-300 underline" href={APK_DOWNLOAD_URL}>este link</a>; se instala encima sin perder nada.
              </p>
            </Topic>
          )}
        </div>
      </Page>
    </>
  )
}
