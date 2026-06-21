/**
 * geo.ts — best-effort geography detection from a free-text job location, used
 * to enforce the user's country/location filters strictly.
 *
 * ATS feeds put location in wildly different shapes: "London, England, United
 * Kingdom", "San Francisco, CA", "Remote (US)", "São Paulo, Brazil", "Remote -
 * EMEA", "Bengaluru, India", or just "". We resolve each to a set of ISO country
 * codes and/or region tags so the aggregator can answer: "does this job belong
 * to the country the user selected?"
 *
 * Detection priority (so explicit signals beat guesses):
 *   1. Explicit country names / aliases  (e.g. "united kingdom", "usa")
 *   2. Short country code words           (e.g. "\bUK\b", "\bUS\b")
 *   3. State / province codes after comma (e.g. ", CA" → US, ", ON" → Canada)
 *   4. Major-city guess — ONLY if 1-3 found nothing (e.g. "London" → gb)
 * Region words ("Europe", "EMEA", "APAC", "Worldwide") are always collected.
 */

export interface GeoMatch {
  countries: Set<string>;
  regions: Set<string>;
}

/** Region tag → member ISO country codes (used to resolve "Remote, Europe" etc.). */
const REGION_MEMBERS: Record<string, string[]> = {
  europe: ["gb", "ie", "de", "fr", "es", "it", "nl", "se", "pt", "pl", "ch", "at", "be", "dk", "fi", "no"],
  emea: ["gb", "ie", "de", "fr", "es", "it", "nl", "se", "pt", "pl", "ch", "at", "be", "dk", "fi", "no", "ae", "za"],
  "north america": ["us", "ca", "mx"],
  apac: ["in", "sg", "au", "jp", "cn", "ph", "hk", "kr", "nz"],
  asia: ["in", "sg", "jp", "cn", "ph", "hk", "kr"],
  latam: ["br", "mx", "ar", "cl", "co", "pe"],
};

const REGION_PATTERNS: [string, RegExp][] = [
  ["europe", /\b(europe|european union|\beu\b|eea)\b/],
  ["emea", /\bemea\b/],
  ["north america", /\b(north america|namer)\b/],
  ["apac", /\b(apac|asia[\s-]?pacific)\b/],
  ["asia", /\basia\b/],
  ["latam", /\b(latam|latin america)\b/],
];

/** "Open anywhere" markers → matches every country. */
const GLOBAL_PATTERN = /\b(anywhere|worldwide|world wide|fully distributed|global remote|remote, global|remote \(global\))\b/;

/** Country full-name / alias substrings (lowercased). */
const COUNTRY_NAMES: [string, string[]][] = [
  ["us", ["united states", "u.s.a", "u.s.", "usa", "america"]],
  ["gb", ["united kingdom", "england", "scotland", "northern ireland", "great britain", "britain", "u.k."]],
  ["ca", ["canada"]],
  ["au", ["australia"]],
  ["in", ["india"]],
  ["sg", ["singapore"]],
  ["de", ["germany", "deutschland"]],
  ["fr", ["france"]],
  ["es", ["spain", "españa"]],
  ["it", ["italy", "italia"]],
  ["nl", ["netherlands", "the netherlands", "holland"]],
  ["ie", ["ireland"]],
  ["se", ["sweden"]],
  ["pt", ["portugal"]],
  ["pl", ["poland"]],
  ["ch", ["switzerland"]],
  ["at", ["austria"]],
  ["be", ["belgium"]],
  ["dk", ["denmark"]],
  ["fi", ["finland"]],
  ["no", ["norway"]],
  ["br", ["brazil", "brasil"]],
  ["mx", ["mexico", "méxico"]],
  ["jp", ["japan"]],
  ["cn", ["china"]],
  ["ae", ["united arab emirates", "uae"]],
  ["za", ["south africa"]],
  ["ph", ["philippines"]],
  ["pk", ["pakistan"]],
  ["ng", ["nigeria"]],
  ["ar", ["argentina"]],
  ["cl", ["chile"]],
  ["co", ["colombia"]],
  ["nz", ["new zealand"]],
  ["cr", ["costa rica"]],
  ["uy", ["uruguay"]],
  ["pe", ["peru", "perú"]],
  ["cz", ["czech republic", "czechia"]],
  ["ro", ["romania"]],
  ["gr", ["greece"]],
  ["tr", ["turkey", "türkiye"]],
  ["il", ["israel"]],
  ["ua", ["ukraine"]],
  ["my", ["malaysia"]],
  ["id", ["indonesia"]],
  ["th", ["thailand"]],
  ["vn", ["vietnam"]],
  ["hk", ["hong kong"]],
  ["kr", ["south korea"]],
  ["eg", ["egypt"]],
  ["ke", ["kenya"]],
];

