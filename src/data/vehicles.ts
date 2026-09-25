// Fictional automotive ecosystem. All brands and models are invented.
import { BodyType, Category, Drivetrain, FuelType, Manufacturer, ModelSpec } from '../sim/types';

export const MANUFACTURERS: Manufacturer[] = [
  { id: 'volter', name: 'Volter', country: 'Germany', prestige: 0.45, reliability: 0.78, popularity: 0.85, tagline: 'Engineered for everyone', color: '#4f8cff' },
  { id: 'nordica', name: 'Nordica', country: 'Sweden', prestige: 0.6, reliability: 0.86, popularity: 0.7, tagline: 'Safe. Solid. Scandinavian.', color: '#7fb3d5' },
  { id: 'raven', name: 'Raven', country: 'United Kingdom', prestige: 0.8, reliability: 0.55, popularity: 0.55, tagline: 'Built to be driven', color: '#9b59b6' },
  { id: 'aurelia', name: 'Aurelia', country: 'Italy', prestige: 0.92, reliability: 0.5, popularity: 0.45, tagline: 'Passione in motion', color: '#e74c3c' },
  { id: 'vektor', name: 'Vektor', country: 'Germany', prestige: 0.85, reliability: 0.72, popularity: 0.72, tagline: 'Precision performance', color: '#95a5a6' },
  { id: 'mistral', name: 'Mistral', country: 'France', prestige: 0.4, reliability: 0.62, popularity: 0.68, tagline: 'La vie, simplifiée', color: '#1abc9c' },
  { id: 'kron', name: 'Kron', country: 'Czechia', prestige: 0.3, reliability: 0.8, popularity: 0.75, tagline: 'Honest value', color: '#27ae60' },
  { id: 'falconer', name: 'Falconer', country: 'United States', prestige: 0.55, reliability: 0.65, popularity: 0.62, tagline: 'Big roads, bigger trucks', color: '#e67e22' },
  { id: 'monarch', name: 'Monarch', country: 'United Kingdom', prestige: 0.97, reliability: 0.7, popularity: 0.35, tagline: 'Quiet authority', color: '#d4af37' },
  { id: 'ardent', name: 'Ardent', country: 'Netherlands', prestige: 0.62, reliability: 0.82, popularity: 0.6, tagline: 'Electric, effortless', color: '#00d2a0' },
  { id: 'sakura', name: 'Sakuro', country: 'Japan', prestige: 0.42, reliability: 0.93, popularity: 0.8, tagline: 'Built to last', color: '#ff6b81' },
  { id: 'helix', name: 'Helix', country: 'South Korea', prestige: 0.38, reliability: 0.84, popularity: 0.66, tagline: 'Smart moves', color: '#3498db' },
  { id: 'voltara', name: 'Voltara', country: 'Norway', prestige: 0.58, reliability: 0.8, popularity: 0.74, tagline: 'Charged for tomorrow', color: '#2fd18b' },
  { id: 'nordwerk', name: 'Nordwerk', country: 'Germany', prestige: 0.78, reliability: 0.8, popularity: 0.7, tagline: 'Ingenieurskunst', color: '#51606f' },
  { id: 'imperium', name: 'Imperium', country: 'Switzerland', prestige: 0.95, reliability: 0.74, popularity: 0.3, tagline: 'The last word', color: '#b48a3c' },
  { id: 'castilla', name: 'Castilla', country: 'Spain', prestige: 0.32, reliability: 0.72, popularity: 0.72, tagline: 'Sol y carretera', color: '#e1a84a' },
  { id: 'kitsune', name: 'Kitsune', country: 'Japan', prestige: 0.55, reliability: 0.88, popularity: 0.66, tagline: 'Clever by nature', color: '#ff7a1a' },
  { id: 'tundra', name: 'Tundra', country: 'Canada', prestige: 0.35, reliability: 0.78, popularity: 0.6, tagline: 'Built for the backcountry', color: '#8a6d3b' },
  { id: 'solace', name: 'Solace', country: 'United States', prestige: 0.74, reliability: 0.7, popularity: 0.62, tagline: 'Silent speed', color: '#e0e6ed' },
  { id: 'marino', name: 'Marino', country: 'Italy', prestige: 0.25, reliability: 0.66, popularity: 0.72, tagline: 'Città e oltre', color: '#2f9e44' },
  { id: 'bastide', name: 'Bastide', country: 'France', prestige: 0.68, reliability: 0.68, popularity: 0.5, tagline: 'L\u2019élégance tranquille', color: '#6c5ce7' },
  { id: 'orion', name: 'Orion', country: 'China', prestige: 0.22, reliability: 0.74, popularity: 0.6, tagline: 'Electric for all', color: '#00b4d8' },
  { id: 'brennan', name: 'Brennan', country: 'United Kingdom', prestige: 0.84, reliability: 0.6, popularity: 0.38, tagline: 'Handcrafted speed', color: '#ff9f1c' },
];

/** EV-only brands need EV-certified staff to hold a dealer contract. */
const EV_BRANDS = ['voltara', 'ardent', 'solace', 'orion'];

/**
 * Franchise terms follow the brand's image: budget brands want volume and
 * little else; luxury brands want a big showroom, trained staff and a
 * spotless reputation, and pay you well for it.
 */
for (const m of MANUFACTURERS) {
  const p = m.prestige;
  const tier = p >= 0.88 ? 3 : p >= 0.6 ? 2 : p >= 0.4 ? 1 : 0;
  m.dealer = [
    { margin: 0.08, bonus: 300, support: 0.08, minShowroom: 50, minSales: 3, minLifts: 1, fee: 25000, minRep: 45, minLevel: 2 },
    { margin: 0.09, bonus: 450, support: 0.1, minShowroom: 70, minSales: 3, minLifts: 1, fee: 40000, minRep: 50, minLevel: 2 },
    { margin: 0.1, bonus: 900, support: 0.12, minShowroom: 100, minSales: 2, minLifts: 2, fee: 90000, minRep: 58, minLevel: 3 },
    { margin: 0.12, bonus: 3500, support: 0.15, minShowroom: 130, minSales: 1, minLifts: 2, fee: 250000, minRep: 68, minLevel: 4, training: 'luxury' },
  ][tier];
  if (EV_BRANDS.includes(m.id)) m.dealer = { ...m.dealer, training: 'ev' };
}

type Row = [id: string, brand: string, name: string, body: BodyType, cat: Category, base: number, from: number, to: number,
  engines: string, trims: string, rarity: number, dep: number, popularity?: number];

