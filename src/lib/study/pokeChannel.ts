import type { RealtimeChannel } from "@supabase/supabase-js";
import type { PokeSender } from "./pokeTransport";

type Client = {
  channel: (topic: string, options: {config: {private: boolean; broadcast: {ack: boolean}; presence: {key: string; enabled: boolean}}}) => RealtimeChannel;
  removeChannel: (channel: RealtimeChannel) => Promise<unknown>;
};
export interface PokeChannel extends PokeSender { close(): Promise<void> }

/** One disposable sibling topic; no state events, snapshot reads or periodic heartbeat. */
export function openPokeChannel(client: Client, stateTopic: string, myId: string, receive: (payload: unknown) => void): PokeChannel {
  let channel: RealtimeChannel | null = null, joined = false, stopped = false, generation = 0, failures = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closing: Promise<unknown> = Promise.resolve();
  const delays = [3000, 10000, 30000, 60000];
  async function connect() {
    const mine = ++generation;
    await closing;
    if (stopped || mine !== generation) return;
    const ch = client.channel(`${stateTopic}:pokes`, {config: {private: true, broadcast: {ack: true}, presence: {key: myId, enabled: true}}});
    channel = ch;
    ch.on("broadcast", {event: "poke"}, msg => {
      if (!stopped && mine === generation) receive(msg.payload);
    }).subscribe(status => {
      if (stopped || mine !== generation) return;
      joined = status === "SUBSCRIBED";
      if (joined) {
        failures = 0;
        // Capability only: one announcement per join; SDK Presence removes it on disconnect.
        void ch.track({poke_transport: 1}).catch(() => {});
      } else if (status === "CLOSED") {
        generation++; // SDK removal may synchronously repeat CLOSED for the same instance.
        channel = null;
        closing = client.removeChannel(ch).catch(() => {});
        if (timer === null) timer = setTimeout(() => { timer = null; void connect(); }, delays[Math.min(failures++, delays.length - 1)]);
      }
    });
  }
  void connect();
  return {
    async send(target, tap, recipients) {
      const ch = channel;
      if (!ch || !joined || stopped) return false;
      const present = ch.presenceState<{poke_transport?: unknown}>();
      if (recipients.some(id => id !== myId && !present[id]?.some(p => p.poke_transport === 1))) return false;
      return await ch.send({type: "broadcast", event: "poke", payload: {target, tap}}, {timeout: 1200}) === "ok";
    },
    async close() {
      if (stopped) return;
      stopped = true; joined = false; generation++;
      if (timer !== null) clearTimeout(timer);
      const ch = channel; channel = null;
      await Promise.all([closing, ch ? client.removeChannel(ch).catch(() => {}) : Promise.resolve()]);
    },
  };
}
