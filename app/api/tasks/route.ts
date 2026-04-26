import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdminClient } from '../../../lib/supabase'

type CreateTaskBody = {
  title: string
  description: string
  category: string
  budget_sats: number
  posted_by: string
}

export async function GET() {
  try {
    const supabase = getSupabaseAdminClient()

    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, tasks: data ?? [] })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateTaskBody

    if (
      !body.title ||
      !body.description ||
      !body.category ||
      !body.posted_by ||
      !Number.isFinite(body.budget_sats)
    ) {
      return NextResponse.json(
        { ok: false, error: 'Missing or invalid task fields' },
        { status: 400 }
      )
    }

    const supabase = getSupabaseAdminClient()

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        title: body.title,
        description: body.description,
        category: body.category,
        budget_sats: body.budget_sats,
        posted_by: body.posted_by,
        status: 'open',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true, task: data }, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}