// engines: "label:hp:fuel|..." fuel P/D/H/E
const ROWS: Row[] = [
  ['volter-pix', 'volter', 'Pix', 'Hatchback', 'Economy', 16500, 2008, 2025, '1.0 T3:75:P|1.2 T4:90:P|1.6 D4:95:D', 'Base,Comfort,Style', 0.05, 0.13],
  ['volter-corvo', 'volter', 'Corvo', 'Hatchback', 'Compact', 26000, 2006, 2025, '1.4 T4:125:P|2.0 D4:150:D|1.4 PowerMix:204:H|2.0 T4 R:245:P', 'Trend,Comfort,Highline,Volter R', 0.08, 0.11],
  ['volter-pascal', 'volter', 'Pascal', 'Wagon', 'Family', 36000, 2008, 2025, '1.5 T4:150:P|2.0 D4:150:D|2.0 D4:190:D|1.4 PowerMix:218:H', 'Business,Elegance,Sport-Line', 0.06, 0.12],
  ['volter-talon', 'volter', 'Talon', 'SUV', 'SUV', 38000, 2010, 2025, '1.5 T4:150:P|2.0 D4:150:D|1.4 PowerMix:245:H', 'Life,Elegance,Sport-Line', 0.06, 0.11],
  ['volter-volta', 'volter', 'Volta E4', 'SUV', 'Electric', 46000, 2020, 2025, 'Pro 77kWh:204:E|Dual 77kWh:299:E', 'Pure,Pro,Dual', 0.1, 0.16],
  ['volter-cargo', 'volter', 'Cargomax', 'Van', 'Van', 34000, 2009, 2025, '2.0 D4:102:D|2.0 D4:150:D', 'Cargo,Kombi,Crew', 0.06, 0.1],

  ['nordica-n40', 'nordica', 'N40', 'Hatchback', 'Compact', 32000, 2012, 2020, 'P3:152:P|N2:120:D|P5:245:P', 'Kinetic,Momentum,Nord Sport', 0.1, 0.12],
  ['nordica-n60', 'nordica', 'N60 Touring', 'Wagon', 'Family', 45000, 2010, 2025, 'H4:197:H|N4:190:D|H8:390:H', 'Core,Plus,Ultimate', 0.08, 0.12],
  ['nordica-fjord', 'nordica', 'Fjord 60', 'SUV', 'SUV', 55000, 2010, 2025, 'H5:250:H|N5:235:D|H8:455:H', 'Core,Plus,Ultimate', 0.07, 0.11],
  ['nordica-fjord90', 'nordica', 'Fjord 90', 'SUV', 'Premium', 78000, 2012, 2025, 'H5:250:H|N5:235:D|H8:455:H', 'Plus,Ultimate,Excellence', 0.12, 0.12],
  ['nordica-aurora', 'nordica', 'Aurora e30', 'SUV', 'Electric', 38000, 2023, 2025, 'Single 51kWh:272:E|Twin 69kWh:428:E', 'Core,Plus,Ultra', 0.14, 0.17],

  ['raven-kestrel', 'raven', 'Kestrel', 'Roadster', 'Sport', 32000, 2005, 2023, '1.5 VT:130:P|2.0 VT:184:P', 'SE,Sport,Club', 0.25, 0.1],
  ['raven-highland', 'raven', 'Highland', 'SUV', 'Premium', 72000, 2008, 2025, 'D250:249:D|P400:400:P|P440h:404:H', 'S,SE,HSE,Heritage', 0.12, 0.14],
  ['raven-moor', 'raven', 'Moorland', 'SUV', 'Luxury', 58000, 2011, 2025, 'D165:163:D|P250:249:P|P300h:309:H', 'S,Dynamic SE,Dynamic HSE', 0.1, 0.15],
  ['raven-falcata', 'raven', 'Falcata GT', 'Coupe', 'Performance', 145000, 2006, 2024, 'V8 4.0:510:P|V12 5.2:700:P', 'Coupe,Grand Prix,Track Edition', 0.55, 0.12],

  ['aurelia-sera', 'aurelia', 'Serafina', 'Sedan', 'Sport', 46000, 2016, 2025, '2.0 Turbo:200:P|2.2 Diesel:190:D|2.9 V6 Corsa:510:P', 'Sprint,Veloce,Corsa', 0.2, 0.15],
  ['aurelia-brezza', 'aurelia', 'Brezza', 'Convertible', 'Sport', 38000, 2008, 2020, '1.4 Turbo:170:P|1.8 Turbo:200:P', 'Lusso,Scorpione', 0.3, 0.1],
  ['aurelia-fulmine', 'aurelia', 'Fulmine', 'Coupe', 'Performance', 220000, 2008, 2025, 'V8 3.9:620:P|V12 6.5:800:P', 'GT,Pista,Speciale', 0.7, 0.1],
  ['aurelia-rondine', 'aurelia', 'Rondine', 'Convertible', 'Classic', 42000, 1966, 1993, '1.6 Bialbero:109:P|2.0 Bialbero:128:P', 'Serie 1,Serie 2,Serie 4', 0.85, -0.02],

  ['vektor-v4', 'vektor', 'V4 Saloon', 'Sedan', 'Premium', 48000, 2007, 2025, '200:204:P|220 D:200:D|300 H:313:H|V43:408:P', 'Avant,Sport Line,Exclusive', 0.07, 0.14],
  ['vektor-v6', 'vektor', 'V6 Saloon', 'Sedan', 'Luxury', 65000, 2009, 2025, '200:197:P|220 D:197:D|300 H:313:H|V53:449:P', 'Avant,Sport Line,Exclusive', 0.09, 0.15],
  ['vektor-x5', 'vektor', 'VX5', 'SUV', 'Premium', 62000, 2015, 2025, '200 AWD:204:P|220 D AWD:197:D|300 H AWD:313:H', 'Avant,Sport Line', 0.08, 0.14],
  ['vektor-vr8', 'vektor', 'VR8', 'Coupe', 'Performance', 120000, 2008, 2025, 'V8 4.2:450:P|V10 5.2:620:P', 'Coupe,Performance,Plus', 0.45, 0.13],
  ['vektor-ev7', 'vektor', 'Volt 7', 'Sedan', 'Electric', 90000, 2021, 2025, '450:333:E|580 AWD:523:E', 'Electric Art,Sport Line', 0.2, 0.2],
  ['vektor-trail', 'vektor', 'Trailmaster', 'SUV', 'Classic', 70000, 1985, 1996, '300 D:113:D|300 E:170:P', 'Station Wagon,Cabrio', 0.8, -0.01],

  ['mistral-cleo', 'mistral', 'Cleo', 'Hatchback', 'Economy', 18500, 2006, 2025, '1.0 T:90:P|1.5 dT:90:D|1.6 Hybride:140:H', 'Life,Zen,Intens,Sport', 0.04, 0.14],
  ['mistral-megara', 'mistral', 'Mégara', 'Hatchback', 'Compact', 26500, 2008, 2023, '1.3 T:140:P|1.5 dT:115:D|1.8 T Sport:300:P', 'Zen,Intens,GT Ligne,Sport', 0.06, 0.15],
  ['mistral-senic', 'mistral', 'Sénic', 'Van', 'Family', 30000, 2009, 2022, '1.3 T:140:P|1.7 dT:150:D', 'Zen,Intens,Initiale', 0.06, 0.16],
  ['mistral-zea', 'mistral', 'Zéa', 'Hatchback', 'Electric', 32000, 2013, 2024, 'R110 52kWh:108:E|R135 52kWh:135:E', 'Life,Zen,Intens', 0.06, 0.2],
  ['mistral-kanga', 'mistral', 'Kangaroo', 'Van', 'Van', 24000, 2008, 2025, '1.5 dT:95:D|1.5 dT:115:D|E-Kangaroo:122:E', 'Comfort,Extra,Maxi', 0.05, 0.12],

  ['kron-fabric', 'kron', 'Fabric', 'Hatchback', 'Economy', 17000, 2007, 2025, '1.0 N:65:P|1.0 T:95:P|1.4 D:90:D', 'Active,Ambition,Style', 0.04, 0.12],
  ['kron-oktavo', 'kron', 'Oktavo', 'Wagon', 'Family', 30000, 2006, 2025, '1.5 T:150:P|2.0 D:150:D|2.0 T KR:245:P|1.4 Hybrid:204:H', 'Ambition,Style,Heritage,Kron R', 0.05, 0.11],
  ['kron-kodiak', 'kron', 'Kodiak', 'SUV', 'SUV', 40000, 2016, 2025, '1.5 T:150:P|2.0 D:200:D', 'Ambition,Style,Sportline', 0.05, 0.11],
  ['kron-enya', 'kron', 'Enya', 'SUV', 'Electric', 44000, 2021, 2025, '60 58kWh:180:E|80 77kWh:204:E|KR 77kWh:299:E', 'Loft,Lodge,Sportline', 0.08, 0.17],

  ['falconer-ridge', 'falconer', 'Ridgeback', 'Pickup', 'SUV', 52000, 2008, 2025, '2.0 Diesel:213:D|3.0 V6:288:D|3.5 V6 Baja:405:P', 'XL,XLT,Outback,Baja', 0.2, 0.1],
  ['falconer-stallion', 'falconer', 'Stallion', 'Coupe', 'Sport', 55000, 2005, 2025, '2.3 Turbo:290:P|5.0 V8:450:P', 'Fastback,GT,Thunder', 0.18, 0.1],
  ['falconer-focal', 'falconer', 'Focal', 'Hatchback', 'Compact', 24000, 2005, 2025, '1.0 Turbo:125:P|1.5 Diesel:120:D|2.3 Turbo ST:280:P', 'Trend,Titan,Sport,ST', 0.05, 0.14],
  ['falconer-hauler', 'falconer', 'Hauler', 'Van', 'Van', 38000, 2006, 2025, '2.0 Diesel:130:D|2.0 Diesel:170:D|E-Hauler:269:E', 'Trend,Limited,Jumbo', 0.05, 0.1],
  ['falconer-stallion69', 'falconer', 'Stallion 69', 'Coupe', 'Classic', 55000, 1964, 1973, '289 V8:271:P|428 V8:335:P', 'Fastback,Thunder,Boss Hog', 0.9, -0.03],

  ['monarch-regent', 'monarch', 'Regent', 'Sedan', 'Luxury', 320000, 2010, 2025, 'V12 6.6:571:P|V12 6.75:600:P', 'Standard,Extended,Onyx', 0.75, 0.13],
  ['monarch-tourer', 'monarch', 'Grand Tourer', 'Coupe', 'Luxury', 210000, 2006, 2025, 'V8 4.0:550:P|W12 6.0:659:P', 'Coupe,Atelier,Velocity', 0.5, 0.14],
  ['monarch-bastion', 'monarch', 'Bastion', 'SUV', 'Luxury', 230000, 2016, 2025, 'V8 4.0:550:P|V8 Hybrid:462:H|W12:635:P', 'Standard,Azure,S,Velocity', 0.5, 0.14],
  ['monarch-crest', 'monarch', 'Silver Crest', 'Sedan', 'Rare', 180000, 1955, 1966, '4.9 I6:155:P|6.2 V8:200:P', 'Saloon,Long Wheelbase', 0.97, -0.03],

  ['ardent-one', 'ardent', 'One', 'Hatchback', 'Electric', 36000, 2019, 2025, '45kWh:150:E|60kWh:204:E', 'Core,Plus', 0.08, 0.19],
  ['ardent-meridian', 'ardent', 'Meridian', 'Sedan', 'Electric', 52000, 2018, 2025, 'SR 60kWh:283:E|LR 82kWh:351:E|Performance:513:E', 'Standard,Long Range,Performance', 0.07, 0.18],
  ['ardent-summit', 'ardent', 'Summit', 'SUV', 'Electric', 62000, 2020, 2025, 'LR 82kWh:384:E|Performance:534:E', 'Long Range,Performance', 0.08, 0.18],
  ['ardent-apex', 'ardent', 'Apex', 'Coupe', 'Performance', 130000, 2021, 2025, 'Tri-Motor:1020:E', 'Ludicrum', 0.55, 0.2],

  ['sakura-yuri', 'sakura', 'Yuri', 'Hatchback', 'Economy', 19000, 2006, 2025, '1.0 V:72:P|1.5 Hybrid:116:H|1.6 Turbo SR:261:P', 'Active,Comfort,Dynamic,SR', 0.08, 0.1],
  ['sakura-coralla', 'sakura', 'Coralla', 'Wagon', 'Family', 30000, 2006, 2025, '1.8 Hybrid:122:H|2.0 Hybrid:184:H|1.6 V:132:P', 'Active,Dynamic,Executive', 0.05, 0.09],
  ['sakura-kaze', 'sakura', 'Kaze 4', 'SUV', 'SUV', 42000, 2006, 2025, '2.5 Hybrid:218:H|2.5 Plug-in:306:H|2.2 Diesel:150:D', 'Active,Dynamic,Style,Executive', 0.05, 0.08],
  ['sakura-supremo', 'sakura', 'Supremo', 'Coupe', 'Sport', 62000, 2019, 2025, '2.0 Turbo:258:P|3.0 Turbo:340:P', 'Pure,Premium,Legend', 0.3, 0.09],
  ['sakura-hilo', 'sakura', 'Hilo', 'Pickup', 'SUV', 45000, 2005, 2025, '2.4 Diesel:150:D|2.8 Diesel:204:D', 'Comfort,Unbreakable', 0.08, 0.07],
  ['sakura-drift', 'sakura', 'Drift 86', 'Coupe', 'Rare', 28000, 1983, 1987, '1.6 Twin Cam:128:P', 'GT-S,GT-Apex', 0.92, -0.05],

  ['helix-h30', 'helix', 'H-Thirty', 'Hatchback', 'Compact', 24500, 2008, 2025, '1.0 T:120:P|1.6 D:136:D|2.0 T HX:280:P', 'Comfort,Premium,HX Line,HX', 0.05, 0.14],
  ['helix-tessera', 'helix', 'Tessera', 'SUV', 'SUV', 38000, 2010, 2025, '1.6 T:150:P|1.6 Hybrid:230:H|1.6 Plug-in:265:H', 'Comfort,Premium,HX Line', 0.05, 0.13],
  ['helix-ion5', 'helix', 'Ion 5', 'SUV', 'Electric', 50000, 2021, 2025, '58kWh:170:E|77kWh:229:E|77kWh AWD:325:E|HX:650:E', 'Connect,Lounge,HX', 0.1, 0.17],
  ['helix-voyage', 'helix', 'Voyage', 'Van', 'Van', 48000, 2021, 2025, '2.2 D:177:D', 'Business,Premium,Lounge', 0.08, 0.13],
  ['helix-kona', 'helix', 'Kova', 'Crossover', 'Compact', 27000, 2017, 2025, '1.0 T:120:P|1.6 Hybrid:141:H|64kWh:204:E', 'Comfort,Premium,N Line', 0.05, 0.13, 0.7],

  // Aurelia's everyday range, from city car to flagship SUV.
  ['aurelia-a1', 'aurelia', 'A1', 'Hatchback', 'Compact', 24000, 2012, 2025, '1.0 T:110:P|1.5 T:150:P', 'Stile,Lusso,Sportiva', 0.1, 0.13, 0.62],
  ['aurelia-a3', 'aurelia', 'A3', 'Hatchback', 'Premium', 34000, 2010, 2025, '1.5 T:150:P|2.0 D:150:D|2.0 T S:310:P', 'Stile,Lusso,Sportiva', 0.08, 0.13, 0.7],
  ['aurelia-a5', 'aurelia', 'A5', 'Sedan', 'Premium', 44000, 2010, 2025, '2.0 T:204:P|2.0 D:190:D|2.0 Ibrida:299:H', 'Stile,Lusso,Sportiva', 0.1, 0.14, 0.72],
  ['aurelia-a7', 'aurelia', 'A7 Sportback', 'Coupe', 'Luxury', 72000, 2011, 2025, '3.0 V6:340:P|3.0 D:286:D|4.0 V8 RS:600:P', 'Lusso,Sportiva,Corsa', 0.2, 0.15, 0.5],
  ['aurelia-a9', 'aurelia', 'A9 SUV', 'SUV', 'Luxury', 88000, 2016, 2025, '3.0 V6:340:P|3.0 Ibrida:462:H|4.0 V8:600:P', 'Lusso,Sportiva,Speciale', 0.25, 0.14, 0.48],

  ['voltara-v1', 'voltara', 'V1', 'Hatchback', 'Electric', 26000, 2019, 2025, '42kWh:136:E|54kWh:156:E', 'Base,Plus,Edge', 0.05, 0.19, 0.74],
  ['voltara-v3', 'voltara', 'V3', 'Crossover', 'Electric', 36000, 2019, 2025, '58kWh:204:E|77kWh AWD:299:E', 'Base,Plus,Edge', 0.05, 0.18, 0.8],
  ['voltara-v5', 'voltara', 'V5', 'Sedan', 'Electric', 48000, 2020, 2025, '77kWh:286:E|91kWh AWD:408:E', 'Plus,Edge,Signature', 0.07, 0.18, 0.7],
  ['voltara-v7', 'voltara', 'V7', 'SUV', 'Electric', 64000, 2021, 2025, '91kWh AWD:408:E|107kWh AWD:517:E', 'Plus,Edge,Signature', 0.1, 0.17, 0.6],
  ['voltara-v9', 'voltara', 'V9 GT', 'Coupe', 'Performance', 118000, 2022, 2025, 'Tri-Motor 107kWh:780:E', 'GT,Signature', 0.45, 0.19, 0.42],
  ['voltara-h4', 'voltara', 'H4 Hybrid', 'Wagon', 'Family', 34000, 2015, 2025, '1.6 Hybrid:141:H|1.6 Plug-in:265:H', 'Base,Plus,Edge', 0.05, 0.12, 0.72],

  ['nordwerk-n2', 'nordwerk', 'N2', 'Hatchback', 'Compact', 29000, 2011, 2025, '1.5 T:136:P|2.0 D:150:D|2.0 T NW:306:P', 'Advantage,Sport,M-Linie', 0.06, 0.12, 0.74],
  ['nordwerk-n4', 'nordwerk', 'N4', 'Sedan', 'Premium', 45000, 2008, 2025, '2.0 T:184:P|2.0 D:190:D|3.0 T NW:510:P|2.0 Plug-in:292:H', 'Advantage,Sport,Luxury,M-Linie', 0.07, 0.13, 0.78],
  ['nordwerk-n4t', 'nordwerk', 'N4 Touring', 'Wagon', 'Premium', 47000, 2008, 2025, '2.0 T:184:P|2.0 D:190:D|2.0 Plug-in:292:H', 'Advantage,Sport,Luxury', 0.07, 0.13, 0.72],
  ['nordwerk-n6', 'nordwerk', 'N6', 'Sedan', 'Luxury', 62000, 2009, 2025, '3.0 T:340:P|3.0 D:286:D|3.0 Plug-in:394:H', 'Sport,Luxury,M-Linie', 0.1, 0.15, 0.6],
  ['nordwerk-n8', 'nordwerk', 'N8 Coupé', 'Coupe', 'Luxury', 105000, 2018, 2025, '4.4 V8:530:P|4.4 V8 NW:625:P', 'Coupe,Gran Coupe,Competition', 0.35, 0.16, 0.42],
  ['nordwerk-x3', 'nordwerk', 'NX3', 'SUV', 'Premium', 55000, 2011, 2025, '2.0 T:184:P|2.0 D:190:D|3.0 D:286:D|2.0 Plug-in:292:H', 'Advantage,Sport,M-Linie', 0.06, 0.13, 0.8],
  ['nordwerk-x1', 'nordwerk', 'NX1', 'Crossover', 'Premium', 40000, 2015, 2025, '1.5 T:136:P|2.0 D:150:D|66kWh:204:E', 'Advantage,Sport', 0.05, 0.13, 0.76],
  ['nordwerk-nr', 'nordwerk', 'NR Roadster', 'Roadster', 'Sport', 58000, 2009, 2025, '2.0 T:258:P|3.0 T:340:P', 'Sport,M-Linie', 0.3, 0.12, 0.45],

  ['imperium-i4', 'imperium', 'I4', 'Sedan', 'Luxury', 98000, 2012, 2025, '3.0 V6:380:P|3.0 Hybrid:450:H', 'Signature,Privé', 0.4, 0.15, 0.4],
  ['imperium-i6', 'imperium', 'I6 Grand', 'Sedan', 'Luxury', 165000, 2012, 2025, '4.0 V8:560:P|6.0 V12:630:P', 'Signature,Privé,Maison', 0.6, 0.15, 0.32],
  ['imperium-i8', 'imperium', 'I8 Veloce', 'Coupe', 'Performance', 260000, 2014, 2025, '4.0 V8:720:P|6.5 V12:830:P', 'Veloce,Privé,Record', 0.75, 0.12, 0.28],
  ['imperium-ix', 'imperium', 'IX Summit', 'SUV', 'Luxury', 190000, 2018, 2025, '4.0 V8:600:P|4.0 V8 Hybrid:680:H', 'Signature,Privé', 0.6, 0.14, 0.3],
  ['imperium-ic', 'imperium', 'IC Cabriolet', 'Convertible', 'Luxury', 210000, 2015, 2025, '4.0 V8:600:P|6.0 V12:650:P', 'Signature,Privé', 0.65, 0.14, 0.28],

  ['castilla-ciudad', 'castilla', 'Ciudad', 'Hatchback', 'Economy', 15500, 2008, 2025, '1.0 MPI:80:P|1.0 TSI:110:P|1.6 TDI:95:D', 'Reference,Style,FR', 0.04, 0.13, 0.78],
  ['castilla-leon', 'castilla', 'León', 'Hatchback', 'Compact', 24000, 2006, 2025, '1.5 TSI:150:P|2.0 TDI:150:D|1.4 e-Hybrid:204:H|2.0 TSI Cupra:300:P', 'Style,Xcellence,FR,Cupra', 0.05, 0.13, 0.76],
  ['castilla-sierra', 'castilla', 'Sierra', 'Crossover', 'Compact', 26500, 2016, 2025, '1.0 TSI:110:P|1.5 TSI:150:P|2.0 TDI:150:D', 'Style,Xcellence,FR', 0.04, 0.13, 0.78],
  ['castilla-mar', 'castilla', 'Mar Cabrio', 'Convertible', 'Sport', 30000, 2010, 2022, '1.4 TSI:150:P|2.0 TSI:230:P', 'Style,FR', 0.25, 0.12, 0.4],
  ['castilla-furgo', 'castilla', 'Furgo', 'Van', 'Van', 26000, 2008, 2025, '1.6 TDI:102:D|2.0 TDI:122:D', 'Cargo,Combi', 0.05, 0.12, 0.6],

  ['tundra-ranger', 'tundra', 'Ranger', 'Pickup', 'Commercial', 42000, 2008, 2025, '2.2 TD:160:D|3.2 TD:200:D|2.5 Hybrid:230:H', 'Work,XLT,Wildtrak', 0.08, 0.1],
  ['tundra-grizzly', 'tundra', 'Grizzly', 'Offroader', 'Offroad', 56000, 2006, 2025, '3.0 TD:249:D|3.6 V6:285:P|4.0 Hybrid:380:H', 'Sport,Rubicon,Summit', 0.15, 0.09],
  ['tundra-caribou', 'tundra', 'Caribou', 'SUV', 'SUV', 39000, 2012, 2025, '2.0 T:190:P|2.2 TD:180:D', 'Trail,Lodge,Summit', 0.06, 0.11],
  ['tundra-workhorse', 'tundra', 'Workhorse', 'Van', 'Commercial', 46000, 2010, 2025, '2.3 TD:160:D|3.0 TD:190:D|eWorkhorse:218:E', 'Panel,Chassis Cab,Crew', 0.06, 0.12],
  ['tundra-bear', 'tundra', 'Kodiak Bear', 'Offroader', 'Classic', 38000, 1978, 1992, '5.7 V8:170:P|6.2 Diesel:130:D', 'Custom,Scottsdale', 0.8, -0.015],
  ['solace-s', 'solace', 'S1', 'Sedan', 'Electric', 62000, 2016, 2025, 'Long Range AWD:450:E|Performance AWD:670:E', 'Standard,Long Range,Plaid', 0.1, 0.17],
  ['solace-x', 'solace', 'X1', 'SUV', 'Electric', 78000, 2017, 2025, 'Long Range AWD:500:E|Performance AWD:760:E', 'Long Range,Plaid', 0.14, 0.18],
  ['solace-3', 'solace', '3e', 'Sedan', 'Electric', 42000, 2019, 2025, 'RWD:283:E|Long Range AWD:498:E|Performance AWD:510:E', 'RWD,Long Range,Performance', 0.05, 0.15],
  ['solace-y', 'solace', 'Ye', 'Crossover', 'Electric', 46000, 2020, 2025, 'RWD:299:E|Long Range AWD:514:E', 'RWD,Long Range,Performance', 0.05, 0.15],
  ['solace-roadster', 'solace', 'Roadster e', 'Roadster', 'Performance', 160000, 2024, 2025, 'Tri-motor AWD:1100:E', 'Founders,Standard', 0.6, 0.12],
  ['marino-piccola', 'marino', 'Piccola', 'Hatchback', 'Economy', 13500, 2007, 2025, '1.0:69:P|1.2:85:P|1.0 Hybrid:70:H', 'Pop,Lounge,Sport', 0.03, 0.14],
  ['marino-tipo', 'marino', 'Tipo', 'Sedan', 'Compact', 19500, 2015, 2025, '1.4:95:P|1.6 MJ:130:D|1.5 Hybrid:130:H', 'Easy,City Life,Cross', 0.04, 0.15],
  ['marino-strada', 'marino', 'Strada', 'Wagon', 'Family', 22500, 2010, 2025, '1.4 T:120:P|1.6 MJ:120:D', 'Easy,Lounge', 0.05, 0.15],
  ['marino-panda', 'marino', 'Panda 4x4', 'Crossover', 'Offroad', 19000, 2012, 2025, '0.9 TwinAir 4x4:85:P|1.0 Hybrid:70:H', '4x4,Cross', 0.08, 0.12],
  ['marino-ducat', 'marino', 'Ducat', 'Van', 'Commercial', 32000, 2006, 2025, '2.3 MJ:140:D|2.3 MJ:180:D|E-Ducat:122:E', 'Panel,Maxi,Crew', 0.05, 0.12],
  ['marino-500', 'marino', 'Cinquecento', 'Hatchback', 'Classic', 14000, 1957, 1975, '0.5:18:P|0.6:22:P', 'Nuova,L,Giardiniera', 0.8, -0.02],
  ['bastide-c3', 'bastide', 'C3 Aircross', 'Crossover', 'Compact', 24000, 2017, 2025, '1.2 PT:110:P|1.5 HDi:110:D', 'Feel,Shine,Shine Pack', 0.04, 0.14],
  ['bastide-c5', 'bastide', 'C5 Grand', 'Sedan', 'Premium', 45000, 2012, 2025, '1.6 PT:180:P|2.0 HDi:180:D|1.6 Hybrid:225:H', 'Business,Rivoli,Opéra', 0.08, 0.16],
  ['bastide-neuf', 'bastide', 'DS Neuf', 'Sedan', 'Luxury', 62000, 2021, 2025, 'E-Tense 250:250:H|E-Tense 360 AWD:360:H', 'Performance Line,Rivoli,Opéra', 0.2, 0.17],
  ['bastide-raid', 'bastide', 'Grand Raid', 'SUV', 'Premium', 52000, 2015, 2025, '1.6 PT:180:P|2.0 HDi:180:D|E-Tense 300 AWD:300:H', 'Performance Line,Rivoli', 0.1, 0.16],
  ['bastide-deesse', 'bastide', 'Déesse', 'Sedan', 'Classic', 48000, 1955, 1975, '1.9:75:P|2.2:115:P|2.3 Pallas:130:P', 'Berline,Pallas,Cabriolet', 0.85, -0.02],
  ['orion-dot', 'orion', 'Dot', 'Hatchback', 'Electric', 21000, 2021, 2025, 'Standard 38kWh:95:E|Long 50kWh:130:E', 'Pure,Pure+,Luxury', 0.04, 0.18],
  ['orion-atto', 'orion', 'Atto', 'Crossover', 'Electric', 33000, 2022, 2025, 'Standard 50kWh:204:E|Extended 60kWh:204:E', 'Active,Comfort,Design', 0.05, 0.18],
  ['orion-seal', 'orion', 'Seal', 'Sedan', 'Electric', 44000, 2023, 2025, 'RWD 82kWh:313:E|AWD 82kWh:530:E', 'Design,Excellence', 0.08, 0.18],
  ['orion-tang', 'orion', 'Tang', 'SUV', 'Electric', 52000, 2022, 2025, 'AWD 86kWh:517:E', 'Flagship', 0.1, 0.19],
  ['orion-cargo', 'orion', 'eCargo', 'Van', 'Commercial', 38000, 2022, 2025, 'eVan 50kWh:136:E|eVan 80kWh:204:E', 'Standard,Long', 0.08, 0.17],
  ['brennan-sprint', 'brennan', 'Sprint', 'Roadster', 'Sport', 48000, 2010, 2025, '1.8 SC:220:P|3.5 V6:360:P', 'Sport,Cup,R', 0.35, 0.09],
  ['brennan-evo', 'brennan', 'Evo GT', 'Coupe', 'Performance', 98000, 2012, 2025, '3.5 V6 SC:410:P|3.5 V6 SC:460:P', 'GT,GTS,GT430', 0.5, 0.1],
  ['brennan-apex', 'brennan', 'Apex', 'Coupe', 'Performance', 260000, 2019, 2025, '4.0 V8 TT:720:P|4.0 V8 TT:765:P', 'Coupe,Spider,LT', 0.8, 0.08],
  ['brennan-seven', 'brennan', 'Seven Classic', 'Roadster', 'Classic', 32000, 1962, 1985, '1.6 Kent:84:P|1.7 Twin Cam:126:P', 'Series 3,Series 4', 0.85, -0.025],
  ['volter-uppy', 'volter', 'Uppy', 'Hatchback', 'Economy', 13500, 2011, 2023, '1.0:60:P|1.0 TSI:90:P|e-Uppy:83:E', 'Take,Move,High', 0.03, 0.14],
  ['volter-artemis', 'volter', 'Artemis', 'Sedan', 'Premium', 44000, 2017, 2025, '2.0 TSI:190:P|2.0 TDI:200:D|1.4 eHybrid:218:H', 'Elegance,R-Line,Shooting Brake', 0.08, 0.16],
  ['volter-amarak', 'volter', 'Amarak', 'Pickup', 'Commercial', 48000, 2011, 2025, '2.0 TDI 4x4:150:D|3.0 V6 TDI 4x4:240:D', 'Life,Style,Aventura', 0.1, 0.11],
  ['volter-bulli', 'volter', 'Bulli', 'Van', 'Classic', 38000, 1962, 1979, '1.5:44:P|1.6:50:P|2.0:70:P', 'Kombi,Samba,Westfalia', 0.85, -0.02],
  ['nordica-n40x', 'nordica', 'N40 Cross', 'Crossover', 'Compact', 34000, 2016, 2025, 'B3:163:P|B4 AWD:197:P|Recharge:231:E', 'Core,Plus,Ultimate', 0.06, 0.13],
  ['kron-citizen', 'kron', 'Citizen', 'Hatchback', 'Economy', 12000, 2012, 2022, '1.0:60:P|1.0:75:P|iV:83:E', 'Active,Ambition,Style', 0.04, 0.14],
  ['kron-superbo', 'kron', 'Superbo', 'Sedan', 'Family', 38000, 2008, 2025, '1.5 T:150:P|2.0 D:200:D|1.4 iV:218:H', 'Ambition,Style,L&K', 0.06, 0.12],
  ['kron-yeti', 'kron', 'Yeti', 'Crossover', 'Offroad', 26000, 2010, 2018, '1.2 T:105:P|2.0 D 4x4:140:D', 'Active,Outdoor', 0.1, 0.12],
  ['falconer-broncho', 'falconer', 'Broncho', 'Offroader', 'Offroad', 62000, 2021, 2025, '2.3 EcoBoost 4x4:270:P|2.7 V6 4x4:330:P', 'Base,Badlands,Wildtrak,Raptor', 0.2, 0.08],
  ['falconer-lightning', 'falconer', 'Lightning', 'Pickup', 'Commercial', 72000, 2022, 2025, 'Standard Range AWD:452:E|Extended Range AWD:580:E', 'Pro,XLT,Lariat,Platinum', 0.18, 0.16],
  ['falconer-transporter', 'falconer', 'Transporter', 'Van', 'Commercial', 40000, 2012, 2025, '2.0 TD:130:D|2.0 TD:170:D|E-Transporter:269:E', 'Van,Minibus,Chassis', 0.04, 0.12],
  ['sakura-cruiser', 'sakura', 'Land Cruiser', 'Offroader', 'Offroad', 68000, 2008, 2025, '2.8 D-4D 4x4:204:D|4.0 V6 4x4:282:P|3.5 V6 TT 4x4:415:P', 'Active,Executive,GR Sport', 0.15, 0.07],
  ['sakura-highlux', 'sakura', 'Highlux', 'Pickup', 'Commercial', 38000, 2006, 2025, '2.4 D-4D 4x4:150:D|2.8 D-4D 4x4:204:D', 'Active,Invincible,GR', 0.06, 0.09],
  ['sakura-proace', 'sakura', 'Proace', 'Van', 'Commercial', 34000, 2013, 2025, '2.0 D:120:D|2.0 D:150:D|Proace Electric:136:E', 'Worker,Comfort,Verso', 0.05, 0.13],
  ['sakura-mrduo', 'sakura', 'MR-Duo', 'Roadster', 'Classic', 22000, 1984, 1999, '1.6 4A-GE:122:P|2.0 Turbo:245:P', 'Mk1,Mk2 Turbo', 0.8, -0.02],
  ['helix-ionix5', 'helix', 'Ionix 5', 'Crossover', 'Electric', 46000, 2021, 2025, '58kWh RWD:170:E|77kWh AWD:325:E|N AWD:650:E', 'Core,Premium,Ultimate,N', 0.08, 0.16],
  ['helix-santafe', 'helix', 'Santa Fé', 'SUV', 'Family', 46000, 2012, 2025, '1.6 T-GDI HEV AWD:230:H|2.2 CRDi:200:D', 'Premium,Ultimate', 0.06, 0.13],
  ['vektor-gklasse', 'vektor', 'G-Klasse', 'Offroader', 'Luxury', 135000, 2005, 2025, 'G350 d 4x4:286:D|G500 4x4:422:P|G63 4x4:585:P', 'Standard,Exclusive,AMG', 0.35, 0.06],
  ['vektor-sprinta', 'vektor', 'Sprinta', 'Van', 'Commercial', 52000, 2008, 2025, '214 CDI:143:D|317 CDI:170:D|eSprinta:204:E', 'Panel,Tourer,Crew', 0.05, 0.12],
  ['vektor-slr', 'vektor', 'SLR Roadster', 'Roadster', 'Premium', 58000, 2011, 2020, '200:184:P|300:245:P|55 AMG:421:P', 'Base,AMG Line', 0.2, 0.13],
  ['monarch-phantasm', 'monarch', 'Phantasm', 'Sedan', 'Luxury', 450000, 2017, 2025, 'V12 6.75:571:P', 'Standard,Extended,Series II', 0.85, 0.12],
  ['imperium-i2', 'imperium', 'I2', 'Hatchback', 'Premium', 38000, 2018, 2025, '1.5 T:156:P|2.0 D:150:D|e-I2:230:E', 'Line,Signature', 0.08, 0.14],
  ['aurelia-ventura', 'aurelia', 'Ventura', 'SUV', 'Luxury', 95000, 2018, 2025, '2.9 V6 BiTurbo AWD:510:P|4.0 V8 Hybrid AWD:620:H', 'Veloce,Quadrifoglio', 0.35, 0.14],
  ['raven-defiant', 'raven', 'Defiant', 'Offroader', 'Offroad', 64000, 2020, 2025, 'D250 4x4:249:D|P400 4x4:400:P|P400e 4x4:404:H', '90,110,130', 0.18, 0.08],
  ['mistral-arkana', 'mistral', 'Arkana', 'Crossover', 'Compact', 29000, 2019, 2025, '1.3 TCe:140:P|1.6 E-Tech:145:H', 'Zen,R.S. Line', 0.05, 0.15],
  ['mistral-mastero', 'mistral', 'Mastero', 'Van', 'Commercial', 36000, 2010, 2025, '2.3 dCi:135:D|2.3 dCi:180:D|E-Tech:76:E', 'Panel,Chassis Cab', 0.05, 0.12],
  ['castilla-formentera', 'castilla', 'Formentera', 'Crossover', 'Sport', 40000, 2020, 2025, '1.5 TSI:150:P|2.0 TSI VZ AWD:310:P|1.4 e-Hybrid:245:H', 'V,VZ,VZ5', 0.12, 0.14],
  ['kitsune-keibox', 'kitsune', 'Kei Box', 'Hatchback', 'Economy', 11000, 2014, 2025, '0.66 Turbo:64:P|0.66 Hybrid:52:H', 'Standard,Custom', 0.1, 0.13],
  ['kitsune-mizu', 'kitsune', 'Mizu', 'Hatchback', 'Economy', 17500, 2010, 2025, '1.2:90:P|1.5 Hybrid:116:H', 'S,SE,SE-L', 0.04, 0.1, 0.72],
  ['kitsune-kaede', 'kitsune', 'Kaede', 'Crossover', 'Family', 31000, 2014, 2025, '2.0:150:P|2.5 Hybrid:218:H|2.4 Plug-in:302:H', 'S,SE,SE-L,Prestige', 0.05, 0.09, 0.8],
  ['kitsune-roku', 'kitsune', 'Roku', 'Sedan', 'Family', 33000, 2008, 2025, '2.0:165:P|2.2 D:184:D|2.5 Hybrid:218:H', 'SE,SE-L,Prestige', 0.05, 0.1, 0.66],
  ['kitsune-kaminari', 'kitsune', 'Kaminari', 'Coupe', 'Sport', 52000, 2012, 2025, '2.0 T:250:P|3.0 V6 T:400:P', 'GT,GT-R', 0.3, 0.1, 0.5],
  ['kitsune-yuki', 'kitsune', 'Yuki EV', 'Crossover', 'Electric', 40000, 2021, 2025, '71kWh:218:E|91kWh AWD:300:E', 'SE,Prestige', 0.08, 0.17, 0.66],
  ['kitsune-mk', 'kitsune', 'Kaminari Mk1', 'Coupe', 'Classic', 32000, 1978, 1992, '2.4 L6:150:P|3.0 L6 Turbo:228:P', 'Standard,Turbo', 0.88, -0.03, 0.35],
];

