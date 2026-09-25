// Core domain model for Car Dealership Manager Tycoon.
// Pure data types only — no DOM, no platform code. Shared by web and Android.

export type BodyType = 'Hatchback' | 'Sedan' | 'Wagon' | 'SUV' | 'Crossover' | 'Coupe' | 'Convertible' | 'Van' | 'Pickup' | 'Roadster' | 'Offroader';
export type Drivetrain = 'FWD' | 'RWD' | 'AWD' | '4x4';
export type ServiceHistory = 'Full' | 'Partial' | 'None';
export type ConditionGrade = 'New' | 'Like New' | 'Good' | 'Used' | 'Poor' | 'Project' | 'Damaged';
export type FuelType = 'Petrol' | 'Diesel' | 'Hybrid' | 'Electric';
export type Transmission = 'Manual' | 'Automatic';
export type Category =
  | 'Economy' | 'Compact' | 'Family' | 'SUV' | 'Luxury' | 'Premium'
  | 'Sport' | 'Performance' | 'Electric' | 'Van' | 'Classic' | 'Rare' | 'Commercial' | 'Offroad';

export type VehicleStatus = 'offer' | 'transit' | 'yard' | 'prep' | 'listed' | 'transfer' | 'sold';
export type SourceId = 'wholesale' | 'private' | 'auction' | 'tradein' | 'network' | 'special' | 'manufacturer' | 'fleet' | 'lease' | 'importer' | 'liquidation';
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
  /** Dealer-franchise terms when you become an official dealer of this brand. */
  dealer?: { margin: number; bonus: number; support: number; minShowroom: number; minSales: number; minLifts: number; fee: number; minRep: number; minLevel: number; training?: string };
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
  // depth (v4) — optional so older saves load; filled in by migrate()
  drivetrain?: Drivetrain;
  interior?: string;            // e.g. "Black leather"
  serviceHistory?: ServiceHistory;
  certified?: boolean;          // certified pre-owned: inspected, serviced, detailed, warranted
  isNew?: boolean;              // new car from a manufacturer contract (0 km)
  demo?: boolean;               // kept as the test-drive demo car
  reservedBy?: string;          // online reservation (customer id)
  reservedUntil?: number;       // day the reservation lapses
  fleetFor?: string;            // earmarked for a fleet order
  priceCuts?: number;           // automatic price reductions so far
  boughtBy?: string;            // employee id of the buyer who found it
  buyerEstimate?: number;       // the buyer's margin estimate when it was bought
  warrantyUntil?: number;       // day the sold car's warranty ends
}

export type ArchetypeId =
  | 'budget' | 'family' | 'young' | 'enthusiast' | 'luxury' | 'firsttime'
  | 'business' | 'suv' | 'ev' | 'commuter' | 'bargain' | 'prestige' | 'senior' | 'fleet';

export type NegotiationStyle = 'haggler' | 'fair' | 'decisive' | 'analytical';
export type Household = 'single' | 'couple' | 'family' | 'retired' | 'business';
export type FunnelStage = 'ad' | 'visit' | 'browse' | 'interest' | 'testdrive' | 'negotiation' | 'finance' | 'tradein' | 'sale' | 'delivery' | 'review' | 'repeat';

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
  age: [number, number];
  households: Household[];
  credit: [number, number];     // credit score range (300..850)
  financeShare: number;         // share who want to pay monthly
  styles: NegotiationStyle[];
  luxury: number;               // 0..1 preference for premium brands and options
  eco: number;                  // 0..1 preference for electrified cars
  loyalty: number;              // 0..1 tendency to come back
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
  appointment?: string;         // their visit in the planning
  leaveHour: number;            // absolute hour index when they stop waiting
  tradeInExpectation?: number;  // what they think their trade-in is worth
  satisfactionBonus: number;
  testDrive?: boolean;
  talked?: boolean;
  recommended?: number;
  status: 'scheduled' | 'waiting' | 'negotiating' | 'bought' | 'left';
  // depth (v4)
  age?: number;
  household?: Household;
  favBrands?: string[];
  monthlyLimit?: number;        // most they will pay per month on finance
  credit?: number;              // credit score 300..850
  wantsFinance?: boolean;       // prefers paying monthly
  style?: NegotiationStyle;
  loyalty?: number;             // 0..1
  luxuryPref?: number;          // 0..1
  ecoPref?: number;             // 0..1
  clientId?: string;            // returning customer (CRM profile)
  stage?: FunnelStage;          // how far they got
  waited?: number;              // hours waited without being served
  reservation?: boolean;        // reserved the car online before coming in
}

export interface LostLead {
  day: number;
  archetype: ArchetypeId;
  reason: string;
  wanted: string;
  locationId: string;
}

