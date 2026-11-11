import type {ServerResponse} from 'node:http';

export interface StudioEvent {
  id: number;
  projectId: string;
  kind: string;
  jobId?: string;
  timestamp: string;
  payload: unknown;
}

export class StudioEvents {
  private nextId = 0;
  private history: StudioEvent[] = [];
  private clients = new Set<{projectId: string; response: ServerResponse}>();

  publish(projectId: string, kind: string, payload: unknown, jobId?: string): void {
    const event: StudioEvent = {id: ++this.nextId, projectId, kind, payload, timestamp: new Date().toISOString(), ...(jobId ? {jobId} : {})};
    this.history.push(event);
    if (this.history.length > 600) this.history.shift();
    for (const client of this.clients) {
      if (client.projectId === projectId) this.send(client.response, event);
    }
  }

  subscribe(projectId: string, response: ServerResponse, after = 0): () => void {
    const client = {projectId, response};
    this.clients.add(client);
    const oldest = this.history[0]?.id ?? 0;
    if (after > this.nextId || after > 0 && oldest > after + 1) {
      this.send(response, {id: this.nextId, projectId, kind: 'stream.reset', timestamp: new Date().toISOString(), payload: {resync: true}});
    } else {
      for (const event of this.history) if (event.projectId === projectId && event.id > after) this.send(response, event);
    }
    response.write(': connected\n\n');
    const timer = setInterval(() => response.write(': heartbeat\n\n'), 20_000);
    timer.unref();
    return () => { clearInterval(timer); this.clients.delete(client); };
  }

  private send(response: ServerResponse, event: StudioEvent): void {
    if (response.destroyed) return;
    if (response.writableLength > 512_000) { response.destroy(); return; }
    response.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`);
  }

  close(): void {
    for (const {response} of this.clients) response.end();
    this.clients.clear();
  }
}