const BRAND_POP: Record<string, number> = Object.fromEntries(MANUFACTURERS.map((m) => [m.id, m.popularity]));

const FUEL_MAP: Record<string, FuelType> = { P: 'Petrol', D: 'Diesel', H: 'Hybrid', E: 'Electric' };

function buildGenerations(from: number, to: number): { code: string; from: number; to: number }[] {
  const gens: { code: string; from: number; to: number }[] = [];
  let y = from;
  let n = 1;
  while (y <= to) {
    const len = 6 + ((y * 7) % 3);
    const end = Math.min(to, y + len - 1);
    gens.push({ code: `Mk${n}`, from: y, to: end });
    y = end + 1;
    n++;
  }
  return gens;
}

export const MODELS: ModelSpec[] = ROWS.map(r => {
  const engines = r[8].split('|').map(e => {
    const [label, hp, f] = e.split(':');
    return { label, hp: Number(hp), fuel: FUEL_MAP[f] };
  });
  const fuels = Array.from(new Set(engines.map(e => e.fuel)));
  return {
    id: r[0], brandId: r[1], name: r[2], body: r[3], category: r[4], basePrice: r[5],
    yearFrom: r[6], yearTo: r[7], engines, trims: r[9].split(','), fuels,
    generations: buildGenerations(r[6], r[7]), rarity: r[10], depreciation: r[11],
    // Without a figure of its own, a model is as popular as its brand, less so the rarer it is.
    popularity: r[12] ?? Math.max(0.15, Math.min(0.95, (BRAND_POP[r[1]] ?? 0.5) * 0.75 + (1 - r[10]) * 0.25)),
  };
});

