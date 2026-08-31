import type { AscendCoachClientListItem, Client360View, CoachInsightAvailability } from "@ascend/shared";
import { api } from "./api";
import { getFirebaseToken } from "./authToken";

async function coachApi<T>(path: string, options: RequestInit = {}) {
  try {
    return await api<T>(path, options, await getFirebaseToken());
  } catch (error) {
    if (!(error instanceof Error) || !/401|expired token|bearer token/i.test(error.message)) throw error;
    return api<T>(path, options, await getFirebaseToken(true));
  }
}

export function getAscendCoachClients() {
  return coachApi<{ clients: AscendCoachClientListItem[] }>("/ascend-coach/clients");
}

export function getClient360(clientId: string) {
  return coachApi<Client360View>(`/ascend-coach/clients/${encodeURIComponent(clientId)}/360`);
}

export function refreshCoachInsight(clientId: string) {
  return coachApi<{ coachInsight: CoachInsightAvailability }>(
    `/ascend-coach/clients/${encodeURIComponent(clientId)}/coach-insight/refresh`,
    { method: "POST" }
  );
}
