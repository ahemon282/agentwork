export type ApiErrorShape = {
  ok?: boolean;
  error?: string;
  message?: string;
  details?: unknown;
};

export interface DashboardTask {
  id: string;
  title: string;
  description: string;
  category: string;
  budget_sats: number;
  status: string | null;
  created_at: string | null;
  winning_agent_id: string | null;
}

export interface DashboardTransaction {
  id: string;
  task_id: string | null;
  amount_sats: number;
  type: string;
  status: string | null;
  created_at: string | null;
}

export interface DashboardAgent {
  id: string;
  name: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
  is_online: boolean | null;
}

export interface DashboardPipeline {
  id: string;
  name: string;
  status: string | null;
  total_sats: number | null;
  created_at: string | null;
}

export interface DashboardResponse {
  ok: true;
  dashboard: {
    hero: {
      total_sats_transacted: number;
      tasks_completed: number;
      active_agents: number;
    };
    market: {
      tasks: DashboardTask[];
    };
    payments: {
      recent_transactions: DashboardTransaction[];
    };
    agents: {
      top_agents: DashboardAgent[];
    };
    pipelines: {
      recent_pipelines: DashboardPipeline[];
    };
    salary_mode: {
      active_streams: number;
      total_streamed: number;
    };
  };
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
  tasks_failed: number | null;
  is_online: boolean | null;
  wallet_address: string | null;
  created_at: string | null;
}

export interface AgentsResponse {
  ok: true;
  agents: Agent[];
  summary: {
    total_agents: number;
    active_agents: number;
    specialties: string[];
  };
}

export interface StatsTopAgent {
  id: string;
  name: string;
  specialty: string | null;
  reputation: number | null;
  total_earned: number | null;
  tasks_completed: number | null;
}

export interface StatsRecentTransaction {
  id: string;
  task_id: string | null;
  amount_sats: number;
  type: string;
  status: string | null;
  created_at: string | null;
}

export interface StatsResponse {
  ok: true;
  stats: {
    total_sats_transacted: number;
    sats_today: number;
    active_tasks: number;
    completed_tasks: number;
    disputed_tasks: number;
    active_agents: number;
    average_completion_seconds: number;
    success_rate: number;
    total_pipelines: number;
    active_salary_streams: number;
    top_agents: StatsTopAgent[];
    recent_transactions: StatsRecentTransaction[];
  };
}

export interface SalaryStreamAgentLite {
  id: string;
  name: string;
  specialty: string | null;
  is_online: boolean | null;
}

export interface SalaryStream {
  id: string;
  agent_id: string | null;
  sats_per_second: number;
  total_streamed: number | null;
  is_active: boolean | null;
  started_at: string | null;
  stopped_at: string | null;
}

export interface SalaryStreamWithAgent extends SalaryStream {
  agent: SalaryStreamAgentLite | null;
}

export interface SalaryStreamsResponse {
  ok: true;
  streams: SalaryStreamWithAgent[];
  summary: {
    active_streams: number;
    total_streamed: number;
    average_sats_per_second: number;
  };
}

export interface SalaryStreamResponse {
  ok: true;
  stream: SalaryStreamWithAgent | SalaryStream;
  message?: string;
}

export interface DemoRunResponse {
  ok: boolean;
  mode: "seed" | "task_flow" | "full_demo";
  summary: {
    agents_created?: number;
    tasks_created?: number;
    bids_created?: number;
    tasks_completed?: number;
    tasks_disputed?: number;
  };
  details?: unknown;
}

export interface PipelineExecutedStep {
  step_index: number;
  title: string;
  category: string;
  agent_id: string | null;
  task_id: string;
  verification_passed: boolean;
  status: string;
}

export interface PipelineExecuteResponse {
  ok: boolean;
  pipeline_id: string;
  status: string;
  total_sats: number;
  executed_steps: PipelineExecutedStep[];
  message: string;
  details?: unknown;
}

export type SalaryStreamAction = "stop" | "tick" | "update_rate";

export interface CreateSalaryStreamPayload {
  agent_id: string;
  sats_per_second: number;
}

export interface UpdateSalaryStreamPayload {
  action: SalaryStreamAction;
  amount?: number;
  sats_per_second?: number;
}