export const MODEL_BY_ID: Record<string, ModelSpec> = Object.fromEntries(MODELS.map(m => [m.id, m]));
export const BRAND_BY_ID: Record<string, Manufacturer> = Object.fromEntries(MANUFACTURERS.map(m => [m.id, m]));

/** Factory options: each adds value, and certain buyers look for it. */
export const OPTIONS: { id: string; name: string; value: number; appeal: string[] }[] = [
  { id: 'leather', name: 'Leather', value: 0.025, appeal: ['luxury', 'business', 'senior', 'prestige'] },
  { id: 'sunroof', name: 'Sunroof', value: 0.012, appeal: ['young', 'family'] },
  { id: 'nav', name: 'Navigation', value: 0.012, appeal: ['business', 'commuter', 'fleet'] },
  { id: 'audio', name: 'Premium audio', value: 0.015, appeal: ['young', 'enthusiast', 'prestige'] },
  { id: 'heated', name: 'Heated seats', value: 0.012, appeal: ['family', 'commuter', 'senior'] },
  { id: 'acc', name: 'Adaptive cruise', value: 0.02, appeal: ['business', 'commuter', 'fleet'] },
  { id: 'sport', name: 'Sport package', value: 0.03, appeal: ['enthusiast', 'young'] },
  { id: 'winter', name: 'Winter package', value: 0.012, appeal: ['family', 'suv', 'senior'] },
  { id: 'tow', name: 'Tow bar', value: 0.01, appeal: ['family', 'suv', 'fleet'] },
  { id: 'pdc', name: 'Parking sensors', value: 0.008, appeal: ['firsttime', 'family', 'senior'] },
  { id: 'camera', name: 'Rear camera', value: 0.01, appeal: ['family', 'firsttime', 'senior'] },
  { id: 'alloys', name: 'Upgraded wheels', value: 0.012, appeal: ['young', 'enthusiast', 'bargain'] },
  { id: 'pano', name: 'Panoramic roof', value: 0.018, appeal: ['luxury', 'family'] },
  { id: 'adas', name: 'Driver assistance', value: 0.022, appeal: ['ev', 'business', 'senior'] },
  { id: 'hud', name: 'Head-up display', value: 0.014, appeal: ['business', 'prestige', 'ev'] },
  { id: 'matrix', name: 'Matrix LED lights', value: 0.014, appeal: ['luxury', 'enthusiast'] },
  { id: 'keyless', name: 'Keyless entry', value: 0.008, appeal: ['commuter', 'business'] },
  { id: 'heatpump', name: 'Heat pump', value: 0.015, appeal: ['ev'] },
  { id: 'offroad', name: 'Off-road pack', value: 0.02, appeal: ['suv'] },
];
export const OPTION_BY_NAME = Object.fromEntries(OPTIONS.map((o) => [o.name, o]));

