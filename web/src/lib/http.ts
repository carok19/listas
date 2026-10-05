// Leer páginas de otros sitios (letras.com y parecidos). En la APK la petición sale
// directo del celular, como haría el navegador; en la web pasa por el servicio de
// descarga, porque el navegador la bloquea (CORS).
import { CapacitorHttp } from '@capacitor/core'
import { pageViaDownloader } from './downloader'
import { isNative } from './platform'

export async function getText(url: string): Promise<string> {
  if (!isNative) return pageViaDownloader(url)
  const res = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': navigator.userAgent, Accept: 'text/html,application/json;q=0.9,*/*;q=0.8' },
    responseType: 'text',
    connectTimeout: 15_000,
    readTimeout: 20_000,
  })
  if (res.status >= 400) throw new Error(`El sitio respondió con error ${res.status}.`)
  return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
}
