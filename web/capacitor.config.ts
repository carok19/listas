import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.alabanza.app',
  appName: 'Alabanza',
  webDir: 'dist',
  android: {
    // Permite reproducir audio sin que el usuario toque primero la pantalla.
    allowMixedContent: false,
  },
  plugins: {
    // Solo lo usamos explícitamente (LRCLIB); no reemplaza fetch global.
    CapacitorHttp: { enabled: false },
  },
}

export default config
