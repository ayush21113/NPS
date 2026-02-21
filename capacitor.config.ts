import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.nps.onboarding',
    appName: 'NPS Onboarding',
    webDir: 'frontend',
    server: {
        androidScheme: 'https'
    }
};

export default config;
