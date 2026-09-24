// Core domain model for Car Dealership Manager Tycoon.
// Pure data types only — no DOM, no platform code. Shared by web and Android.

export type BodyType = 'Hatchback' | 'Sedan' | 'Wagon' | 'SUV' | 'Crossover' | 'Coupe' | 'Convertible' | 'Van' | 'Pickup' | 'Roadster';
export type FuelType = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric';
export type Transmission = 'Manual' | 'Automatic';
export type Category =
  | 'Economy' | 'Compact' | 'Family' | 'SUV' | 'Luxury' | 'Premium'
  | 'Sport' | 'Performance' | 'Electric' | 'Van' | 'Classic' | 'Rare';

export type VehicleStatus = 'offer' | 'transit' | 'yard' | 'prep' | 'listed' | 'transfer' | 'sold';
export type SourceId = 'wholesale' | 'private' | 'auction' | 'tradein' | 'network' | 'special';
export type IssueSystem = 'Engine' | 'Transmission' | 'Electronics' | 'Suspension' | 'Body' | 'Interior' | 'Brakes' | 'Tyres' | 'History';

export interface Manufacturer {
  id: string;
  name: string;
  country: string;
  prestige: number;      // 0..1 brand image
  reliability: number;   // 0..1
  popularity: number;    // 0..1 baseline demand
  tagline: string;
  color: string;         // UI accent for badges
}

export interface ModelSpec {
  id: string;
  brandId: string;
  name: string;
  body: BodyType;
  category: Category;
  basePrice: number;            // price when new (EUR)
  fuels: FuelType[];
  yearFrom: number;
  yearTo: number;
  engines: { label: string; hp: number; fuel: FuelType }[];
  trims: string[];
  generations: { code: string; from: number; to: number }[];
  rarity: number;               // 0 common .. 1 very rare
  depreciation: number;         // yearly depreciation factor (0.08..0.2), classics negative after age
  popularity: number;           // 0..1 how many people want one (drives demand and how often it turns up)
}

export interface Issue {
  id: string;
  system: IssueSystem;
  name: string;
  severity: 1 | 2 | 3;          // minor, moderate, major
  repairCost: number;
  valueImpact: number;          // EUR taken off market value while unrepaired
  discovered: boolean;
  fixed: boolean;
  visible: boolean;             // visible with a basic look (no inspection)
}

export interface PrepTask {
  actionId: string;
  daysLeft: number;
  totalDays: number;
  cost: number;
  issueId?: string;
}

export interface Vehicle {
  id: string;
  modelId: string;
  brand: string;
  brandId: string;
  model: string;
  generation: string;
  year: number;
  trim: string;
  body: BodyType;
  category: Category;
  fuel: FuelType;
  transmission: Transmission;
  engine: string;
  hp: number;
  mileage: number;
  color: string;
  colorHex: string;
  options: string[];
  condition: number;            // true condition 0..100
  apparentCondition: number;    // what seller/listing claims
  presentation: number;         // cleanliness & detailing 0..100
  issues: Issue[];
  inspectionLevel: 0 | 1 | 2;   // 0 none, 1 basic, 2 advanced
  photosPro: boolean;
  reliability: number;          // 0..1
  popularity: number;           // 0..1
  rarity: number;               // 0..1
  source: SourceId;
  seller: string;
  history: string[];
  warranty?: boolean;
  soldTo?: string;
  complaintDay?: number;
  // economics
  purchasePrice: number;
  offerPrice: number;           // seller asking (offer stage)
  costs: { transport: number; inspection: number; repairs: number; detailing: number; other: number };
  askingPrice: number;
  floorPrice: number;           // minimum acceptable price for staff deals
  status: VehicleStatus;
  locationId: string;
  daysInStock: number;
  boughtDay: number;
  arrivalDay: number;
  prep: PrepTask[];
  sourced?: boolean;             // tracked down on request (model browser)
  listedOnline: boolean;
  soldPrice?: number;
  soldDay?: number;
  // offer-only
  expiresDay?: number;
  auction?: { currentBid: number; bids: number; myBid: number; reserve: number };
  preInspected?: boolean;
  slotId?: string;              // physical parking/display/storage/lift/bay object
  testDriven?: boolean;
  haggled?: number;
  transferTo?: string;
}

export type ArchetypeId =
  | 'budget' | 'family' | 'young' | 'enthusiast' | 'luxury' | 'firsttime'
  | 'business' | 'suv' | 'ev' | 'commuter';

export interface Archetype {
  id: ArchetypeId;
  name: string;
  icon: string;
  budget: [number, number];
  bodies: BodyType[];
  categories: Category[];
  fuels: FuelType[];
  maxMileage: number;
  minYearAge: number;           // max age in years they accept
  priceSensitivity: number;     // 0..1
  patience: [number, number];
  negotiation: [number, number];
  tradeInChance: number;
  extrasAffinity: number;       // likelihood to value warranty/service
  weight: number;               // base spawn weight
}

