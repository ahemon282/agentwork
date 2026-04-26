import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * AgentWork Supabase helper
 *
 * This single file gives you:
 * - browser/client-safe Supabase client
 * - server-side Supabase client
 * - admin/service-role Supabase client
 *
 * Notes:
 * - NEXT_PUBLIC_* vars are safe for browser use.
 * - SERVICE_ROLE must NEVER be used in client components.
 * - We support both the legacy anon key and the newer publishable key name.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

// Shared types you can expand later with generated DB types.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      agents: {
        Row: {
          id: string
          name: string
          type: string
          specialty: string | null
          reputation: number | null
          total_earned: number | null
          tasks_completed: number | null
          tasks_failed: number | null
          is_online: boolean | null
          wallet_address: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          type: string
          specialty?: string | null
          reputation?: number | null
          total_earned?: number | null
          tasks_completed?: number | null
          tasks_failed?: number | null
          is_online?: boolean | null
          wallet_address?: string | null
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['agents']['Insert']>
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          title: string
          description: string
          category: string
          budget_sats: number
          status: string | null
          posted_by: string
          winning_agent_id: string | null
          output: Json | null
          verification_passed: boolean | null
          payment_hash: string | null
          created_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          title: string
          description: string
          category: string
          budget_sats: number
          status?: string | null
          posted_by: string
          winning_agent_id?: string | null
          output?: Json | null
          verification_passed?: boolean | null
          payment_hash?: string | null
          created_at?: string | null
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['tasks']['Insert']>
        Relationships: []
      }
      bids: {
        Row: {
          id: string
          task_id: string | null
          agent_id: string | null
          amount_sats: number
          estimated_time: number | null
          created_at: string | null
        }
        Insert: {
          id?: string
          task_id?: string | null
          agent_id?: string | null
          amount_sats: number
          estimated_time?: number | null
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['bids']['Insert']>
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          task_id: string | null
          from_wallet: string | null
          to_wallet: string | null
          amount_sats: number
          type: string
          payment_hash: string | null
          status: string | null
          created_at: string | null
        }
        Insert: {
          id?: string
          task_id?: string | null
          from_wallet?: string | null
          to_wallet?: string | null
          amount_sats: number
          type: string
          payment_hash?: string | null
          status?: string | null
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>
        Relationships: []
      }
      pipelines: {
        Row: {
          id: string
          name: string
          status: string | null
          total_sats: number | null
          steps: Json
          created_at: string | null
        }
        Insert: {
          id?: string
          name: string
          status?: string | null
          total_sats?: number | null
          steps: Json
          created_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['pipelines']['Insert']>
        Relationships: []
      }
      salary_streams: {
        Row: {
          id: string
          agent_id: string | null
          sats_per_second: number
          total_streamed: number | null
          is_active: boolean | null
          started_at: string | null
          stopped_at: string | null
        }
        Insert: {
          id?: string
          agent_id?: string | null
          sats_per_second: number
          total_streamed?: number | null
          is_active?: boolean | null
          started_at?: string | null
          stopped_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['salary_streams']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

type AgentWorkSupabaseClient = SupabaseClient<Database>

// Browser singleton so hot reload doesn't create lots of clients.
let browserClient: AgentWorkSupabaseClient | null = null

/**
 * Use in client components / browser-safe code.
 * Uses the publishable/anon key only.
 */
export function getSupabaseBrowserClient(): AgentWorkSupabaseClient {
  if (typeof window === 'undefined') {
    throw new Error(
      'getSupabaseBrowserClient() was called on the server. Use getSupabaseServerClient() instead.'
    )
  }

  if (!browserClient) {
    browserClient = createClient<Database>(
      requireEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
      requireEnv(
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
        supabasePublishableKey
      ),
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
        },
      }
    )
  }

  return browserClient
}

/**
 * Use in route handlers / server-only code where you do NOT need admin bypass.
 * Still respects RLS because it uses the public key.
 */
export function getSupabaseServerClient(): AgentWorkSupabaseClient {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
    requireEnv(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY',
      supabasePublishableKey
    ),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

/**
 * Use ONLY in secure server code (route handlers, server actions, scripts).
 * This bypasses RLS because it uses the service-role key.
 * Never import this into client components.
 */
export function getSupabaseAdminClient(): AgentWorkSupabaseClient {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL', supabaseUrl),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY', supabaseServiceRoleKey),
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

/**
 * Small health check helper.
 */
export async function checkSupabaseConnection(): Promise<{
  ok: boolean
  error?: string
}> {
  try {
    const supabase = getSupabaseAdminClient()
    const { error } = await supabase.from('agents').select('id').limit(1)
    if (error) {
      return { ok: false, error: error.message }
    }
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown Supabase error',
    }
  }
}