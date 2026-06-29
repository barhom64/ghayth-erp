import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'sa.door.ghayth',
  appName: 'غيث ERP',
  webDir: 'dist-web',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    LocalNotifications: {
      smallIcon: 'ic_stat_icon_config_sample',
      iconColor: '#F97316',
    },
    Geolocation: {
      requestAlwaysPermission: false,
    },
  },
};

export default config;