/** Short country code words, matched with word boundaries. */
const COUNTRY_CODE_WORDS: [string, RegExp][] = [
  ["us", /\bus\b/],
  ["gb", /\b(uk|gb)\b/],
  ["ca", /\bcan\b/],
  ["ae", /\buae\b/],
  ["in", /\bind\b/],
];

const US_STATES = new Set([
  "al", "ak", "az", "ar", "ca", "co", "ct", "de", "fl", "ga", "hi", "id", "il", "in", "ia", "ks",
  "ky", "la", "me", "md", "ma", "mi", "mn", "ms", "mo", "mt", "ne", "nv", "nh", "nj", "nm", "ny",
  "nc", "nd", "oh", "ok", "or", "pa", "ri", "sc", "sd", "tn", "tx", "ut", "vt", "va", "wa", "wv",
  "wi", "wy", "dc",
]);

const CA_PROVINCES = new Set(["on", "qc", "bc", "ab", "mb", "sk", "ns", "nb", "pe", "nt", "yt", "nu"]);
const AU_STATES = new Set(["nsw", "vic", "qld", "wa", "sa", "tas", "act", "nt"]);

/** Major-city → country, used only as a last-resort guess. */
const CITY_COUNTRY: [string, string][] = [
  // UK
  ["london", "gb"], ["manchester", "gb"], ["birmingham", "gb"], ["edinburgh", "gb"], ["glasgow", "gb"],
  ["leeds", "gb"], ["bristol", "gb"], ["cambridge", "gb"], ["oxford", "gb"], ["brighton", "gb"],
  ["liverpool", "gb"], ["sheffield", "gb"], ["cardiff", "gb"], ["belfast", "gb"], ["reading", "gb"],
  // US
  ["new york", "us"], ["san francisco", "us"], ["los angeles", "us"], ["seattle", "us"], ["austin", "us"],
  ["boston", "us"], ["chicago", "us"], ["denver", "us"], ["atlanta", "us"], ["miami", "us"], ["dallas", "us"],
  ["houston", "us"], ["washington", "us"], ["portland", "us"], ["san diego", "us"], ["san jose", "us"],
  ["mountain view", "us"], ["palo alto", "us"], ["menlo park", "us"], ["sunnyvale", "us"], ["brooklyn", "us"],
  // Canada
  ["toronto", "ca"], ["vancouver", "ca"], ["montreal", "ca"], ["ottawa", "ca"], ["calgary", "ca"], ["waterloo", "ca"],
  // Australia
  ["sydney", "au"], ["melbourne", "au"], ["brisbane", "au"], ["perth", "au"], ["canberra", "au"],
  // India
  ["bengaluru", "in"], ["bangalore", "in"], ["mumbai", "in"], ["delhi", "in"], ["hyderabad", "in"],
  ["pune", "in"], ["chennai", "in"], ["gurgaon", "in"], ["gurugram", "in"], ["noida", "in"],
  // Germany / EU
  ["berlin", "de"], ["munich", "de"], ["münchen", "de"], ["hamburg", "de"], ["frankfurt", "de"],
  ["cologne", "de"], ["köln", "de"], ["düsseldorf", "de"], ["stuttgart", "de"],
  ["paris", "fr"], ["lyon", "fr"], ["marseille", "fr"], ["toulouse", "fr"],
  ["madrid", "es"], ["barcelona", "es"], ["valencia", "es"],
  ["amsterdam", "nl"], ["rotterdam", "nl"], ["utrecht", "nl"], ["eindhoven", "nl"],
  ["dublin", "ie"], ["cork", "ie"],
  ["stockholm", "se"], ["gothenburg", "se"],
  ["lisbon", "pt"], ["lisboa", "pt"], ["porto", "pt"],
  ["warsaw", "pl"], ["warszawa", "pl"], ["krakow", "pl"], ["kraków", "pl"], ["wroclaw", "pl"],
  ["zurich", "ch"], ["zürich", "ch"], ["geneva", "ch"], ["basel", "ch"], ["lausanne", "ch"],
  ["singapore", "sg"],
  // Latam / other (mainly to DETECT and exclude)
  ["são paulo", "br"], ["sao paulo", "br"], ["rio de janeiro", "br"], ["brasilia", "br"],
  ["mexico city", "mx"], ["guadalajara", "mx"],
  ["tokyo", "jp"], ["osaka", "jp"],
  ["dubai", "ae"], ["abu dhabi", "ae"],
];