export type Role = 'sales' | 'mechanic' | 'detailer' | 'buyer' | 'manager' | 'accountant' | 'marketing'
  | 'finance' | 'reception' | 'advisor' | 'technician' | 'inventory' | 'delivery' | 'security' | 'cleaner'
  | 'photographer' | 'prep' | 'procurement' | 'admin';

export type SkillId = 'sales' | 'negotiation' | 'finance' | 'service' | 'technical' | 'ev' | 'luxury' | 'management' | 'speed'
  | 'reliability' | 'composure' | 'detail' | 'buying' | 'appraisal';

export type ContractKind = 'permanent' | 'temporary' | 'parttime';
export type ManagerFocus = 'general' | 'sales' | 'service';

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
  // depth (v4)
  skills?: Partial<Record<SkillId, number>>;
  stress?: number;              // 0..100
  training?: string;            // course in progress (track id)
  tracks?: Record<string, number>;  // completed courses per track
  commission?: number;          // commission earned this month
  bonusDay?: number;            // last bonus
  loyaltyDays?: number;         // days with this company (for long-service effects)
  // people (v5)
  age?: number;
  contract?: ContractKind;
  hours?: number;               // contracted hours per week (40 full time, 24 part time)
  contractEnd?: number;         // temporary contracts end on this day
  focus?: ManagerFocus;         // managers: general, sales or service manager
  performance?: number;         // 0..100, rolling measure of output
  absentDay?: number;           // off sick / absent on this day
  task?: string;                // what they are doing right now (for the dealership view)
  bought?: { count: number; spent: number; margin: number; realised: number; month: number };
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

export type Strategy = 'balanced' | 'budget' | 'volume' | 'luxury' | 'suv' | 'ev' | 'sports' | 'margin' | 'family' | 'premium' | 'performance' | 'used';
export type PricingPolicy = 'aggressive' | 'market' | 'premium';
export type PartId = 'oil' | 'filters' | 'tyres' | 'brakes' | 'batteries' | 'ev' | 'body' | 'other';

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
  // depth (v4)
  pricing?: PricingPolicy;
  parts?: Partial<Record<PartId, number>>;
  partsOrders?: { part: PartId; qty: number; day: number; cost: number }[];
  delivery?: { flowers: boolean; photos: boolean; welcome: boolean; premium: boolean };
  certified?: boolean;          // runs a certified pre-owned programme
  acquired?: string;            // name of the dealer this branch was bought from
}

/** Tile zone codes, one character per tile in Lot.zones. */
export type ZoneCode = '.' | 'a' | 's' | 'w' | 'd' | 'o' | 'l' | 'r' | 't' | 'g' | 'x' | 'b' | 'v' | 'm' | 'k' | 'p' | 'e' | 'f' | 'j' | 'n' | 'u' | 'q';

export interface LotObject {
  id: string;
  defId: string;
  x: number;                    // top-left tile
  y: number;
  rot: 0 | 1;                   // 1 = rotated 90° (w/h swapped)
  /** Upgrade level (1 = as built). Optional so older saves load. */
  level?: number;
  /** Day it was built (older fixtures refund less when bulldozed). */
  built?: number;
  /** Money spent on its upgrades (part of it comes back when bulldozed). */
  upgradeSpent?: number;
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
  /** Dealership style (v6): a look that also shapes who visits. */
  theme?: string;
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
  type?: 'town' | 'suburb' | 'city' | 'industrial' | 'luxury' | 'airport' | 'highway';
  traffic?: number;            // passing traffic (walk-ins)
  space?: number;              // largest plot tier available
  mix: Partial<Record<ArchetypeId, number>>;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Expert';
  blurb: string;
}

export type TxCategory =
  | 'Vehicle sale' | 'Vehicle purchase' | 'Transport' | 'Inspection' | 'Repairs' | 'Detailing'
  | 'Salaries' | 'Rent' | 'Utilities' | 'Marketing' | 'Insurance' | 'Taxes' | 'Loan' | 'Loan interest'
  | 'Upgrades' | 'Expansion' | 'Training' | 'Extras' | 'Warranty claim' | 'Listing fees' | 'Construction' | 'Maintenance' | 'Other'
  | 'Finance income' | 'Service' | 'Parts' | 'Parts purchase' | 'Commission' | 'Bonus' | 'Research' | 'Dealer bonus' | 'Acquisition' | 'Delivery';

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
  economy?: Partial<Record<'fuel' | 'rate' | 'growth' | 'confidence' | 'evIncentive' | 'importCost', number>>;  // pushes on the economy when it starts
  parts?: number;              // parts price multiplier
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
  // depth (v4)
  staff?: number;
  marketing?: number;          // 0..1 how hard they advertise
  strategy?: 'undercut' | 'premium' | 'volume' | 'specialist';
  debt?: number;
  priceIndex?: number;         // their prices vs market (0.9..1.1)
  lastMove?: string;           // what they did last
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
  budget?: number;             // 0.5 / 1 / 2 — scale chosen at launch
  sales?: number;              // cars sold to its leads
  reach?: number;              // people reached
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
  /** Something the player can do about it straight from the notification. */
  action?: NoticeAction;
}

