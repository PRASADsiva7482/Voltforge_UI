/**
 * Sets up globalThis.self before SimulationWorker is imported.
 */

export interface PostedMessageRecord {
  message: any;
  transfer?: Transferable[];
}

export const postedMessages: PostedMessageRecord[] = [];

(globalThis as any).self = {
  postMessage: (message: any, options?: { transfer?: Transferable[] }) => {
    postedMessages.push({ message, transfer: options?.transfer });
  },
  onmessage: null,
};

