/**
 * Customer relationships. Everyone who buys a car (or has one serviced) gets
 * a client profile: what they drive, what they spent, how happy they were.
 * Happy clients come back — for service, and after a while for their next
 * car — and a returning customer trusts you: more patient, less haggling.
 * A bad experience loses them for good.
 */
import type { Client, Customer, GameState, Vehicle } from '../types';
import { gameRng } from '../rng';
import { clamp } from '../util';
import { hasTech, nextId, vehicleName } from '../state';
import { ARCHETYPE_BY_ID } from '../../data/game';

export const CLIENT_LIMIT = 400;

export function clientById(state: GameState, id: string | undefined): Client | undefined {
  return id ? state.clients.find((c) => c.id === id) : undefined;
}

/** After a sale: create or update the buyer's profile. */
export function recordPurchase(state: GameState, c: Customer, v: Vehicle, price: number, profit: number, stars: number, serviceDays?: number): Client {
  let client = clientById(state, c.clientId);
  if (!client) {
    client = {
      id: nextId(state, 'cl'),
      name: c.name,
      archetype: c.archetype,
      locationId: v.locationId,
      firstDay: state.day,
      lastDay: state.day,
      purchases: 0,
      spent: 0,
      serviceVisits: 0,
      lifetimeValue: 0,
      satisfaction: stars,
      budget: c.budget,
    };
    state.clients.unshift(client);
    if (state.clients.length > CLIENT_LIMIT) {
      // Forget the least valuable, oldest profiles first.
      state.clients.sort((a, b) => b.lifetimeValue - a.lifetimeValue || b.lastDay - a.lastDay);
      state.clients.length = CLIENT_LIMIT;
    }
  }
  client.purchases += 1;
  client.spent += price;
  client.lifetimeValue += profit;
  client.lastDay = state.day;
  client.satisfaction = client.purchases === 1 ? stars : Math.round(((client.satisfaction * 2 + stars) / 3) * 10) / 10;
  client.car = { name: vehicleName(v), modelId: v.modelId, category: v.category, body: v.body, fuel: v.fuel, year: v.year };
  client.budget = Math.max(client.budget, Math.round(price * 1.1));
  client.lost = stars <= 1 ? true : client.lost && stars < 4;
  const loyalty = ARCHETYPE_BY_ID[c.archetype]?.loyalty ?? 0.5;
  // First service after a few months (sooner with a service plan).
  client.nextServiceDay = state.day + (serviceDays ?? gameRng.int(70, 130));
  // Next car in roughly a year (shorter for loyal types and happy clients).
  client.nextPurchaseDay = state.day + Math.round(gameRng.range(260, 480) * (1.3 - loyalty * 0.5) * (stars >= 4 ? 0.85 : 1.15));
  return client;
}

/** After a service visit. */
export function recordService(state: GameState, clientId: string | undefined, revenue: number, profit: number, happy: boolean): void {
  const client = clientById(state, clientId);
  if (!client) return;
  client.serviceVisits += 1;
  client.lifetimeValue += profit;
  client.spent += revenue;
  client.lastDay = state.day;
  client.satisfaction = Math.round(((client.satisfaction * 3 + (happy ? 5 : 2)) / 4) * 10) / 10;
  client.nextServiceDay = state.day + gameRng.int(90, 160);
}

/** How likely a client is to come back when their time comes (0..1). */
export function returnChance(state: GameState, client: Client): number {
  if (client.lost) return 0;
  const loyalty = ARCHETYPE_BY_ID[client.archetype]?.loyalty ?? 0.5;
  let p = 0.15 + loyalty * 0.35 + (client.satisfaction - 3) * 0.12;
  if (hasTech(state, 'crm')) p *= 1.3;
  if (hasTech(state, 'loyalty')) p *= 1.25;
  p += Math.min(0.1, client.serviceVisits * 0.02);
  return clamp(p, 0, 0.85);
}

/** Clients whose next car is due: some come back as customers today. Returns the ones who do. */
export function returningToday(state: GameState): Client[] {
  const out: Client[] = [];
  for (const client of state.clients) {
    if (!client.nextPurchaseDay || client.nextPurchaseDay > state.day) continue;
    if (!state.locations.some((l) => l.id === client.locationId)) client.locationId = state.locations[0].id;
    if (gameRng.chance(returnChance(state, client))) out.push(client);
    // Either way they will think about it again later.
    client.nextPurchaseDay = state.day + gameRng.int(60, 160);
  }
  return out;
}

/** Makes a returning customer feel like the same person: same kind of buyer, bigger budget, more trust. */
export function applyReturning(c: Customer, client: Client): void {
  c.name = client.name;
  c.clientId = client.id;
  c.archetype = client.archetype;
  c.budget = Math.round(Math.max(c.budget, client.budget * gameRng.range(1.0, 1.25)) / 100) * 100;
  c.patience = Math.min(8, c.patience + 1);
  c.negotiation = Math.max(0.05, c.negotiation - 0.15);
  c.loyalty = Math.min(1, (c.loyalty ?? 0.5) + 0.2);
  c.satisfactionBonus += 4;
  if (client.car && gameRng.chance(0.5)) {
    c.bodies = [...new Set([client.car.body, ...c.bodies])];
    c.categories = [...new Set([client.car.category, ...c.categories])];
  }
}

/** Email campaigns reach your client list: how many people. */
export function reachableClients(state: GameState, locationId?: string): number {
  const list = state.clients.filter((c) => !c.lost && (!locationId || c.locationId === locationId));
  return Math.round(list.length * (hasTech(state, 'crm') ? 2 : 1));
}

export function lifetimeValue(state: GameState): number {
  return state.clients.reduce((s, c) => s + c.lifetimeValue, 0);
}