export interface NoticeAction {
  kind: 'proposal' | 'conflict' | 'waiting' | 'appointment' | 'decision' | 'contract';
  id: string;
}

// ---------------------------------------------------------------- procurement (v5)
export type RiskAppetite = 'low' | 'medium' | 'high';
export interface BuyMandate {
  id: string;
  buyerId: string;
  locationId: string;
  active: boolean;
  budget: number;               // money the buyer may commit
  spent: number;                // committed so far
  brands: string[];             // empty = any
  categories: Category[];       // empty = any
  fuels: FuelType[];            // empty = any
  transmission?: 'Manual' | 'Automatic';
  yearMin: number;
  yearMax: number;
  kmMax: number;
  maxPrice: number;
  minMargin: number;
  risk: RiskAppetite;
  autoApprove: boolean;         // buy straight away when a deal clears the criteria comfortably
  searchDays: number;           // days searched (for the "time to find" figure)
}
export interface BuyProposal {
  id: string;
  mandateId: string;
  buyerId: string;
  locationId: string;
  vehicle: Vehicle;             // the car as the seller describes it
  asking: number;               // seller's price
  price: number;                // what the buyer negotiated
  estRetail: number;            // buyer's estimate of what it will sell for
  estPrep: number;              // buyer's estimate of preparation costs
  estMargin: number;
  risk: RiskAppetite;
  notes: string[];              // what the buyer found (or thinks)
  day: number;
  expires: number;
  rounds: number;               // times you asked the buyer to push the price
}
export interface ProcurementState {
  mandates: BuyMandate[];
  proposals: BuyProposal[];
  log: { day: number; buyerId: string; kind: 'bought' | 'sold' | 'missed'; amount: number; vehicle: string }[];
}

export interface Negotiation {
  customerId: string;
  vehicleId: string;
  round: number;
  patienceLeft: number;
  lastCustomerOffer: number;
  lastPlayerPrice: number;
  extras: Record<string, boolean>;
  plan?: FinancePlan;
  tradeInOffer?: number;
  tradeInIncluded: boolean;
  request?: { extra: string; price: number };
  freeExtra?: string;
  log: { who: 'you' | 'them' | 'system'; text: string }[];
  mood: number;               // -1..1
  done: boolean;
  outcome?: 'sold' | 'walked' | 'rejected';
}

export type FinanceKind = 'cash' | 'loan' | 'lease' | 'balloon';
export interface FinancePlan {
  kind: FinanceKind;
  term: number;                 // months
  deposit: number;              // share of the price paid up front (0..0.5)
  apr: number;                  // annual rate
  monthly: number;              // payment per month
  approved?: boolean;
  declined?: boolean;
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
  commission?: number;         // sales commission on gross profit (0..0.1)
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
  repeatSales?: number;
  fleetDelivered?: number;
  certifiedSold?: number;
  newSold?: number;
  serviceJobs?: number;
  financeDeals?: number;
  luxurySold?: number;
  researchDone?: number;
  decisionsMade?: number;
  onlineSales?: number;
  testDrives?: number;
  productsSold?: number;
  campaignsRun?: number;
  /** Test drives the player drove themselves (v6). */
  playerDrives?: number;
  /** Best overall score (0..100) per test-drive route. */
  driveBest?: Record<string, number>;
  /** Objects bulldozed, land expansions bought (v6). */
  bulldozed?: number;
  landBought?: number;
}


// ------------------------------------------------------------ v4 systems --

/** The national economy: it moves slowly every week and shapes demand, prices and credit. */
export interface Economy {
  fuel: number;                 // fuel price index (1 = normal)
  rate: number;                 // central interest rate, % per year
  growth: number;               // GDP growth, % per year
  confidence: number;           // consumer confidence 0..100
  evIncentive: number;          // 0..1 subsidy strength for EVs
  importCost: number;           // import cost index (1 = normal)
  history: { day: number; fuel: number; rate: number; growth: number; confidence: number }[];
}

export type FunnelCounts = Record<FunnelStage, number>;

/** A customer you have sold to or serviced (CRM). */
export interface Client {
  id: string;
  name: string;
  archetype: ArchetypeId;
  locationId: string;
  firstDay: number;
  lastDay: number;
  purchases: number;
  spent: number;
  serviceVisits: number;
  lifetimeValue: number;        // gross profit earned from them
  satisfaction: number;         // running average stars 1..5
  car?: { name: string; modelId: string; category: Category; body: BodyType; fuel: FuelType; year: number };
  nextServiceDay?: number;
  nextPurchaseDay?: number;
  budget: number;
  lost?: boolean;               // had a bad experience and will not return
}