export interface Customer {
  id: string;
  name: string;
  archetype: ArchetypeId;
  budget: number;
  bodies: BodyType[];
  categories: Category[];
  fuels: FuelType[];
  brandPref?: string;
  maxMileage: number;
  maxAge: number;
  priceSensitivity: number;
  patience: number;             // negotiation rounds tolerance (1..6)
  negotiation: number;          // 0..1 skill
  urgency: number;              // 0..1
  vehicleId?: string;           // vehicle they're interested in
  interest: number;             // 0..1 in that vehicle
  wtp: number;                  // hidden willingness to pay
  tradeIn?: Vehicle;
  locationId: string;
  arrivedDay: number;
  expiresDay: number;
  channel: string;              // walk-in / online / campaign id
  campaignId?: string;
  arrivalHour: number;          // absolute hour index when they walk in
  leaveHour: number;            // absolute hour index when they stop waiting
  tradeInExpectation?: number;  // what they think their trade-in is worth
  satisfactionBonus: number;
  testDrive?: boolean;
  talked?: boolean;
  recommended?: number;
  status: 'scheduled' | 'waiting' | 'negotiating' | 'bought' | 'left';
}

export interface LostLead {
  day: number;
  archetype: ArchetypeId;
  reason: string;
  wanted: string;
  locationId: string;
}

export type Role = 'sales' | 'mechanic' | 'detailer' | 'buyer' | 'manager' | 'accountant' | 'marketing';

export interface Employee {
  id: string;
  name: string;
  role: Role;
  skill: number;                // 1..100
  xp: number;
  level: number;                // 1..5
  salary: number;               // monthly
  morale: number;               // 0..100
  specialization: string;
  locationId: string;
  hiredDay: number;
  trainingDaysLeft: number;
  dealsClosed: number;
  stationId?: string;           // the desk, lift or bay they work at
}

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  effect: string[];            // per-level effect text
  costs: number[];             // cost for level 1..N
  minCompanyLevel: number[];   // required company level per upgrade level
}

export type Strategy = 'balanced' | 'budget' | 'volume' | 'luxury' | 'suv' | 'ev' | 'sports' | 'margin';

export interface Location {
  id: string;
  strategy?: Strategy;
  cityId: string;
  name: string;
  openedDay: number;
  upgrades: Record<string, number>;
  rentFactor?: number;             // lease discount (challenge starts)
  reputation: number;          // local reputation 0..100
  stats: { revenue: number; profit: number; sold: number; leads: number };
  month: { revenue: number; profit: number; sold: number; leads: number };
  rentMonthly: number;
  lot: Lot;
}

/** Tile zone codes, one character per tile in Lot.zones. */
export type ZoneCode = '.' | 'a' | 's' | 'w' | 'd' | 'o' | 'l' | 'r' | 't' | 'g' | 'x' | 'b' | 'v' | 'm' | 'k' | 'p';

export interface LotObject {
  id: string;
  defId: string;
  x: number;                    // top-left tile
  y: number;
  rot: 0 | 1;                   // 1 = rotated 90° (w/h swapped)
}

export interface LotStyle { floor: string; walls: string; lighting: string }

/** The physical dealership: land, painted zones and placed objects. */
export interface Lot {
  w: number;
  h: number;
  landTier: number;
  zones: string;                // w*h chars, row-major
  objects: LotObject[];
  style: LotStyle;
  /** Per-room finishes that override the building style (floor, walls, ceiling lighting). */
  roomStyles?: Partial<Record<ZoneCode, Partial<LotStyle>>>;
  open: boolean;                // player can close the doors during the day
  version: number;              // bumped on every layout change (cache key)
}

export interface City {
  id: string;
  name: string;
  region: string;
  demand: number;              // multiplier
  competition: number;         // 0..1
  rent: number;                // monthly base rent
  openCost: number;
  wealth: number;              // shifts budgets
  mix: Partial<Record<ArchetypeId, number>>;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  blurb: string;
}

export type TxCategory =
  | 'Vehicle sale' | 'Vehicle purchase' | 'Transport' | 'Inspection' | 'Repairs' | 'Detailing'
  | 'Salaries' | 'Rent' | 'Utilities' | 'Marketing' | 'Insurance' | 'Taxes' | 'Loan' | 'Loan interest'
  | 'Upgrades' | 'Expansion' | 'Training' | 'Extras' | 'Warranty claim' | 'Listing fees' | 'Construction' | 'Maintenance' | 'Other';

export interface Transaction {
  id: number;
  day: number;
  category: TxCategory;
  amount: number;              // + income, - expense
  description: string;
  locationId?: string;
}

export interface Loan {
  id: string;
  name: string;
  principal: number;
  balance: number;
  rate: number;                // annual rate
  termMonths: number;
  monthsLeft: number;
  payment: number;             // monthly payment
  takenDay: number;
}

