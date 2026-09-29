import { useSyncExternalStore } from "react";
import type { ControllerState, ReminderController } from "../app/controller";

export function useControllerState(controller: ReminderController): ControllerState {
  return useSyncExternalStore(
    (cb) => controller.subscribe(cb),
    () => controller.getState(),
  );
}