export type ServiceTypeId = 'maintenance' | 'oil' | 'tyres' | 'brakes' | 'diagnostics' | 'inspection' | 'repair' | 'detailing' | 'body' | 'ev';

/** A paying customer's car in the service department. */
/** A slot in the planning: service work, a sales visit, a test drive or a handover. */
export interface Appointment {
  id: string;
  kind: 'service' | 'sales' | 'testdrive' | 'delivery';
  locationId: string;
  day: number;
  start: number;                // hour (8..19, may be fractional for half hours)
  duration: number;             // hours
  staffId?: string;             // who is booked for it
  jobId?: string;               // service job
  clientId?: string;
  customer: string;
  vehicle: string;
  title: string;
  revenue?: number;             // expected revenue
  status: 'planned' | 'arrived' | 'active' | 'done' | 'missed' | 'cancelled';
  note?: string;
}

export interface ServiceJob {
  id: string;
  locationId: string;
  type: ServiceTypeId;
  customer: string;
  clientId?: string;
  vehicle: string;
  electric: boolean;
  hours: number;                // labour hours still to do
  totalHours: number;
  labour: number;               // labour price (EUR)
  parts: Partial<Record<PartId, number>>;
  partsReserved: boolean;
  status: 'booked' | 'waiting' | 'working' | 'parts' | 'done';
  bookedDay: number;
  dueDay: number;
  upsell?: number;              // extra work sold by the service advisor
  // planning (v5)
  apptId?: string;              // its appointment in the planning
  staffId?: string;             // mechanic doing it
  liftId?: string;              // the lift it is on while being worked on
  stage?: 'expected' | 'reception' | 'waiting' | 'lift' | 'check' | 'ready' | 'collected';
  problem?: string;             // what the customer said
}

export interface ContractState {
  brandId: string;
  tier: 1 | 2 | 3;              // authorised, silver, gold (exclusive)
  since: number;
  relation: number;             // 0..100
  soldMonth: number;            // brand cars sold this month
  soldTotal: number;
  warnings: number;
  locationId: string;           // the showroom that carries the brand
}

export interface ResearchState {
  done: Record<string, number>;
  active?: { id: string; daysLeft: number };
  queue: string[];
}

export interface DecisionState {
  id: string;
  defId: string;
  day: number;
  expires: number;
  locationId: string;
  data: Record<string, number | string>;
}

export type FleetSector = 'taxi' | 'rental' | 'construction' | 'delivery' | 'government' | 'corporate';
export interface FleetRequest {
  id: string;
  client: string;
  sector: FleetSector;
  qty: number;
  delivered: number;
  categories: Category[];
  bodies: BodyType[];
  maxUnit: number;              // most they pay per car
  discount: number;             // expected discount vs retail
  deadline: number;
  status: 'open' | 'accepted' | 'done' | 'failed' | 'declined' | 'expired';
  repeatMonths: number;         // follow-up orders if you deliver well
  serviceContract: number;      // monthly service revenue if accepted
  serviceLeft?: number;         // months of the service contract still to run
  freeService?: boolean;        // you promised free maintenance (a cost, not income)
  locationId: string;
  revenue: number;
}

export interface MissionState {
  active: string[];
  done: Record<string, number>;
}

export interface GroupState {
  hq: boolean;
  hqDay?: number;
  departments: Record<string, number>;   // department id -> level
  regional: Record<string, string>;      // location id -> manager employee id
  acquisitions: number;
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
  // v4 systems
  economy: Economy;
  funnel: { month: FunnelCounts; last: FunnelCounts; total: FunnelCounts };
  clients: Client[];
  serviceJobs: ServiceJob[];
  contracts: ContractState[];
  brandRelations: Record<string, number>;
  research: ResearchState;
  decisions: DecisionState[];
  fleet: FleetRequest[];
  missions: MissionState;
  group: GroupState;
  suppliers: Record<string, number>;      // relationship with each purchase channel, 0..100
  branding: { color: string; logo: string; tagline: string; position?: string };
  procurement: ProcurementState;
  appointments: Appointment[];
  kpi: { waitHours: number; waitCount: number; financeDeals: number; financeOffers: number; productsSold: number; serviceRevenue: number; partsRevenue: number; financeIncome: number; deliveries: number; serviceTurnedAway?: number };
  kpiLast?: GameState['kpi'];
  boosts: { what: 'leads' | 'service' | 'wtp' | 'ev' | 'parts'; mult: number; until: number; locationId?: string; source: string }[];
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
