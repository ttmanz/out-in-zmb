// Single source of truth for all app-wide config and environment values
export const CONFIG = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  supportedLanguages: ['en'],
  defaultLanguage: 'en',
};
