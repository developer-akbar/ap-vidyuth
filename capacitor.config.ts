import { CapacitorConfig } from '@capacitor/cli';

const isProduction = process.env.NODE_ENV === 'production';

const config: CapacitorConfig = {
  appId: 'com.akbar.apvidyuth',
  appName: 'AP Vidyuth',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // cleartext and allowMixedContent REMOVED for production.
    // All API calls go to HTTPS (Vercel). HTTP is not needed.
  },
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: false,
      iosKeychainPrefix: 'apvidyuth',
      androidIsEncryption: false,
      electronWindowsLocation: 'C:\\ProgramData\\CapacitorDatabases',
      electronMacLocation: '/Users/Shared/CapacitorDatabases',
      electronLinuxLocation: 'Databases'
    },
    CapacitorHttp: { enabled: true },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert']
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#6366f1',
      sound: 'beep.wav',
    }
  }
};

export default config;