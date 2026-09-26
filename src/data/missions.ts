/**
 * Missions: goals that guide a new player and keep a big company busy.
 * Three are active at a time, in this order. The metric is measured by
 * sim/missions.ts; the reward is paid when it is reached.
 */
export type MissionMetric =
  | 'sold' | 'lifetimeProfit' | 'monthProfit' | 'repStars' | 'serviceJobs' | 'evSold' | 'customers' | 'locations'
  | 'contracts' | 'companyValue' | 'employees' | 'research' | 'financeDeals' | 'repeatSales' | 'certifiedSold'
  | 'fleetDelivered' | 'luxurySold' | 'newSold' | 'objects' | 'listed' | 'testDrives' | 'decisions' | 'onlineSales'
  | 'hq' | 'acquisitions' | 'goldContract' | 'roles' | 'productsSold' | 'campaigns' | 'companyLevel' | 'cash'
  | 'landTier' | 'lifts' | 'evCharging' | 'capacity' | 'premiumShowroom' | 'playerDrives' | 'testDriveCentre' | 'rooms';

export interface MissionDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  metric: MissionMetric;
  target: number;
  minLevel: number;
  reward: { cash?: number; rep?: number; research?: number; relation?: number; note?: string };
}

export const MISSIONS: MissionDef[] = [
  { id: 'm-first', name: 'Open for business', icon: '🔑', description: 'Sell your first car.', metric: 'sold', target: 1, minLevel: 1, reward: { cash: 1500 } },
  { id: 'm-list5', name: 'Stock the lot', icon: '🅿️', description: 'Have 5 cars for sale at once.', metric: 'listed', target: 5, minLevel: 1, reward: { cash: 2000 } },
  { id: 'm-testdrive', name: 'Keys please', icon: '🗝️', description: 'Take 5 customers on a test drive.', metric: 'testDrives', target: 5, minLevel: 1, reward: { cash: 1500, rep: 1 } },
  { id: 'm-sell10', name: 'Sell 10 cars', icon: '🚗', description: 'Sell 10 cars in total.', metric: 'sold', target: 10, minLevel: 1, reward: { cash: 4000 } },
  { id: 'm-drive', name: 'Behind the wheel', icon: '🎮', description: 'Drive 3 test drives yourself (tap a car → Test drive).', metric: 'playerDrives', target: 3, minLevel: 1, reward: { cash: 1500 } },
  { id: 'm-workshop', name: 'Build a workshop', icon: '🔧', description: 'Have a workshop lift at one of your dealerships.', metric: 'lifts', target: 1, minLevel: 1, reward: { cash: 2500 } },
  { id: 'm-expand', name: 'Expand your dealership', icon: '🗺️', description: 'Buy a bigger plot (tap the locked land on the map).', metric: 'landTier', target: 1, minLevel: 1, reward: { cash: 5000, rep: 1 } },
  { id: 'm-rooms', name: 'Rooms that work', icon: '🏗️', description: 'Have 4 complete rooms (the right furniture and a door).', metric: 'rooms', target: 4, minLevel: 1, reward: { cash: 3000 } },
  { id: 'm-build', name: 'Make it yours', icon: '🔨', description: 'Have 30 objects built at your dealership.', metric: 'objects', target: 30, minLevel: 1, reward: { cash: 3000 } },
  { id: 'm-team', name: 'Build a team', icon: '👥', description: 'Employ 4 people.', metric: 'employees', target: 4, minLevel: 1, reward: { cash: 3000 } },
  { id: 'm-products', name: 'Protect the deal', icon: '🛡️', description: 'Sell 10 warranties, service plans or other products.', metric: 'productsSold', target: 10, minLevel: 1, reward: { cash: 2500 } },
  { id: 'm-research', name: 'Invest in the future', icon: '🧪', description: 'Finish your first research project.', metric: 'research', target: 1, minLevel: 1, reward: { cash: 3000 } },
  { id: 'm-profit25', name: '€25k profit', icon: '💶', description: 'Earn €25,000 gross profit in total.', metric: 'lifetimeProfit', target: 25000, minLevel: 1, reward: { cash: 5000 } },
  { id: 'm-service', name: 'Open the workshop', icon: '🛠️', description: 'Complete 10 service jobs for customers.', metric: 'serviceJobs', target: 10, minLevel: 1, reward: { cash: 4000, rep: 1 } },
  { id: 'm-campaigns', name: 'Get the word out', icon: '📣', description: 'Run 3 marketing campaigns.', metric: 'campaigns', target: 3, minLevel: 1, reward: { cash: 2500 } },
  { id: 'm-rep4', name: 'Four stars', icon: '⭐', description: 'Reach a 4.0-star reputation.', metric: 'repStars', target: 4, minLevel: 1, reward: { cash: 8000, note: 'Better candidates apply' } },
  { id: 'm-capacity', name: 'Room for 20', icon: '🅿️', description: 'Reach 20 vehicle spaces at one dealership.', metric: 'capacity', target: 20, minLevel: 1, reward: { cash: 6000 } },
  { id: 'm-evcharge', name: 'Build an EV charging area', icon: '🔌', description: 'Have 3 charging points or EV spaces.', metric: 'evCharging', target: 3, minLevel: 1, reward: { cash: 4000 } },
  { id: 'm-premium', name: 'Open a premium showroom', icon: '💎', description: 'Two premium or luxury displays in a showroom of level 3 or more.', metric: 'premiumShowroom', target: 1, minLevel: 2, reward: { cash: 10000, rep: 2 } },
  { id: 'm-tdcentre', name: 'Test-drive centre', icon: '🗝️', description: 'Open a complete test-drive centre (check-in desk, keys and a door).', metric: 'testDriveCentre', target: 1, minLevel: 2, reward: { cash: 8000, rep: 1 } },
  { id: 'm-ev5', name: 'Go electric', icon: '🔋', description: 'Sell 5 electric cars.', metric: 'evSold', target: 5, minLevel: 1, reward: { cash: 5000 } },
  { id: 'm-finance', name: 'Monthly payments', icon: '🏦', description: 'Close 10 finance deals.', metric: 'financeDeals', target: 10, minLevel: 2, reward: { cash: 6000 } },
  { id: 'm-customers', name: '100 customers', icon: '👋', description: 'Welcome 100 customers.', metric: 'customers', target: 100, minLevel: 1, reward: { cash: 4000 } },
  { id: 'm-level2', name: 'Established', icon: '🏆', description: 'Reach company level 2.', metric: 'companyLevel', target: 2, minLevel: 1, reward: { cash: 6000, research: 1 } },
  { id: 'm-official', name: 'Become an official dealer', icon: '🏢', description: 'Sign a dealer contract with a brand.', metric: 'contracts', target: 1, minLevel: 2, reward: { cash: 10000, relation: 10 } },
  { id: 'm-new', name: 'Fresh from the factory', icon: '🆕', description: 'Sell 5 brand-new cars.', metric: 'newSold', target: 5, minLevel: 2, reward: { cash: 8000, relation: 5 } },
  { id: 'm-repeat', name: 'They came back', icon: '🔁', description: 'Sell to 5 returning customers.', metric: 'repeatSales', target: 5, minLevel: 2, reward: { cash: 6000, rep: 2 } },
  { id: 'm-certified', name: 'Certified quality', icon: '✅', description: 'Sell 5 certified pre-owned cars.', metric: 'certifiedSold', target: 5, minLevel: 2, reward: { cash: 6000, rep: 1 } },
  { id: 'm-sell100', name: 'Century', icon: '💯', description: 'Sell 100 cars in total.', metric: 'sold', target: 100, minLevel: 2, reward: { cash: 15000 } },
  { id: 'm-month50', name: 'A great month', icon: '📈', description: 'Make €50,000 net profit in one month.', metric: 'monthProfit', target: 50000, minLevel: 2, reward: { cash: 12000 } },
  { id: 'm-second', name: 'Open a second location', icon: '🏬', description: 'Run two dealerships.', metric: 'locations', target: 2, minLevel: 3, reward: { cash: 25000 } },
  { id: 'm-fleet', name: 'Fleet partner', icon: '🚐', description: 'Deliver 10 fleet cars.', metric: 'fleetDelivered', target: 10, minLevel: 3, reward: { cash: 15000 } },
  { id: 'm-roles', name: 'Every department', icon: '🧩', description: 'Employ 8 different kinds of role.', metric: 'roles', target: 8, minLevel: 3, reward: { cash: 12000 } },
  { id: 'm-luxury', name: 'Premium status', icon: '💎', description: 'Sell 15 luxury or performance cars.', metric: 'luxurySold', target: 15, minLevel: 3, reward: { cash: 20000, rep: 2 } },
  { id: 'm-value1m', name: 'Millionaire', icon: '💰', description: 'Reach a company value of €1,000,000.', metric: 'companyValue', target: 1000000, minLevel: 3, reward: { cash: 25000 } },
  { id: 'm-service250', name: 'Service powerhouse', icon: '⚙️', description: 'Complete 250 service jobs.', metric: 'serviceJobs', target: 250, minLevel: 3, reward: { cash: 20000 } },
  { id: 'm-research10', name: 'Innovation leader', icon: '🚀', description: 'Finish 10 research projects.', metric: 'research', target: 10, minLevel: 3, reward: { cash: 20000 } },
  { id: 'm-gold', name: 'Gold partner', icon: '🥇', description: 'Reach Gold tier with a brand.', metric: 'goldContract', target: 1, minLevel: 4, reward: { cash: 40000, rep: 2 } },
  { id: 'm-two-brands', name: 'Multi-brand dealer', icon: '🏷️', description: 'Hold 2 brand contracts.', metric: 'contracts', target: 2, minLevel: 4, reward: { cash: 30000 } },
  { id: 'm-rep45', name: 'Best in the region', icon: '🌟', description: 'Reach a 4.5-star reputation.', metric: 'repStars', target: 4.5, minLevel: 4, reward: { cash: 40000 } },
  { id: 'm-four', name: 'Regional player', icon: '🗺️', description: 'Run four dealerships.', metric: 'locations', target: 4, minLevel: 5, reward: { cash: 80000 } },
  { id: 'm-hq', name: 'Headquarters', icon: '🏛️', description: 'Open a group headquarters.', metric: 'hq', target: 1, minLevel: 5, reward: { cash: 50000 } },
  { id: 'm-acquire', name: 'The takeover', icon: '🤝', description: 'Acquire a competing dealer.', metric: 'acquisitions', target: 1, minLevel: 5, reward: { cash: 100000, rep: 3 } },
  { id: 'm-sell1000', name: '1,000 cars', icon: '🏁', description: 'Sell 1,000 cars.', metric: 'sold', target: 1000, minLevel: 5, reward: { cash: 150000 } },
  { id: 'm-value10m', name: 'Automotive group', icon: '👑', description: 'Reach a company value of €10,000,000.', metric: 'companyValue', target: 10000000, minLevel: 6, reward: { cash: 250000 } },
  { id: 'm-level7', name: 'National champion', icon: '🏆', description: 'Reach company level 7.', metric: 'companyLevel', target: 7, minLevel: 6, reward: { cash: 500000 } },
];
export const MISSION_BY_ID = Object.fromEntries(MISSIONS.map((m) => [m.id, m])) as Record<string, MissionDef>;