/** Detect every country/region a location string refers to. */
export function detectGeo(location: string): GeoMatch {
  const countries = new Set<string>();
  const regions = new Set<string>();
  const low = ` ${location.toLowerCase()} `;

  if (GLOBAL_PATTERN.test(low)) regions.add("global");
  for (const [tag, re] of REGION_PATTERNS) if (re.test(low)) regions.add(tag);

  // 1. explicit country names
  for (const [code, names] of COUNTRY_NAMES) {
    if (names.some((n) => low.includes(n))) countries.add(code);
  }
  // 2. short code words
  for (const [code, re] of COUNTRY_CODE_WORDS) if (re.test(low)) countries.add(code);
  // 3. state / province codes after a comma
  for (const m of low.matchAll(/,\s*([a-z]{2,3})\b/g)) {
    const code = m[1];
    if (US_STATES.has(code)) countries.add("us");
    else if (CA_PROVINCES.has(code)) countries.add("ca");
    else if (AU_STATES.has(code)) countries.add("au");
  }
  // 4. city guess — only when nothing explicit matched
  if (countries.size === 0) {
    for (const [city, code] of CITY_COUNTRY) {
      if (low.includes(city)) countries.add(code);
    }
  }

  return { countries, regions };
}

/**
 * Does a location belong to the selected country?
 *   true   → yes (country or a region containing it)
 *   false  → no (resolves to a different country/region)
 *   null   → ambiguous (no detectable geo) — caller decides
 */
export function matchesCountry(location: string, selected: string): boolean | null {
  const sel = selected.toLowerCase() === "uk" ? "gb" : selected.toLowerCase();
  const geo = detectGeo(location);
  if (geo.regions.has("global")) return true;
  if (geo.countries.size === 0 && geo.regions.size === 0) return null;
  if (geo.countries.has(sel)) return true;
  for (const r of geo.regions) if (REGION_MEMBERS[r]?.includes(sel)) return true;
  return false;
}

/** Is the typed text itself a country name/code (vs a city)? Used to decide
 *  whether a typed-location filter should require a city-substring match. */
export function isCountryName(text: string): boolean {
  const low = ` ${text.toLowerCase()} `;
  for (const [, names] of COUNTRY_NAMES) if (names.some((n) => low.includes(n))) return true;
  for (const [, re] of COUNTRY_CODE_WORDS) if (re.test(low)) return true;
  return false;
}

/** True when a location reads as remote (with or without a geo qualifier). */
export function looksRemote(location: string): boolean {
  return /\bremote\b|work from home|\bwfh\b|distributed/.test(location.toLowerCase());
}
