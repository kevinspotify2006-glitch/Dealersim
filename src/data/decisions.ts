/**
 * Business decisions: events that need an answer. Each option lists its
 * effects as data; sim/decisions.ts applies them. {placeholders} are filled
 * from the decision's own data when it happens.
 */
export type DecisionEffect =
  | { kind: 'cash'; amount: number | string }                 // negative = spend
  | { kind: 'rep'; amount: number }
  | { kind: 'boost'; what: 'leads' | 'service' | 'wtp' | 'ev' | 'parts'; mult: number; days: number }
  | { kind: 'morale'; amount: number; stress?: number }
  | { kind: 'fleet'; discount: number; chance: number; repeat: number; serviceCost?: number }
  | { kind: 'relation'; amount: number }                      // with the decision's brand
  | { kind: 'supplier'; amount: number }                      // with the decision's source
  | { kind: 'offers'; count: number; discount: number }       // extra market offers from the decision's source
  | { kind: 'parts'; qty: number }                            // stock every part up by qty
  | { kind: 'employee'; action: 'raise' | 'promote' | 'leave' }
  | { kind: 'repriceListed'; pct: number }
  | { kind: 'serviceJobs'; count: number }
  | { kind: 'land'; discount: number }
  | { kind: 'gamble'; chance: number; win: DecisionEffect[]; lose: DecisionEffect[] };

export interface DecisionOption { id: string; label: string; detail: string; effects: DecisionEffect[] }

export interface DecisionDef {
  id: string;
  title: string;
  icon: string;
  text: string;
  weight: number;
  minDay: number;
  minLevel: number;
  /** What must be true for it to happen (checked in sim/decisions.ts). */
  needs?: 'contract' | 'employee' | 'rival' | 'workshop' | 'lowSecurity' | 'nextLand' | 'loans' | 'fleetResearch';
  options: DecisionOption[];
  /** Index of the option that happens if you let it expire. */
  fallback: number;
}

