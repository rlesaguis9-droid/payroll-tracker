import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Supabase settings come from .env.local locally, or from Vercel env vars in production.
// Accepts both our VITE_ names and the names Vercel's Supabase integration creates.
// Only these two public values are put into the browser bundle.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const pick = (...names) => names.map((n) => env[n]).find(Boolean) || ''
  return {
    plugins: [react()],
    define: {
      __SUPABASE_URL__: JSON.stringify(pick('VITE_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')),
      __SUPABASE_ANON_KEY__: JSON.stringify(pick('VITE_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')),
    },
  }
})
