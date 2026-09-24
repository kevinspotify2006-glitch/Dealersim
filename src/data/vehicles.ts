// Fictional automotive ecosystem. All brands and models are invented.
import { BodyType, Category, FuelType, Manufacturer, ModelSpec } from '../sim/types';

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
];

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

export const OPTIONS: { id: string; name: string; value: number; appeal: string[] }[] = [
  { id: 'leather', name: 'Leather', value: 0.025, appeal: ['luxury', 'business'] },
  { id: 'sunroof', name: 'Sunroof', value: 0.012, appeal: ['young', 'family'] },
  { id: 'nav', name: 'Navigation', value: 0.012, appeal: ['business', 'commuter'] },
  { id: 'audio', name: 'Premium audio', value: 0.015, appeal: ['young', 'enthusiast'] },
  { id: 'heated', name: 'Heated seats', value: 0.012, appeal: ['family', 'commuter'] },
  { id: 'acc', name: 'Adaptive cruise', value: 0.02, appeal: ['business', 'commuter'] },
  { id: 'sport', name: 'Sport package', value: 0.03, appeal: ['enthusiast', 'young'] },
  { id: 'tow', name: 'Tow bar', value: 0.01, appeal: ['family', 'suv'] },
  { id: 'pdc', name: 'Parking sensors', value: 0.008, appeal: ['firsttime', 'family'] },
  { id: 'camera', name: 'Rear camera', value: 0.01, appeal: ['family', 'firsttime'] },
  { id: 'alloys', name: 'Alloy wheels', value: 0.012, appeal: ['young', 'enthusiast'] },
  { id: 'pano', name: 'Panoramic roof', value: 0.018, appeal: ['luxury', 'family'] },
  { id: 'adas', name: 'Driver assistance', value: 0.022, appeal: ['ev', 'business'] },
];

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

export const CATEGORIES: Category[] = ['Economy', 'Compact', 'Family', 'SUV', 'Luxury', 'Premium', 'Sport', 'Performance', 'Electric', 'Van', 'Classic', 'Rare'];
export const FUELS: FuelType[] = ['Petrol', 'Diesel', 'Hybrid', 'Electric'];
export const BODIES: BodyType[] = ['Hatchback', 'Sedan', 'Wagon', 'SUV', 'Crossover', 'Coupe', 'Convertible', 'Van', 'Pickup', 'Roadster'];