export const DECISIONS: DecisionDef[] = [
  {
    id: 'fleetorder', title: 'Company car order', icon: '🚐', weight: 1.1, minDay: 20, minLevel: 2, needs: 'fleetResearch',
    text: '{client} wants {qty} cars for their staff and asks what you can offer.', fallback: 2,
    options: [
      { id: 'discount', label: '5% volume discount', detail: 'They will almost certainly sign. Repeat orders likely.', effects: [{ kind: 'fleet', discount: 0.05, chance: 0.95, repeat: 3 }] },
      { id: 'maintenance', label: 'Free maintenance for a year', detail: 'Only 2% off the cars, but you service them for free (about €{serviceCost}/month). Keeps them loyal.', effects: [{ kind: 'fleet', discount: 0.02, chance: 0.85, repeat: 4, serviceCost: 1 }] },
      { id: 'fast', label: 'Full price, faster delivery', detail: 'Best margin — but half the time they go elsewhere.', effects: [{ kind: 'fleet', discount: 0, chance: 0.5, repeat: 2 }] },
    ],
  },
  {
    id: 'viralpost', title: 'A customer video goes viral', icon: '📱', weight: 0.8, minDay: 15, minLevel: 1,
    text: 'A happy customer\'s handover video has 200,000 views. People are asking where they bought the car.', fallback: 1,
    options: [
      { id: 'promo', label: 'Ride the wave with a promo (€1,500)', detail: '+40% leads for a week, reputation +2.', effects: [{ kind: 'cash', amount: -1500 }, { kind: 'boost', what: 'leads', mult: 1.4, days: 7 }, { kind: 'rep', amount: 2 }] },
      { id: 'thanks', label: 'Say thank you', detail: 'Reputation +1.', effects: [{ kind: 'rep', amount: 1 }, { kind: 'boost', what: 'leads', mult: 1.1, days: 5 }] },
    ],
  },
  {
    id: 'badreview', title: 'An angry review is spreading', icon: '😡', weight: 0.8, minDay: 20, minLevel: 1,
    text: 'A customer says their car broke down a week after buying it. The post is being shared all over town.', fallback: 2,
    options: [
      { id: 'refund', label: 'Pay for the repair and apologise (€{refund})', detail: 'Costs money, turns the story around: reputation +1.', effects: [{ kind: 'cash', amount: '-refund' }, { kind: 'rep', amount: 1 }] },
      { id: 'facts', label: 'Reply with the facts', detail: 'Could go either way.', effects: [{ kind: 'gamble', chance: 0.5, win: [{ kind: 'rep', amount: 1 }], lose: [{ kind: 'rep', amount: -3 }] }] },
      { id: 'ignore', label: 'Ignore it', detail: 'Reputation −4 and fewer walk-ins for 10 days.', effects: [{ kind: 'rep', amount: -4 }, { kind: 'boost', what: 'leads', mult: 0.85, days: 10 }] },
    ],
  },
  {
    id: 'celebrity', title: 'A celebrity wants to buy', icon: '🌟', weight: 0.5, minDay: 30, minLevel: 2,
    text: '{name}, a well-known local TV presenter, wants a car from you — and has a large following.', fallback: 1,
    options: [
      { id: 'publicity', label: '10% off in exchange for publicity', detail: 'You give up about €{discount}; +30% leads for two weeks, reputation +3.', effects: [{ kind: 'cash', amount: '-discount' }, { kind: 'boost', what: 'leads', mult: 1.3, days: 14 }, { kind: 'rep', amount: 3 }] },
      { id: 'discreet', label: 'Full price, discreetly', detail: 'You earn about €{profit} on the deal. Nobody finds out.', effects: [{ kind: 'cash', amount: 'profit' }] },
    ],
  },
  {
    id: 'supplierdeal', title: 'Bulk stock offer', icon: '🚛', weight: 0.9, minDay: 12, minLevel: 1,
    text: '{source} offers you first pick of {count} cars at {pct}% below their usual price — this week only.', fallback: 2,
    options: [
      { id: 'take', label: 'Show me all of them', detail: '{count} discounted offers appear in the market for 3 days. Supplier relationship +5.', effects: [{ kind: 'offers', count: 0, discount: 0 }, { kind: 'supplier', amount: 5 }] },
      { id: 'some', label: 'Just the two best', detail: 'Two discounted offers; relationship +2.', effects: [{ kind: 'offers', count: 2, discount: 0 }, { kind: 'supplier', amount: 2 }] },
      { id: 'decline', label: 'No thanks', detail: 'Relationship −3.', effects: [{ kind: 'supplier', amount: -3 }] },
    ],
  },
  {
    id: 'partsshortage', title: 'Parts shortage warning', icon: '🔩', weight: 0.7, minDay: 25, minLevel: 1, needs: 'workshop',
    text: 'Your parts supplier warns that deliveries will dry up for a few weeks.', fallback: 2,
    options: [
      { id: 'stock', label: 'Stock up now (€{cost})', detail: '+6 of every part at today\'s prices.', effects: [{ kind: 'cash', amount: '-cost' }, { kind: 'parts', qty: 6 }] },
      { id: 'express', label: 'Pay for express delivery when needed', detail: 'Parts cost 25% more for 3 weeks, but never run out.', effects: [{ kind: 'boost', what: 'parts', mult: 1.25, days: 21 }] },
      { id: 'wait', label: 'Wait it out', detail: 'Service work runs 30% slower for two weeks.', effects: [{ kind: 'boost', what: 'service', mult: 0.7, days: 14 }] },
    ],
  },
  {
    id: 'expo', title: 'Regional car expo', icon: '🎪', weight: 0.7, minDay: 20, minLevel: 2,
    text: 'The regional motor show invites you to exhibit next weekend.', fallback: 2,
    options: [
      { id: 'stand', label: 'Book a big stand (€6,000)', detail: '+35% leads for 10 days, reputation +2.', effects: [{ kind: 'cash', amount: -6000 }, { kind: 'boost', what: 'leads', mult: 1.35, days: 10 }, { kind: 'rep', amount: 2 }] },
      { id: 'small', label: 'Send one salesperson (€1,500)', detail: '+12% leads for a week.', effects: [{ kind: 'cash', amount: -1500 }, { kind: 'boost', what: 'leads', mult: 1.12, days: 7 }] },
      { id: 'decline', label: 'Skip it', detail: 'Nothing happens.', effects: [] },
    ],
  },
  {
    id: 'poached', title: 'A rival wants your employee', icon: '🎣', weight: 0.8, minDay: 30, minLevel: 1, needs: 'employee',
    text: '{rival} offered {employee} a better job. They will decide by tomorrow.', fallback: 2,
    options: [
      { id: 'raise', label: 'Counter-offer: +15% salary', detail: 'They stay, happier than before.', effects: [{ kind: 'employee', action: 'raise' }] },
      { id: 'promote', label: 'Promote them', detail: 'A level up and a raise — if they are ready.', effects: [{ kind: 'employee', action: 'promote' }] },
      { id: 'leave', label: 'Wish them well', detail: 'They leave; the team loses a little morale.', effects: [{ kind: 'employee', action: 'leave' }, { kind: 'morale', amount: -3 }] },
    ],
  },
  {
    id: 'rateoffer', title: 'Fix your loan rates?', icon: '🏦', weight: 0.5, minDay: 40, minLevel: 1, needs: 'loans',
    text: 'Your bank expects rates to rise and offers to fix your loans for a €{fee} fee.', fallback: 1,
    options: [
      { id: 'fix', label: 'Fix the rate (€{fee})', detail: 'Your loans\' rates drop by 0.4 points.', effects: [{ kind: 'cash', amount: '-fee' }] },
      { id: 'float', label: 'Stay variable', detail: 'Keep the money; take your chances.', effects: [] },
    ],
  },
  {
    id: 'target', title: 'Manufacturer sales push', icon: '🎯', weight: 0.8, minDay: 20, minLevel: 2, needs: 'contract',
    text: '{brand} asks all dealers to push extra units this month and offers support if you commit.', fallback: 2,
    options: [
      { id: 'campaign', label: 'Commit with a discount campaign (€3,000)', detail: '+20% leads for 2 weeks, relationship +10.', effects: [{ kind: 'cash', amount: -3000 }, { kind: 'boost', what: 'leads', mult: 1.2, days: 14 }, { kind: 'relation', amount: 10 }] },
      { id: 'promise', label: 'Commit without spending', detail: 'Relationship +3.', effects: [{ kind: 'relation', amount: 3 }] },
      { id: 'decline', label: 'Politely decline', detail: 'Relationship −5.', effects: [{ kind: 'relation', amount: -5 }] },
    ],
  },
  {
    id: 'charity', title: 'Charity gala', icon: '🎗️', weight: 0.6, minDay: 15, minLevel: 1,
    text: 'The children\'s hospital asks local businesses to support its annual gala.', fallback: 2,
    options: [
      { id: 'voucher', label: 'Donate a service voucher (€500)', detail: 'Reputation +2.', effects: [{ kind: 'cash', amount: -500 }, { kind: 'rep', amount: 2 }] },
      { id: 'sponsor', label: 'Sponsor the whole gala (€5,000)', detail: 'Reputation +5, +10% leads for two weeks.', effects: [{ kind: 'cash', amount: -5000 }, { kind: 'rep', amount: 5 }, { kind: 'boost', what: 'leads', mult: 1.1, days: 14 }] },
      { id: 'decline', label: 'Decline', detail: 'Nothing happens.', effects: [] },
    ],
  },
  {
    id: 'theft', title: 'Break-ins on the street', icon: '🚨', weight: 0.7, minDay: 20, minLevel: 1, needs: 'lowSecurity',
    text: 'Two dealers nearby had cars damaged overnight. Your lot has little security.', fallback: 2,
    options: [
      { id: 'guard', label: 'Night guard for a month (€2,400)', detail: 'Nothing will happen.', effects: [{ kind: 'cash', amount: -2400 }] },
      { id: 'cameras', label: 'Temporary cameras and lights (€1,200)', detail: 'Most of the risk gone.', effects: [{ kind: 'cash', amount: -1200 }, { kind: 'gamble', chance: 0.85, win: [], lose: [{ kind: 'cash', amount: '-damage' }] }] },
      { id: 'risk', label: 'Take the risk', detail: 'Half the time: about €{damage} of damage and bad press.', effects: [{ kind: 'gamble', chance: 0.5, win: [], lose: [{ kind: 'cash', amount: '-damage' }, { kind: 'rep', amount: -1 }] }] },
    ],
  },
  {
    id: 'evsubsidy', title: 'EV charger subsidy', icon: '🔌', weight: 0.5, minDay: 30, minLevel: 1,
    text: 'The council will co-fund public chargers at businesses that sell electric cars.', fallback: 1,
    options: [
      { id: 'join', label: 'Join the scheme (€4,000)', detail: 'EV buyers +30% for two months, reputation +1.', effects: [{ kind: 'cash', amount: -4000 }, { kind: 'boost', what: 'ev', mult: 1.3, days: 60 }, { kind: 'rep', amount: 1 }] },
      { id: 'no', label: 'Not now', detail: 'Nothing happens.', effects: [] },
    ],
  },
  {
    id: 'clearance', title: 'Rival clearance sale', icon: '🏷️', weight: 0.8, minDay: 25, minLevel: 1, needs: 'rival',
    text: '{rival} announces a huge clearance sale this fortnight.', fallback: 2,
    options: [
      { id: 'match', label: 'Match their prices (−4% on every listed car)', detail: 'Keeps traffic: +10% leads for 10 days.', effects: [{ kind: 'repriceListed', pct: -0.04 }, { kind: 'boost', what: 'leads', mult: 1.1, days: 10 }] },
      { id: 'quality', label: 'Promote quality and service (€2,000)', detail: 'Reputation +1 and buyers pay a little more.', effects: [{ kind: 'cash', amount: -2000 }, { kind: 'rep', amount: 1 }, { kind: 'boost', what: 'wtp', mult: 1.02, days: 14 }] },
      { id: 'ignore', label: 'Ignore them', detail: '−15% leads for 10 days.', effects: [{ kind: 'boost', what: 'leads', mult: 0.85, days: 10 }] },
    ],
  },
  {
    id: 'recallwork', title: 'Recall work available', icon: '🧰', weight: 0.6, minDay: 25, minLevel: 1, needs: 'workshop',
    text: 'A manufacturer needs independent workshops to help with a recall. They pay per car.', fallback: 1,
    options: [
      { id: 'take', label: 'Take the work', detail: '{count} paid service jobs arrive over the next days.', effects: [{ kind: 'serviceJobs', count: 0 }] },
      { id: 'decline', label: 'Too busy', detail: 'Nothing happens.', effects: [] },
    ],
  },
  {
    id: 'staffparty', title: 'Team summer party?', icon: '🎉', weight: 0.6, minDay: 30, minLevel: 1, needs: 'employee',
    text: 'The team has been working hard and asks about a summer party.', fallback: 2,
    options: [
      { id: 'party', label: 'Throw a party (€{cost})', detail: 'Morale +12, stress −15.', effects: [{ kind: 'cash', amount: '-cost' }, { kind: 'morale', amount: 12, stress: -15 }] },
      { id: 'bonus', label: 'Small bonus instead (€{cost2})', detail: 'Morale +8.', effects: [{ kind: 'cash', amount: '-cost2' }, { kind: 'morale', amount: 8, stress: -5 }] },
      { id: 'no', label: 'Not this year', detail: 'Morale −6.', effects: [{ kind: 'morale', amount: -6 }] },
    ],
  },
  {
    id: 'landoffer', title: 'Neighbouring plot for sale', icon: '🗺️', weight: 0.4, minDay: 40, minLevel: 2, needs: 'nextLand',
    text: 'The owner of the land behind your lot wants a quick sale and offers it 20% below value.', fallback: 1,
    options: [
      { id: 'buy', label: 'Buy it now (20% off)', detail: 'Your lot grows; rent rises with it.', effects: [{ kind: 'land', discount: 0.2 }] },
      { id: 'no', label: 'Not now', detail: 'Nothing happens.', effects: [] },
    ],
  },
  {
    id: 'tvtest', title: 'Consumer TV mystery shop', icon: '📺', weight: 0.4, minDay: 45, minLevel: 2,
    text: 'A consumer programme wants to test dealers\' honesty with hidden cameras — and asks if you want to take part.', fallback: 1,
    options: [
      { id: 'yes', label: 'Welcome them', detail: 'If your cars are honest: big boost. If not: ouch.', effects: [{ kind: 'gamble', chance: 0, win: [{ kind: 'rep', amount: 5 }, { kind: 'boost', what: 'leads', mult: 1.2, days: 14 }], lose: [{ kind: 'rep', amount: -5 }] }] },
      { id: 'no', label: 'Decline', detail: 'Reputation −1 — "they had something to hide".', effects: [{ kind: 'rep', amount: -1 }] },
    ],
  },
];
export const DECISION_BY_ID = Object.fromEntries(DECISIONS.map((d) => [d.id, d])) as Record<string, DecisionDef>;
