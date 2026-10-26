import type { ServiceStatus } from "@/types/services";

/** PHP is a runtime, not a separately managed service. */
export function bulkServiceActions(
  services: { apache: ServiceStatus; mysql: ServiceStatus },
  initialLoading: boolean,
  busy: boolean,
) {
  const states = [services.apache, services.mysql];
  const blocked = initialLoading || busy || states.some(
    service => service.state === "starting" || service.state === "stopping",
  );
  return {
    canStart: !blocked && states.some(service => !service.running),
    canStop: !blocked && states.some(service => service.running),
    canRestart: !blocked && states.some(service => service.running),
  };
}