export const INTERIORS: { name: string; luxury: number; value: number }[] = [
  { name: 'Black cloth', luxury: 0, value: 0 },
  { name: 'Grey cloth', luxury: 0, value: 0 },
  { name: 'Black leather', luxury: 0.5, value: 0.01 },
  { name: 'Beige leather', luxury: 0.55, value: 0.01 },
  { name: 'Red leather', luxury: 0.6, value: 0.008 },
  { name: 'Alcantara sport', luxury: 0.6, value: 0.012 },
  { name: 'Tan Nappa', luxury: 0.9, value: 0.02 },
];
export const INTERIOR_BY_NAME = Object.fromEntries(INTERIORS.map((i) => [i.name, i]));

/** What drives which wheels, from the body, category and engine. */
export function drivetrainOf(body: BodyType, category: Category, engine: string, pick: number): Drivetrain {
  if (/4x4/.test(engine) || body === 'Offroader' || category === 'Offroad') return '4x4';
  if (/AWD|Dual|Tri-motor|quattro/i.test(engine)) return 'AWD';
  if (body === 'Pickup') return pick < 0.7 ? '4x4' : 'RWD';
  if (body === 'SUV') return pick < (category === 'Premium' || category === 'Luxury' ? 0.8 : 0.45) ? 'AWD' : 'FWD';
  if (category === 'Performance') return pick < 0.5 ? 'AWD' : 'RWD';
  if (category === 'Sport' || body === 'Roadster' || category === 'Classic' || category === 'Rare') return 'RWD';
  if (category === 'Luxury') return pick < 0.5 ? 'AWD' : 'RWD';
  if (body === 'Van' || category === 'Commercial') return pick < 0.6 ? 'FWD' : 'RWD';
  return pick < 0.08 ? 'AWD' : 'FWD';
}

