import { getDashboard } from "./api";
import type {
  DashboardAgent,
  DashboardPipeline,
  DashboardTask,
  DashboardTransaction,
} from "../types/api";

export type HeroData = {
  total_sats_transacted: number;
  tasks_completed: number;
  active_agents: number;
};

export type MarketData = {
  tasks: DashboardTask[];
};

export type PaymentFeedData = {
  recent_transactions: DashboardTransaction[];
};

export type TopAgentsData = {
  top_agents: DashboardAgent[];
};

export type PipelineSummaryData = {
  recent_pipelines: DashboardPipeline[];
};

export async function getHeroData(): Promise<HeroData> {
  const response = await getDashboard();
  return {
    total_sats_transacted: response.dashboard.hero.total_sats_transacted,
    tasks_completed: response.dashboard.hero.tasks_completed,
    active_agents: response.dashboard.hero.active_agents,
  };
}

export async function getMarketData(): Promise<MarketData> {
  const response = await getDashboard();
  return {
    tasks: response.dashboard.market.tasks,
  };
}

export async function getPaymentFeedData(): Promise<PaymentFeedData> {
  const response = await getDashboard();
  return {
    recent_transactions: response.dashboard.payments.recent_transactions,
  };
}

export async function getTopAgentsData(): Promise<TopAgentsData> {
  const response = await getDashboard();
  return {
    top_agents: response.dashboard.agents.top_agents,
  };
}

export async function getPipelineSummaryData(): Promise<PipelineSummaryData> {
  const response = await getDashboard();
  return {
    recent_pipelines: response.dashboard.pipelines.recent_pipelines,
  };
}
