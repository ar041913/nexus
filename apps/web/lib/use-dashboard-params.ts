"use client";

import { useSearchParams } from "next/navigation";
import type { Persona, Scenario } from "./api";

export function useDashboardParams() {
  const searchParams = useSearchParams();
  
  const scenario = (searchParams.get("scenario") as Scenario) || "revenue_decline";
  const persona = (searchParams.get("persona") as Persona) || "cfo";
  
  return { scenario, persona };
}