export const COLORS: { name: string; hex: string; appeal: number }[] = [
  { name: 'Obsidian Black', hex: '#15171b', appeal: 1.02 },
  { name: 'Glacier White', hex: '#e9ecef', appeal: 1.03 },
  { name: 'Graphite Grey', hex: '#4b5059', appeal: 1.01 },
  { name: 'Silver Frost', hex: '#aeb4bc', appeal: 1.0 },
  { name: 'Deep Ocean Blue', hex: '#1f3b73', appeal: 1.0 },
  { name: 'Racing Red', hex: '#b3202a', appeal: 0.99 },
  { name: 'British Green', hex: '#1f4d3a', appeal: 0.97 },
  { name: 'Sunset Orange', hex: '#d9661f', appeal: 0.95 },
  { name: 'Champagne', hex: '#c7b28a', appeal: 0.96 },
  { name: 'Lime Yellow', hex: '#c6d12b', appeal: 0.9 },
  { name: 'Burgundy', hex: '#5e1a26', appeal: 0.97 },
  { name: 'Brown Metallic', hex: '#5a4332', appeal: 0.93 },
];

export const CATEGORIES: Category[] = ['Economy', 'Compact', 'Family', 'SUV', 'Offroad', 'Luxury', 'Premium', 'Sport', 'Performance', 'Electric', 'Van', 'Commercial', 'Classic', 'Rare'];
export const FUELS: FuelType[] = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
export const BODIES: BodyType[] = ['Hatchback', 'Sedan', 'Wagon', 'SUV', 'Crossover', 'Offroader', 'Coupe', 'Convertible', 'Van', 'Pickup', 'Roadster'];