export interface GameEventDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  duration: [number, number];
  weight: number;
  minDay: number;
  category?: Partial<Record<Category, number>>;
  fuel?: Partial<Record<FuelType, number>>;
  body?: Partial<Record<BodyType, number>>;
  demand?: number;             // overall lead multiplier
  supply?: number;             // offers count multiplier
  purchasePrice?: number;      // purchase price multiplier
  special?: 'auction' | 'recall' | 'competitor' | 'promotion';
}

export interface ActiveEvent {
  id: string;
  defId: string;
  startDay: number;
  endDay: number;
  targetBrand?: string;
  note?: string;
}

export interface Competitor {
  id: string;
  name: string;
  cityId: string;
  reputation: number;
  size: number;                // inventory size
  pricing: 'Discount' | 'Market' | 'Premium';
  specialization: Category | 'Mixed';
  promoDaysLeft: number;
  trend: number;               // -1..1 momentum
  sold: number;
}

export interface Campaign {
  id: string;
  channelId: string;
  locationId: string;
  startDay: number;
  endDay: number;
  cost: number;
  leads: number;
  revenue: number;
}

export interface Review {
  id: string;
  day: number;
  stars: number;
  customer: string;
  text: string;
  locationId: string;
  vehicle: string;
}

export interface DayRecord {
  day: number;
  revenue: number;
  expenses: number;
  profit: number;
  cash: number;
  inventoryValue: number;
  sold: number;
  leads: number;
  companyValue: number;
}

export interface Notice {
  id: number;
  day: number;
  kind: 'info' | 'good' | 'bad' | 'event' | 'sale';
  text: string;
  read: boolean;
}

export interface Negotiation {
  customerId: string;
  vehicleId: string;
  round: number;
  patienceLeft: number;
  lastCustomerOffer: number;
  lastPlayerPrice: number;
  extras: { warranty: boolean; service: boolean; accessory: boolean; finance: boolean };
  tradeInOffer?: number;
  tradeInIncluded: boolean;
  request?: { extra: 'service' | 'accessory' | 'warranty'; price: number };
  freeExtra?: 'service' | 'accessory' | 'warranty';
  log: { who: 'you' | 'them' | 'system'; text: string }[];
  mood: number;               // -1..1
  done: boolean;
  outcome?: 'sold' | 'walked' | 'rejected';
}

export interface Settings {
  sound: boolean;
  music: boolean;
  haptics: boolean;
  autosave: boolean;
  confirmBigSpend: number;     // threshold for purchase confirmations
  reducedMotion: boolean;
  tutorial: boolean;
  pauseOnCustomer: boolean;
  dailyReport: boolean;
  autoStaffDeals: boolean;
}

export interface Legacy {
  points: number;
  totalPrestiges: number;
  perks: Record<string, number>;
  bestCompanyValue: number;
}

export interface TutorialState {
  done: Record<string, boolean>;
  dismissed: boolean;
}

export interface CompanyStats {
  sold: number;
  customersServed: number;
  customersTotal: number;
  lifetimeRevenue: number;
  lifetimeProfit: number;
  biggestDeal: number;
  bestMonthProfit: number;
  perfectReviews: number;
  vehiclesBought: number;
  peakCompanyValue: number;
  evSold: number;
  lostLeads: number;
  loansRepaid: number;
  rareBought: number;
}

export interface GameState {
  version: number;
  id: string;
  companyName: string;
  ownerName: string;
  challenge: string;
  seed: number;
  day: number;
  hour: number;                 // 8..20 opening hours
  speed: number;                // index into SPEEDS
  cash: number;
  reputation: number;
  companyLevel: number;
  vehicles: Vehicle[];          // owned (not offers)
  soldArchive: Vehicle[];       // last N sold vehicles
  offers: Vehicle[];            // market offers
  customers: Customer[];
  employees: Employee[];
  candidates: Employee[];
  locations: Location[];
  activeLocationId: string;
  transactions: Transaction[];
  txCounter: number;
  loans: Loan[];
  events: ActiveEvent[];
  eventLog: { day: number; text: string }[];
  trends: Record<string, number>;  // market trend multipliers by category / fuel key
  trendHistory: { day: number; values: Record<string, number> }[];
  competitors: Competitor[];
  campaigns: Campaign[];
  reviews: Review[];
  history: DayRecord[];
  notices: Notice[];
  noticeCounter: number;
  achievements: Record<string, number>; // id -> day unlocked
  stats: CompanyStats;
  month: { revenue: number; expenses: number; profit: number; sold: number };
  today: { revenue: number; expenses: number; profit: number; sold: number; leads: number };
  negotiation?: Negotiation;
  lostLeads: LostLead[];
  settings: Settings;
  autoList: Record<string, boolean>;   // per location: staff lists vehicles after prep
  overdraftDays: number;
  bankrupt: boolean;
  tutorial: TutorialState;
  legacy: Legacy;
  idCounter: number;
  lastSavedAt: number;
  sourcing?: { day: number; count: number };
}

export interface SaveSlotMeta {
  slot: string;
  companyName: string;
  day: number;
  cash: number;
  companyValue: number;
  savedAt: number;
  level: number;
}
