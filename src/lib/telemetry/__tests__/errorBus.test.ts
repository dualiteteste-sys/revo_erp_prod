import { beforeEach, describe, expect, it } from "vitest";

import {
  buildIncidentPrompt,
  clearErrorIncidents,
  countErrorIncidentsBySeverity,
  getErrorIncidentsSnapshot,
  isKnownExternalNoise,
  recordErrorIncident,
} from "@/lib/telemetry/errorBus";

describe("errorBus", () => {
  beforeEach(() => {
    clearErrorIncidents();
  });

  it("agrega ocorrências por fingerprint", () => {
    recordErrorIncident({
      source: "network.rpc",
      message: "rpc:financeiro_get -> HTTP_500",
      http_status: 500,
      code: "XX000",
      route: "/app/financeiro",
      url: "https://example.test/rest/v1/rpc/financeiro_get",
    });
    recordErrorIncident({
      source: "network.rpc",
      message: "rpc:financeiro_get -> HTTP_500",
      http_status: 500,
      code: "XX000",
      route: "/app/financeiro",
      url: "https://example.test/rest/v1/rpc/financeiro_get",
    });

    const incidents = getErrorIncidentsSnapshot();
    expect(incidents.length).toBe(1);
    expect(incidents[0]?.occurrences).toBe(1);
    expect(incidents[0]?.severity).toBe("P0");
  });

  it("classifica ruído de extensão como externo", () => {
    expect(
      isKnownExternalNoise(
        "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
        "console.error",
      ),
    ).toBe(true);

    recordErrorIncident({
      source: "console.error",
      message:
        "A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received",
    });

    expect(getErrorIncidentsSnapshot().length).toBe(0);
  });

  it("gera prompt técnico com seções principais", () => {
    recordErrorIncident({
      source: "network.edge",
      message: "fn:woocommerce-admin: MASTER_KEY_MISSING",
      http_status: 500,
      code: "MASTER_KEY_MISSING",
      route: "/app/desenvolvedor/woocommerce",
      request_id: "req_123",
      url: "https://project.supabase.co/functions/v1/woocommerce-admin",
      stack: "{\"ok\":false,\"error\":\"MASTER_KEY_MISSING\"}",
    });

    const incident = getErrorIncidentsSnapshot()[0];
    expect(incident).toBeTruthy();
    const prompt = buildIncidentPrompt(incident!);
    expect(prompt).toContain("### Resumo executivo");
    expect(prompt).toContain("### Evidências técnicas");
    expect(prompt).toContain("### Passos para reproduzir");
    expect(prompt).toContain("request_id: req_123");
  });

  it("retorna contadores por severidade", () => {
    recordErrorIncident({
      source: "network.rpc",
      message: "HTTP_403",
      http_status: 403,
      route: "/app/a",
    });
    recordErrorIncident({
      source: "console.warn",
      message: "campo opcional ausente",
      route: "/app/b",
    });

    const counters = countErrorIncidentsBySeverity();
    expect(counters.P0).toBe(1);
    expect(counters.P2).toBe(1);
  });
});
