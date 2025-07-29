import { EQueueMode } from "../pool";
import { ComfyApi } from "../client";
import { TMonitorEvent } from "../features/monitoring";

export type TEventStatus = {
  status: {
    exec_info: {
      queue_remaining: number;
    };
  };
  sid: string;
};

export type TExecution = {
  prompt_id: string;
};

export type TExecuting = TExecution & {
  node: string | null;
};

export type TProgress = TExecuting & {
  value: number;
  max: number;
};

export type TExecuted<T = unknown> = TExecution & {
  node: string;
  output: T;
};

export type TExecutionCached = TExecution & {
  nodes: string[];
};

export type TExecutionError = TExecution & {
  node_id: string;
  node_type: string;
  exception_message: string;
  exception_type: string;
  traceback: string[];
};

export type TExecutionInterrupted = TExecution & {
  node_id: string;
  node_type: string;
  executed: string[];
};

export type TEventKey =
  | "all"
  | "auth_error"
  | "connection_error"
  | "auth_success"
  | "status"
  | "progress"
  | "executing"
  | "executed"
  | "disconnected"
  | "execution_success"
  | "execution_start"
  | "execution_error"
  | "execution_cached"
  | "queue_error"
  | "reconnected"
  | "connected"
  | "log"
  | "terminal"
  | "reconnecting"
  | "b_preview";

export type TComfyAPIEventMap = {
  all: CustomEvent<{ type: string; data: any }>;
  auth_error: CustomEvent<Response>;
  auth_success: CustomEvent<null>;
  connection_error: CustomEvent<Error>;
  execution_success: CustomEvent<TExecution>;
  status: CustomEvent<TEventStatus>;
  disconnected: CustomEvent<null>;
  reconnecting: CustomEvent<null>;
  connected: CustomEvent<null>;
  reconnected: CustomEvent<null>;
  b_preview: CustomEvent<Blob>;
  log: CustomEvent<{ msg: string; data: any }>;
  terminal: CustomEvent<{ m: string; t: string }>;
  execution_start: CustomEvent<TExecution>;
  executing: CustomEvent<TExecuting>;
  progress: CustomEvent<TProgress>;
  executed: CustomEvent<TExecuted>;
  queue_error: CustomEvent<Error>;
  execution_error: CustomEvent<TExecutionError>;
  execution_interrupted: CustomEvent<TExecutionInterrupted>;
  execution_cached: CustomEvent<TExecutionCached>;
};

export type TComfyPoolEventKey =
  | "init"
  | "init_client"
  | "auth_error"
  | "connection_error"
  | "auth_success"
  | "added"
  | "removed"
  | "add_job"
  | "have_job"
  | "idle"
  | "terminal"
  | "ready"
  | "change_mode"
  | "connected"
  | "disconnected"
  | "reconnected"
  | "executing"
  | "executed"
  | "execution_interrupted"
  | "execution_error"
  | "system_monitor";

export type TComfyPoolEventMap = {
  init: CustomEvent<null>;
  auth_error: CustomEvent<{
    client: ComfyApi;
    clientIdx: number;
    res: Response;
  }>;
  connection_error: CustomEvent<{
    client: ComfyApi;
    clientIdx: number;
    error: Error;
  }>;
  terminal: CustomEvent<{ clientIdx: number; m: string; t: string }>;
  ready: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  auth_success: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  loading_client: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  change_mode: CustomEvent<{ mode: EQueueMode }>;
  added: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  removed: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  connected: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  disconnected: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  reconnected: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  add_job: CustomEvent<{ jobIdx: number; weight: number }>;
  have_job: CustomEvent<{ client: ComfyApi; remain: number }>;
  idle: CustomEvent<{ client: ComfyApi }>;
  execution_interrupted: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  executing: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  executed: CustomEvent<{ client: ComfyApi; clientIdx: number }>;
  execution_error: CustomEvent<{
    client: ComfyApi;
    clientIdx: number;
    error: Error;
    willRetry?: boolean;
    attempt?: number;
    maxRetries?: number;
  }>;
  system_monitor: CustomEvent<{
    client: ComfyApi;
    clientIdx: number;
    data: TMonitorEvent;
  }>;
};
