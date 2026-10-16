export const clip = (value: unknown, max: number) => {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return text.slice(0, Math.max(0, max - 1)).trimEnd() + '…';
};

export const normalizeText = (value: unknown) =>
  String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

const normalizeComparableIncidentText = (value: unknown) =>
  normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const isSubstantiveIncidentContext = (
  title: unknown,
  context: unknown
) => {
  const headline = normalizeComparableIncidentText(title);
  const detail = normalizeComparableIncidentText(context);
  if (!headline || !detail) return false;
  if (detail === headline) return false;

  const tokens = detail.split(' ').filter(Boolean);
  if (detail.length < 80 || tokens.length < 10) return false;

  const headlineTokens = new Set(headline.split(' ').filter(Boolean));
  const additionalTokens = new Set(
    tokens.filter((token) => !headlineTokens.has(token))
  );
  return additionalTokens.size >= 4;
};

const LEGAL_FOLLOW_UP_HEADLINE_RE =
  /(?:জামিন(?:\s+বাতিল)?|রিমান্ড|আদালত|শুনানি|চার্জশিট|চার্জ\s*শিট|অভিযোগপত্র|রায়|রায়|দণ্ড|সাজা|আপিল|বিচার\s+শুরু|সাক্ষ্যগ্রহণ|জবানবন্দি|স্বীকারোক্তি|দায়\s+স্বীকার|দায়\s+স্বীকার|\bbail\b|\bremand\b|\bcourt\b|\bhearing\b|charge\s*sheet|chargesheet|\bverdict\b|\bsentenced?\b|\bappeal\b|\btrial\b|\bconfess(?:ed|es|ion)?\b|\bconfession\b|\bplead(?:s|ed)?\s+guilty\b)/iu;

const ENFORCEMENT_FOLLOW_UP_HEADLINE_RE =
  /(?:(?:ঘটনা|ঘটনার|ঘটনায়|ঘটনায়|মামলা|মামলার|মামলায়|মামলায়).{0,35}(?:গ্রেপ্তার|আটক)|(?:গ্রেপ্তার|আটক).{0,35}(?:ঘটনায়|ঘটনায়|মামলায়|মামলায়)|\b(?:arrested?|detained|held)\b.{0,45}\b(?:over|in connection with)\b.{0,80}\b(?:incident|case|robbery|snatching|theft|murder|kidnapping|rape)\b)/iu;

export const isLegalFollowUpOnly = (
  title: unknown,
  _context?: unknown
) => {
  const normalized=normalizeText(title);
  return LEGAL_FOLLOW_UP_HEADLINE_RE.test(normalized)
    || ENFORCEMENT_FOLLOW_UP_HEADLINE_RE.test(normalized);
};

const MULTI_INCIDENT_ARTICLE_RE =
  /(?:(?:পৃথক|আলাদা)\s*(?:দুই|দুটি|তিন|তিনটি|একাধিক)?\s*(?:সড়ক|সড়ক)?\s*(?:দুর্ঘটনা|ঘটনা|হামলা|ছিনতাই|ডাকাতি|অগ্নিকাণ্ড)|(?:দুই|দুটি|তিন|তিনটি|একাধিক)\s*(?:পৃথক|আলাদা)\s*(?:সড়ক|সড়ক)?\s*(?:দুর্ঘটনা|ঘটনা|হামলা|ছিনতাই|ডাকাতি|অগ্নিকাণ্ড)|(?:দুই|দুটি|একাধিক)\s*(?:স্থানে|এলাকায়|এলাকায়).{0,80}(?:দুর্ঘটনা|ঘটনা|হামলা|ছিনতাই|ডাকাতি)|(?:two|three|multiple|several)\s+separate\s+(?:road\s+)?(?:accidents?|incidents?|attacks?|robberies|snatchings?|fires?)|separate\s+(?:road\s+)?(?:accidents?|incidents?|attacks?|robberies|snatchings?|fires?).{0,60}(?:two|three|multiple|several))/iu;

export const isMultiIncidentArticle = (
  title: unknown,
  context?: unknown
) => MULTI_INCIDENT_ARTICLE_RE.test(
  `${normalizeText(title)} ${normalizeText(context)}`
);


const FACT_CHECK_STORY_RE =
  /(?:বলে\s+প্রচার|দাবিটি\s+সত্য\s+নয়|দাবিটি\s+সত্য\s+নয়|ভুয়া\s+দাবি|ভুয়া\s+দাবি|ফ্যাক্ট\s*চেক|তথ্য\s+যাচাই|যাচাই\s+করে\s+দেখা\s+গেছে|মিথ্যা\s+দাবি|ভুল\s+তথ্য|\bfact[- ]?check\b|\bfalse\s+claim\b|\bmisinformation\b|\bmisleading\s+claim\b|\bdebunk(?:ed|ing)?\b)/iu;

export const isFactCheckOrMisinformationStory = (
  title: unknown,
  context?: unknown
) => FACT_CHECK_STORY_RE.test(
  `${normalizeText(title)} ${normalizeText(context)}`
);


export const buildIncidentFocusedLocationText = (article: {
  title?: string;
  excerpt?: string;
  body?: string;
}) => {
  const title=String(article.title||'').trim();
  const excerpt=String(article.excerpt||'').trim();
  const body=String(article.body||'').trim();
  const full=`${title}. ${excerpt}. ${body}`;
  const sentences=full
    .split(/(?<=[.!?।])\s+|\n+/u)
    .map((value)=>value.trim())
    .filter((value)=>value.length>=20 && value.length<=700);

  const incidentAnchor=
    /(এ ঘটনা|এই ঘটনা|ঘটনাটি|দুর্ঘটনা(?:টি|য়|য়)?|সংঘর্ষ|হামলা|ধর্ষণ|ছিনতাই|ডাকাতি|অপহরণ|আগুন|ঘটে|ঘটেছে|ঘটেছিল|নিহত|আহত|incident|accident|collision|crash|attack|rape|robbery|snatching|kidnap|fire|occurred|happened|killed|injured)/iu;
  const transferOrResidenceOnly=
    /(হাসপাতালে|হাসপাতাল|চিকিৎসার জন্য|নেওয়া হয়|নেয়া হয়|স্থানান্তর|বাসিন্দা|বাড়ি|বাড়ি|গ্রামের বাসিন্দা|hospital|medical college|transferred|referred|taken to|resident of|lives in|home in)/iu;

  const anchored=sentences.filter((sentence)=>incidentAnchor.test(sentence));
  const incidentOnly=anchored.filter((sentence)=>!transferOrResidenceOnly.test(sentence));
  const selected=(incidentOnly.length>0 ? incidentOnly : anchored).slice(0,6);

  return clip(`${title} ${selected.join(' ') || excerpt}`,7000);
};

export const detectLanguage = (value: unknown) => {
  const text = String(value ?? '');
  const bn = (text.match(/[\u0980-\u09FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (bn > latin * 1.5 && bn > 8) return 'bn';
  if (latin > bn * 1.5 && latin > 8) return 'en';
  if (bn > 8 && latin > 8) return 'mixed';
  return 'unknown';
};

export const MAX_ARTICLE_AGE_DAYS = 7;

export const isUnsupportedArticleType = (url: string, title: string) => {
  let path = '';
  try {
    path = new URL(url).pathname.toLowerCase();
  } catch {}
  const text = normalizeText(title);
  return /(\/opinion(?:\/|$)|\/editorials?(?:\/|$)|\/analysis(?:\/|$)|\/features?(?:\/|$)|\/lifestyle(?:\/|$)|\/sports?(?:\/|$)|\/cricket(?:\/|$)|\/entertainment(?:\/|$)|\/photo(?:\/|$)|\/videos?(?:\/|$)|\/m\/video(?:\/|$)|\/multimedia(?:\/|$)|\/star-multimedia(?:\/|$))/i.test(path)
    || /(সম্পাদকীয়|মতামত|বিশ্লেষণ|কলাম|ফিচার|opinion|editorial|analysis|feature)/iu.test(text);
};

export const articleAgeDays = (publishedDate?: string | null) => {
  if (!publishedDate) return null;
  const published = new Date(`${publishedDate}T00:00:00Z`);
  if (Number.isNaN(published.getTime())) return null;
  return Math.floor((Date.now() - published.getTime()) / 86400000);
};

// Some Banglanews article templates expose neither Article JSON-LD nor a semantic
// <article> wrapper even though the URL is a stable final-detail article path.
// Keep this fallback publisher-specific so section/index pages do not become
// eligible merely because they have an OpenGraph title.
export const isKnownPublisherArticlePath = (value: unknown) => {
  try {
    const url=new URL(String(value||''));
    const host=url.hostname.toLowerCase().replace(/^www\./,'');
    const path=url.pathname.toLowerCase();
    return host==='banglanews24.com'
      && /\/news\/bd\/\d+\.details\/?$/.test(path);
  } catch {
    return false;
  }
};

export type Classification = {
  segmentId: string;
  subcategoryId: string;
  confidence: number;
  /**
   * When present, the rule identified a likely category but the wording is
   * ambiguous enough that automation must stop before draft creation.
   */
  reviewReason?: string;
};

const CHILD_ABDUCTION_RE = /(?:(?:শিশু|বালক|বালিকা|কিশোর|কিশোরী|নাবালক|নাবালিকা|\bminor\b|\bchild\b|\bboy\b|\bgirl\b).{0,100}(?:অপহরণ|অপহৃত|kidnap(?:ped|ping)?|abduct(?:ed|ion)?)|(?:অপহরণ|অপহৃত|kidnap(?:ped|ping)?|abduct(?:ed|ion)?).{0,100}(?:শিশু|বালক|বালিকা|কিশোর|কিশোরী|নাবালক|নাবালিকা|\bminor\b|\bchild\b|\bboy\b|\bgirl\b))/iu;
const CHILD_MURDER_RE = /(?:(?:শিশু|বালক|বালিকা|কিশোর|কিশোরী|নাবালক|নাবালিকা|\bminor\b|\bchild\b|\bboy\b|\bgirl\b).{0,100}(?:হত্যা|খুন|murder(?:ed)?|homicide)|(?:হত্যা|খুন|murder(?:ed)?|homicide).{0,100}(?:শিশু|বালক|বালিকা|কিশোর|কিশোরী|নাবালক|নাবালিকা|\bminor\b|\bchild\b|\bboy\b|\bgirl\b))/iu;
const CHILD_MURDER_ATTEMPT_RE = /(?:হত্যাচেষ্টা|হত্যার\s*চেষ্টা|খুনের\s*চেষ্টা|attempt(?:ed)?\s+murder|attempt(?:ed)?\s+to\s+kill)/iu;
const CHILD_MURDER_COMPLETION_RE = /(?:নিহত|মৃত্যু|মারা\s+(?:গেছে|যায়|যায়)|\bdead\b|\bdied\b|\bdies\b|\bkilled\b)/iu;

const isChildMurderAttemptOnly = (value: unknown) => {
  const text = normalizeText(value);
  return CHILD_MURDER_ATTEMPT_RE.test(text)
    && !CHILD_ABDUCTION_RE.test(text)
    && !CHILD_MURDER_COMPLETION_RE.test(text);
};

const CHILD_ABDUCTION_NEGATION_RE =
  /(?:no\s+(?:child\s+)?(?:abduction|kidnapping)|not\s+(?:abducted|kidnapped)|abduction\s+(?:was\s+)?not\s+reported|kidnapping\s+(?:was\s+)?not\s+reported|অপহরণ\s*(?:হয়নি|হয়নি|ঘটেনি|নয়|নয়)|অপহৃত\s*(?:হয়নি|হয়নি))/iu;
const CHILD_MURDER_NEGATION_RE =
  /(?:no\s+(?:child\s+)?(?:murder|killing|death)|not\s+(?:murdered|killed)|murder\s+(?:was\s+)?not\s+reported|death\s+(?:was\s+)?not\s+reported|হত্যা\s*(?:হয়নি|হয়নি|ঘটেনি|নয়|নয়)|খুন\s*(?:হয়নি|হয়নি|ঘটেনি|নয়|নয়)|নিহত\s*(?:হয়নি|হয়নি)|মৃত্যু\s*(?:হয়নি|হয়নি))/iu;
const CHILD_DEATH_NEGATION_RE =
  /(?:no\s+death|did\s+not\s+die|not\s+killed|death\s+(?:was\s+)?not\s+reported|মৃত্যু\s*(?:হয়নি|হয়নি)|নিহত\s*(?:হয়নি|হয়নি))/iu;

export const inferChildIncidentType = (value: unknown) => {
  const text = normalizeText(value);
  const sentences = text
    .split(/(?<=[.!?।])\s+/)
    .map((sentence)=>sentence.trim())
    .filter(Boolean);

  const hasAbduction = sentences.some(
    (sentence)=>CHILD_ABDUCTION_RE.test(sentence) && !CHILD_ABDUCTION_NEGATION_RE.test(sentence)
  );

  const murderEvidence = sentences.filter(
    (sentence)=>CHILD_MURDER_RE.test(sentence) && !CHILD_MURDER_NEGATION_RE.test(sentence)
  );
  const directMurder = murderEvidence.some(
    (sentence)=>!isChildMurderAttemptOnly(sentence)
  );
  const attemptedMurderWithReportedDeath =
    murderEvidence.some((sentence)=>CHILD_MURDER_ATTEMPT_RE.test(sentence))
    && sentences.some(
      (sentence)=>CHILD_MURDER_COMPLETION_RE.test(sentence) && !CHILD_DEATH_NEGATION_RE.test(sentence)
    );
  const hasMurder = directMurder || attemptedMurderWithReportedDeath;

  if (hasAbduction && hasMurder) return 'abduction_and_murder';
  if (hasAbduction) return 'abduction';
  if (hasMurder) return 'murder';
  return 'unknown_not_stated';
};

const RIDE_SHARING_CONTEXT_RE =
  /(?:\buber\b|\bpathao\b|\bobhai\b|ride[-\s]?sharing|rideshare|ride[-\s]?hailing|রাইড[\s-]*শেয়ারিং|রাইড[\s-]*শেয়ারিং|রাইডশেয়ারিং|রাইডশেয়ারিং|উবার|পাঠাও|ওভাই)/iu;
const RIDE_SHARING_SAFETY_INCIDENT_RE =
  /(?:যৌন\s*(?:হয়রানি|হয়রানি)|হয়রানি|হয়রানি|শ্লীলতাহানি|অশালীন\s*আচরণ|হুমকি|মারধর|আক্রমণ|হামলা|লাঞ্ছিত|চুরি|ডাকাতি|ছিনতাই|অপহরণ|ভুল\s*পথে|অন্য\s*পথে|রুট\s*(?:পরিবর্তন|বদল)|পথ\s*(?:পরিবর্তন|বদল)|বেপরোয়া|বেপরোয়া|ঝুঁকিপূর্ণ\s*চালনা|জোর(?:পূর্বক|\s*করে).{0,30}(?:টাকা|ভাড়া|ভাড়া)|(?:চালক|ড্রাইভার|গাড়ি|গাড়ি|যানবাহন).{0,40}(?:অমিল|মিল(?:েনি|েনি)|ভিন্ন)|sexual\s+harassment|harass(?:ed|ment)?|molest(?:ed|ation)?|inappropriate\s+behavio(?:u)?r|threat(?:en(?:ed|ing)?)?|assault(?:ed)?|attack(?:ed)?|robbery|robbed|theft|stolen|snatch(?:ed|ing)?|mugg(?:ed|ing)|kidnap(?:ped|ping)?|abduct(?:ed|ion)?|off[-\s]?route|wrong\s+route|route\s+deviation|deviat(?:ed|ion).{0,20}route|reckless\s+driv(?:ing|er)|dangerous\s+driv(?:ing|er)|unsafe\s+driv(?:ing|er)|forced\s+(?:payment|fare)|coercive\s+fare|driver.{0,30}mismatch|vehicle.{0,30}mismatch)/iu;

export const inferRideSharingPlatform = (value: unknown) => {
  const text=normalizeText(value);
  if(/(?:\buber\b|উবার)/iu.test(text)) return 'uber';
  if(/(?:\bpathao\b|পাঠাও)/iu.test(text)) return 'pathao';
  if(/(?:\bobhai\b|ওভাই)/iu.test(text)) return 'obhai';
  if(RIDE_SHARING_CONTEXT_RE.test(text)) return 'other';
  return 'unknown_not_stated';
};

export const inferRideSharingIncidentType = (value: unknown) => {
  const text=normalizeText(value);
  if(/(?:যৌন\s*(?:হয়রানি|হয়রানি)|শ্লীলতাহানি|sexual\s+harassment|molest(?:ed|ation)?)/iu.test(text)) return 'sexual_harassment';
  if(/(?:হয়রানি|হয়রানি|অশালীন\s*আচরণ|harass(?:ed|ment)?|inappropriate\s+behavio(?:u)?r)/iu.test(text)) return 'harassment';
  if(/(?:চুরি|ডাকাতি|ছিনতাই|robbery|robbed|theft|stolen|snatch(?:ed|ing)?|mugg(?:ed|ing))/iu.test(text)) return 'theft_robbery';
  if(/(?:ভুল\s*পথে|অন্য\s*পথে|রুট\s*(?:পরিবর্তন|বদল)|পথ\s*(?:পরিবর্তন|বদল)|off[-\s]?route|wrong\s+route|route\s+deviation|deviat(?:ed|ion).{0,20}route)/iu.test(text)) return 'route_deviation';
  if(/(?:(?:চালক|ড্রাইভার|গাড়ি|গাড়ি|যানবাহন).{0,40}(?:অমিল|মিল(?:েনি|েনি)|ভিন্ন)|driver.{0,30}mismatch|vehicle.{0,30}mismatch)/iu.test(text)) return 'driver_vehicle_mismatch';
  if(/(?:বেপরোয়া|বেপরোয়া|ঝুঁকিপূর্ণ\s*চালনা|reckless\s+driv(?:ing|er)|dangerous\s+driv(?:ing|er)|unsafe\s+driv(?:ing|er))/iu.test(text)) return 'unsafe_driving';
  if(/(?:জোর(?:পূর্বক|\s*করে).{0,30}(?:টাকা|ভাড়া|ভাড়া)|forced\s+(?:payment|fare)|coercive\s+fare)/iu.test(text)) return 'forced_payment';
  if(/(?:হুমকি|মারধর|আক্রমণ|হামলা|লাঞ্ছিত|অপহরণ|threat(?:en(?:ed|ing)?)?|assault(?:ed)?|attack(?:ed)?|kidnap(?:ped|ping)?|abduct(?:ed|ion)?)/iu.test(text)) return 'threat_assault';
  return 'other_safety_incident';
};

export const inferRideSharingVehicleType = (value: unknown) => {
  const text=normalizeText(value);
  if(/(?:মোটরসাইকেল|মোটর বাইক|বাইক|motorcycle|motorbike|\bbike\b)/iu.test(text)) return 'motorcycle';
  if(/(?:সিএনজি|অটোরিকশা|cng|auto[-\s]?rickshaw)/iu.test(text)) return 'cng_auto_rickshaw';
  if(/(?:গাড়ি|গাড়ি|প্রাইভেটকার|\bcar\b|sedan)/iu.test(text)) return 'car';
  return 'unknown_not_stated';
};

const isRideSharingSafetyIncident = (value: unknown) => {
  const text=normalizeText(value);
  return RIDE_SHARING_CONTEXT_RE.test(text) && RIDE_SHARING_SAFETY_INCIDENT_RE.test(text);
};

const ARTICLE_RULES: Array<[string, string, number, RegExp[]]> = [
  ['harassment','rape-sexual-violence',0.93,[/ধর্ষণ/u,/ধর্ষণের চেষ্টা/u,/\brap(?:e|ed|es|ing)\b/i,/attempted rape/i]],
  ['harassment','sexual-harassment',0.90,[/যৌন হয়রানি/u,/যৌন হয়রানি/u,/ইভ টিজিং/u,/শ্লীলতাহানি/u,/sexual harassment/i,/eve[- ]?teasing/i]],
  ['harassment','domestic-violence',0.88,[/পারিবারিক সহিংসতা/u,/গৃহবধূ.{0,30}(নির্যাতন|মারধর)/u,/স্ত্রীকে.{0,30}(মারধর|পিটিয়ে|পিটিয়ে|কুপিয়ে|কুপিয়ে)/u,/domestic violence/i,/wife.{0,40}(assault|beat|attack)/i]],
  ['harassment','blackmail-coercion',0.88,[/ব্ল্যাকমেইল/u,/জবরদস্তি.{0,30}(টাকা|অর্থ)/u,/blackmail/i,/\bcoercion\b/i]],
  ['harassment','honeytrap',0.92,[/হানিট্র্যাপ/u,/honey\s*trap/i,/honeytrap/i]],
  ['load_shedding','load-shedding-outage',0.86,[/লোডশেডিং/u,/বিদ্যুৎ বিভ্রাট/u,/power outage/i,/load shedding/i]],
  ['load_shedding','gas-shortage',0.88,[/গ্যাস সংকট/u,/গ্যাসের চাপ.{0,20}কম/u,/gas shortage/i,/low gas pressure/i]],
  ['load_shedding','excess-electricity-bill',0.90,[/অতিরিক্ত বিদ্যুৎ বিল/u,/ভুতুড়ে বিল/u,/ভুতুড়ে বিল/u,/excess electricity bill/i,/inflated electricity bill/i]],
  ['extortion','bribe-demanded-service',0.92,[/ঘুষ(?:\s*(?:চাওয়া|চাওয়া|চাই|চেয়েছে|চেয়েছে|দাবি|নেওয়া|নেওয়া|নিয়েছে|নিয়েছে|গ্রহণ)|ের\s*(?:দাবি|অভিযোগ))/u,/\bbribe\b/i,/bribery/i]],
  ['public_safety','mob-justice',0.94,[/গণপিটুনি/u,/মব সহিংসতা/u,/(চুরি|ছিনতাই|ডাকাতি|ছেলেধরা).{0,60}(অভিযোগ|সন্দেহ).{0,100}(পিটিয়ে|পিটুনি).{0,60}(হত্যা|নিহত)/u,/mob violence/i,/lynch/i,/beaten by a mob/i]],
  ['public_safety','child_abduction_murder',0.92,[CHILD_ABDUCTION_RE,CHILD_MURDER_RE]],
  ['public_safety','snatching',0.91,[/ছিনতাই/u,/পকেট.{0,24}(কাট|মার)/u,/(কাটছেন|কাটছে|কেটে|কাটে).{0,36}(রিকশাযাত্রীর|যাত্রীর|পথচারীর).{0,24}পকেট/u,/snatching/i,/\bmugging\b/i,/pickpocket/i]],
  ['public_safety','robbery',0.90,[/ডাকাতি/u,/dacoity/i,/\brobbery\b/i]],
  ['public_safety','theft',0.88,[/চুরি/u,/\btheft\b/i,/\bstolen\b/i]],
  ['road_transport','road-accident',0.91,[/সড়ক দুর্ঘটনা/u,/সড়ক দুর্ঘটনা/u,/(ধাক্কায়|ধাক্কায়|চাপায়|চাপায়|চাপা পড়ে|চাপা পড়ে).{0,100}(নিহত|আহত)/u,/(বাস|ট্রাক|পিকআপ|মোটরসাইকেল|অটোরিকশা|গাড়ি|গাড়ি|মাইক্রোবাস).{0,70}(সংঘর্ষ|ধাক্কা|চাপা).{0,120}(নিহত|আহত)/u,/(নিয়ন্ত্রণ হারিয়ে|নিয়ন্ত্রণ হারিয়ে|lost control).{0,60}(বাস|ট্রাক|পিকআপ|মোটরসাইকেল|অটোরিকশা|গাড়ি|গাড়ি|মাইক্রোবাস|bus|truck|car|vehicle).{0,100}(পুকুর|খাল|খাদ|উল্টে|pond|canal|ditch|overturn).{0,120}(নিহত|আহত|লাশ|মৃত|dead|killed|injured)/iu,/(বাস|ট্রাক|পিকআপ|মোটরসাইকেল|অটোরিকশা|গাড়ি|গাড়ি|মাইক্রোবাস|bus|truck|car|vehicle).{0,80}(নিয়ন্ত্রণ হারিয়ে|নিয়ন্ত্রণ হারিয়ে|lost control).{0,100}(পুকুর|খাল|খাদ|উল্টে|pond|canal|ditch|overturn)/iu,/road accident/i,/road crash/i,/(collision|crash|hit by|run over).{0,100}(kill(?:s|ed)?|dead|injured)/i,/সড়কে.{0,40}(নিহত|আহত)/u]],
  ['road_transport','road-block',0.89,[/সড়ক অবরোধ/u,/সড়ক অবরোধ/u,/road blockade/i,/road blocked/i,/highway.{0,40}blocked/i]],
  ['road_transport','road-repair-delay',0.88,[/রাস্তা মেরামত.{0,40}(বিলম্ব|দেরি|বন্ধ)/u,/road repair.{0,40}(delay|stalled|unfinished)/i]],
  ['illegal_occupation','road-public-space-encroachment',0.90,[/(ফুটপাত|ফুটওভার ব্রিজ|রাস্তা).{0,25}দখল/u,/(footpath|road|public space).{0,35}encroach/i]],
  ['illegal_occupation','government-property-occupation',0.91,[/(সরকারি|খাস).{0,20}(জমি|সম্পত্তি).{0,30}দখল/u,/(government|public).{0,25}(land|property).{0,30}(occup|encroach)/i]],
  ['illegal_occupation','private-property-occupation',0.91,[/(ব্যক্তিগত|ব্যক্তিমালিকানাধীন).{0,20}(জমি|সম্পত্তি).{0,30}দখল/u,/private.{0,25}(land|property).{0,30}(occup|encroach)/i]],
  ['rickshaw','charging-station-location',0.92,[/(অবৈধ|illegal).{0,20}(অটো|রিকশা|auto.?rickshaw).{0,30}(চার্জ|charging)/iu,/অটো.?রিকশা.{0,30}চার্জিং স্টেশন/iu,/illegal auto.?rickshaw charging/i]],
];

const EXTORTION_RE = /(চাঁদাবাজি|চাঁদা\s*(দাবি|আদায়|আদায়)|চাঁদাবাজ|\bextortion\b)/iu;
const NON_INCIDENT_THEFT_RE = /(শ্রম\s*চুরি|মজুরি\s*চুরি|মেধা\s*চুরি|আইডিয়া\s*চুরি|আইডিয়া\s*চুরি|কনটেন্ট\s*চুরি|wage\s+theft|labor\s+theft|content\s+theft|idea\s+theft|intellectual\s+property\s+theft)/iu;
const NON_INCIDENT_GAS_RECOVERY_RE = /(গ্যাস\s*সংকটে\s*স্বস্তি|জাতীয়\s*গ্রিডে\s*যুক্ত\s*হলো|জাতীয়\s*গ্রিডে\s*যুক্ত\s*হলো|গ্যাস\s*সরবরাহ.{0,24}(বাড়ল|বাড়ল|বেড়েছে|বেড়েছে|উন্নতি)|gas\s+shortage.{0,24}(eases|improves)|gas\s+supply.{0,24}(improves|increases|restored))/iu;

export const hasPrimaryTheftHeadlineSignal = (value: unknown) => {
  const text=normalizeText(value);
  if (!text || NON_INCIDENT_THEFT_RE.test(text)) return false;
  return /(?:চুরি|চোরাই|চোর\b|\btheft\b|\bstolen\b|\bsteal(?:s|ing|er|ers)?\b)/iu.test(text);
};
// "ছিনতাই" is also used in Bangla for forcibly taking a detainee/person away.
// That is not a property-snatching report and must not fall through to the broad
// public-safety snatching keyword rule.
const NON_PROPERTY_SNATCHING_RE = /(পুলিশ(?:কে)?.{0,80}(আসামি|অভিযুক্ত|সন্দেহভাজন|মাদক\s*কারবারি|আটক).{0,80}ছিনতাই|(আসামি|অভিযুক্ত|সন্দেহভাজন|মাদক\s*কারবারি|আটক).{0,80}ছিনতাই.{0,80}(পুলিশ|থানা)|(?:suspect|detainee|accused|prisoner).{0,80}(?:snatched|taken).{0,80}(?:police|custody))/iu;

// Recovery of evidence or a stolen item during a different investigation is not
// itself a fresh theft incident. This protects investigation follow-up stories
// such as recovered phones/evidence from becoming standalone Theft reports.
const NON_INCIDENT_EVIDENCE_RECOVERY_RE =
  /(?:(?:police|detectives?|investigators?).{0,80}(?:recover(?:ed|s|ing)?|seize(?:d|s|ing)?).{0,120}(?:stolen|theft).{0,120}(?:suspect|detained|arrested|home|house)|(?:চুরি|চোরাই).{0,80}(?:ফোন|মোবাইল|মালামাল|সম্পদ).{0,100}(?:উদ্ধার|জব্দ).{0,100}(?:আটক|গ্রেপ্তার|বাড়ি|বাড়ি))/iu;

// These headlines announce a future programme/strike or a threat of one.
// Category words in the summary (e.g. "ডাকাতি বন্ধ") describe demands, not a
// reported incident and must not create a false incident report.
export const isNonIncidentHeadline = (value: unknown) => {
  const text = normalizeText(value);
  return /(?:ধর্মঘটের\s+হুঁশিয়ারি|ধর্মঘটের\s+হুঁশিয়ারি|ধর্মঘটের\s+ঘোষণা|কর্মসূচি\s+ঘোষণা|অনির্দিষ্টকালের\s+ধর্মঘট|strike\s+warning|threatens?\s+(?:an?\s+)?(?:indefinite\s+)?strike|announces?\s+(?:an?\s+)?strike|will\s+go\s+on\s+strike)/iu.test(text);
};
// Theft words can describe the allegation that triggered retaliatory/mob violence.
// For approved-news automation, classify the primary reported incident itself
// instead of creating an "ambiguous allegation" review state.
const THEFT_ALLEGATION_VIOLENCE_RE = /((?:চুরি(?:র)?[\s'’‘"“”\-–—]*(?:অপবাদ|সন্দেহ|অভিযোগ)|ভাত\s*চুরির[\s'’‘"“”\-–—]*অপবাদ|theft\s+(?:suspicion|allegation)|suspected\s+theft|stolen\s+(?:meal|food)).{0,160}(?:পিটিয়ে|পিটিয়ে|পিটুনি|মারধর|হত্যা|খুন|নিহত|assault(?:ed)?|beat(?:en)?|killed|dies|died|death)|(?:পিটিয়ে|পিটিয়ে|পিটুনি|মারধর|হত্যা|খুন|নিহত|assault(?:ed)?|beat(?:en)?|killed|dies|died|death).{0,160}(?:চুরি(?:র)?[\s'’‘"“”\-–—]*(?:অপবাদ|সন্দেহ|অভিযোগ)|theft\s+(?:suspicion|allegation)|stolen\s+(?:meal|food)))/iu;

export const classifyArticle = (value: unknown): Classification | null => {
  const text = normalizeText(value);
  if (
    NON_INCIDENT_THEFT_RE.test(text) ||
    NON_INCIDENT_GAS_RECOVERY_RE.test(text) ||
    NON_PROPERTY_SNATCHING_RE.test(text) ||
    NON_INCIDENT_EVIDENCE_RECOVERY_RE.test(text)
  ) return null;
  if (isRideSharingSafetyIncident(text)) {
    return {
      segmentId:'public_safety',
      subcategoryId:'ride_sharing_safety',
      confidence:0.95,
    };
  }
  if (THEFT_ALLEGATION_VIOLENCE_RE.test(text)) {
    return {
      segmentId:'public_safety',
      subcategoryId:'mob-justice',
      confidence:0.96,
    };
  }
  const childAttemptOnly = isChildMurderAttemptOnly(text);
  for (const [segmentId, subcategoryId, confidence, patterns] of ARTICLE_RULES) {
    if (subcategoryId === 'child_abduction_murder' && childAttemptOnly) continue;
    if (patterns.some((pattern) => pattern.test(text))) {
      return { segmentId, subcategoryId, confidence };
    }
  }
  if (EXTORTION_RE.test(text)) {
    if (/(বাস|ট্রাক|পরিবহন|স্ট্যান্ড|টার্মিনাল|চালক|driver|bus|truck|transport|terminal)/iu.test(text)) {
      return { segmentId:'extortion', subcategoryId:'transport-movement', confidence:0.91 };
    }
    if (/(নির্মাণ|ঠিকাদার|ভবন|জমি|property|construction|contractor)/iu.test(text)) {
      return { segmentId:'extortion', subcategoryId:'construction-property', confidence:0.90 };
    }
    if (/(দোকান|ব্যবসা|ব্যবসায়ী|ব্যবসায়ী|shop|business|trader|merchant)/iu.test(text)) {
      return { segmentId:'extortion', subcategoryId:'shop-business', confidence:0.90 };
    }
    if (/(হুমকি|প্রাণনাশ|threat|threaten)/iu.test(text)) {
      return { segmentId:'extortion', subcategoryId:'threat-money-demand', confidence:0.90 };
    }
    return { segmentId:'extortion', subcategoryId:'extortion-other', confidence:0.86 };
  }
  return null;
};

type DistrictEntry = [string, string[], string];

const DISTRICTS: DistrictEntry[] = [
  ['Dhaka',['ঢাকা','dhaka'],'Dhaka'],['Gazipur',['গাজীপুর','gazipur'],'Dhaka'],['Narayanganj',['নারায়ণগঞ্জ','নারায়ণগঞ্জ','narayanganj'],'Dhaka'],['Narsingdi',['নরসিংদী','narsingdi'],'Dhaka'],['Manikganj',['মানিকগঞ্জ','manikganj'],'Dhaka'],['Munshiganj',['মুন্সিগঞ্জ','munshiganj'],'Dhaka'],['Tangail',['টাঙ্গাইল','tangail'],'Dhaka'],['Kishoreganj',['কিশোরগঞ্জ','kishoreganj'],'Dhaka'],['Faridpur',['ফরিদপুর','faridpur'],'Dhaka'],['Gopalganj',['গোপালগঞ্জ','gopalganj'],'Dhaka'],['Madaripur',['মাদারীপুর','madaripur'],'Dhaka'],['Rajbari',['রাজবাড়ী','রাজবাড়ী','rajbari'],'Dhaka'],['Shariatpur',['শরীয়তপুর','শরীয়তপুর','shariatpur'],'Dhaka'],
  ['Chattogram',['চট্টগ্রাম','chattogram','chittagong'],'Chattogram'],["Coxs Bazar",['কক্সবাজার',"cox's bazar",'coxs bazar','cox bazar'],'Chattogram'],['Cumilla',['কুমিল্লা','cumilla','comilla'],'Chattogram'],['Feni',['ফেনী','feni'],'Chattogram'],['Noakhali',['নোয়াখালী','নোয়াখালী','noakhali'],'Chattogram'],['Lakshmipur',['লক্ষ্মীপুর','lakshmipur'],'Chattogram'],['Chandpur',['চাঁদপুর','chandpur'],'Chattogram'],['Brahmanbaria',['ব্রাহ্মণবাড়িয়া','ব্রাহ্মণবাড়িয়া','brahmanbaria'],'Chattogram'],['Khagrachhari',['খাগড়াছড়ি','খাগড়াছড়ি','khagrachhari','khagrachari'],'Chattogram'],['Rangamati',['রাঙামাটি','rangamati'],'Chattogram'],['Bandarban',['বান্দরবান','bandarban'],'Chattogram'],
  ['Rajshahi',['রাজশাহী','rajshahi'],'Rajshahi'],['Bogura',['বগুড়া','বগুড়া','bogura','bogra'],'Rajshahi'],['Pabna',['পাবনা','pabna'],'Rajshahi'],['Sirajganj',['সিরাজগঞ্জ','sirajganj'],'Rajshahi'],['Natore',['নাটোর','natore'],'Rajshahi'],['Naogaon',['নওগাঁ','naogaon'],'Rajshahi'],['Chapainawabganj',['চাঁপাইনবাবগঞ্জ','chapainawabganj','chapai nawabganj'],'Rajshahi'],['Joypurhat',['জয়পুরহাট','জয়পুরহাট','joypurhat'],'Rajshahi'],
  ['Khulna',['খুলনা','khulna'],'Khulna'],['Jashore',['যশোর','jashore','jessore'],'Khulna'],['Satkhira',['সাতক্ষীরা','satkhira'],'Khulna'],['Bagerhat',['বাগেরহাট','bagerhat'],'Khulna'],['Jhenaidah',['ঝিনাইদহ','jhenaidah'],'Khulna'],['Magura',['মাগুরা','magura'],'Khulna'],['Narail',['নড়াইল','নড়াইল','narail'],'Khulna'],['Kushtia',['কুষ্টিয়া','কুষ্টিয়া','kushtia'],'Khulna'],['Chuadanga',['চুয়াডাঙ্গা','চুয়াডাঙ্গা','chuadanga'],'Khulna'],['Meherpur',['মেহেরপুর','meherpur'],'Khulna'],
  ['Barishal',['বরিশাল','barishal','barisal'],'Barishal'],['Bhola',['ভোলা','bhola'],'Barishal'],['Patuakhali',['পটুয়াখালী','পটুয়াখালী','patuakhali'],'Barishal'],['Pirojpur',['পিরোজপুর','pirojpur'],'Barishal'],['Jhalokathi',['ঝালকাঠি','jhalokathi'],'Barishal'],['Barguna',['বরগুনা','barguna'],'Barishal'],
  ['Sylhet',['সিলেট','sylhet'],'Sylhet'],['Moulvibazar',['মৌলভীবাজার','moulvibazar','moulvi bazar'],'Sylhet'],['Habiganj',['হবিগঞ্জ','habiganj'],'Sylhet'],['Sunamganj',['সুনামগঞ্জ','sunamganj'],'Sylhet'],
  ['Rangpur',['রংপুর','rangpur'],'Rangpur'],['Dinajpur',['দিনাজপুর','dinajpur'],'Rangpur'],['Kurigram',['কুড়িগ্রাম','কুড়িগ্রাম','kurigram'],'Rangpur'],['Gaibandha',['গাইবান্ধা','gaibandha'],'Rangpur'],['Nilphamari',['নীলফামারী','nilphamari'],'Rangpur'],['Lalmonirhat',['লালমনিরহাট','lalmonirhat'],'Rangpur'],['Panchagarh',['পঞ্চগড়','পঞ্চগড়','panchagarh'],'Rangpur'],['Thakurgaon',['ঠাকুরগাঁও','thakurgaon'],'Rangpur'],
  ['Mymensingh',['ময়মনসিংহ','ময়মনসিংহ','mymensingh'],'Mymensingh'],['Jamalpur',['জামালপুর','jamalpur'],'Mymensingh'],['Netrokona',['নেত্রকোনা','netrokona'],'Mymensingh'],['Sherpur',['শেরপুর','sherpur'],'Mymensingh'],
];

const DISTRICT_CONTEXT_CUE_RE =
  /(জেলা|উপজেলা|থানা|এলাকা|কোটবাড়ি|কোটবাড়ি|শহর|নগরী|ঘটনাস্থল|ঘটেছে|ঘটে|সংঘর্ষ|অবরোধ|হত্যা|অপহরণ|ছিনতাই|ডাকাতি|চুরি|district|upazila|thana|area|city|incident|occurred|happened|crash|collision|blockade|murder|abduct|snatch|robbery|theft)/iu;

const highwayEndpointPenalty = (text: string, index: number, alias: string) => {
  const immediate=text.slice(
    Math.max(0,index-3),
    Math.min(text.length,index+alias.length+3)
  );
  if(!/[-–—]/u.test(immediate)) return false;

  const routeWindow=text.slice(
    Math.max(0,index-45),
    Math.min(text.length,index+alias.length+70)
  );
  return /(মহাসড়ক|মহাসড়ক|highway)/iu.test(routeWindow);
};

export const findLocation = (value: unknown) => {
  const text = normalizeText(value);
  if (
    /রাজধানী/u.test(text) &&
    !/(কুমিল্লা|cumilla|comilla).{0,120}(রাজধানী|ঢাকা)/iu.test(text)
  ) {
    return { division:'Dhaka', district:'Dhaka' };
  }

  let best: { division:string; district:string; score:number; index:number } | null = null;

  for (const [district,aliases,division] of DISTRICTS) {
    let score=0;
    let firstIndex=Number.POSITIVE_INFINITY;
    let occurrences=0;

    for (const aliasRaw of aliases) {
      const alias=aliasRaw.toLowerCase();
      let from=0;

      while(true){
        const index=text.indexOf(alias,from);
        if(index<0) break;

        occurrences+=1;
        firstIndex=Math.min(firstIndex,index);

        const before=text.slice(Math.max(0,index-80),index);
        const after=text.slice(index+alias.length,Math.min(text.length,index+alias.length+100));
        const local=before.slice(-45)+' '+alias+' '+after.slice(0,65);
        const labelWindow=before.slice(-18)+' '+after.slice(0,18);

        let mentionScore=3;
        if (DISTRICT_CONTEXT_CUE_RE.test(local)) mentionScore+=5;
        if (/(জেলা|district)/iu.test(labelWindow)) mentionScore+=6;
        if (highwayEndpointPenalty(text,index,alias)) mentionScore-=8;

        score+=mentionScore;
        from=index+alias.length;
      }
    }

    if(occurrences>1) score+=Math.min(6,(occurrences-1)*2);
    if(
      score>0 &&
      (!best || score>best.score || (score===best.score && firstIndex<best.index))
    ){
      best={division,district,score,index:firstIndex};
    }
  }

  return best ? {division:best.division,district:best.district} : null;
};

export const cleanSpecificLocationText = (value: unknown) =>
  String(value ?? '')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/^(?:the\s+)?(?:vehicle|car|bus|truck|motorcycle|rickshaw|auto[- ]?rickshaw|three[- ]?wheeler|battery|incident|altercation|victim|suspect|body|house|home)\s+(?:in|at|near)\s+/i,'')
    .replace(/\s+village\s+of\s+(.+?\s+union)$/i,' village, $1')
    .trim();

const compactLocationPhrase = (value: string) => {
  let candidate=value
    .replace(/[“”"'‘’()[\]{}]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/^(?:ঘটনাটি|ঘটনা|এ ঘটনা|এ ঘটনাটি|এই ঘটনা|এই ঘটনাটি|দুর্ঘটনাটি|হামলাটি)\s*(?:ঘটেছে|ঘটে|ঘটেছিল|সংঘটিত হয়েছে|সংঘটিত হয়েছিল)?\s*/u,'')
    .replace(/^(?:the\s+)?(?:incident|accident|attack)\s+(?:happened|occurred|took\s+place)(?:\s+(?:near|at|in|on))?\s+/i,'')
    .replace(/\b(?:happened|occurred|took\s+place)(?:\s+(?:near|at|in|on))?\s+/i,'');

  // Source sentences often carry an outcome or search narrative immediately
  // before the real place phrase. Keep what follows the last such cue.
  const narrativeCues=[
    /(?:সন্ধান\s+না\s+পেয়ে|সন্ধান\s+না\s+পেয়ে|খোঁজ\s+করেও)/gu,
    /(?:নিহত|আহত|উদ্ধার|গ্রেপ্তার|আটক|জানান|বলেন)/gu,
    /(?:was\s+killed|were\s+killed|was\s+injured|were\s+injured|was\s+rescued|were\s+rescued|arrested|detained)/giu,
  ];
  let cut=0;
  for(const pattern of narrativeCues){
    for(const match of candidate.matchAll(pattern)){
      cut=Math.max(cut,(match.index||0)+match[0].length);
    }
  }
  if(cut>0 && cut<candidate.length){
    candidate=candidate.slice(cut).trim();
  }

  candidate=candidate
    .replace(/^\d+\s+/u,'')
    .replace(/^(?:আজ|গতকাল|ওইদিন|সেদিন|শনিবার|রবিবার|রোববার|সোমবার|মঙ্গলবার|বুধবার|বৃহস্পতিবার|শুক্রবার|today|yesterday|saturday|sunday|monday|tuesday|wednesday|thursday|friday)\s*/iu,'')
    .replace(/^(?:সকাল(?:ে)?|ভোরে|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা|সন্ধ্যায়|সন্ধ্যায়|রাতে|morning|afternoon|evening|night)\s*/iu,'')
    .split(/\s+/)
    .slice(-7)
    .join(' ')
    .replace(/(এলাকা|মহল্লা|গ্রাম|বাজার|মার্কেট|থানা|উপজেলা|ইউনিয়ন|ইউনিয়ন|সড়ক|সড়ক|রোড|লেন|গলি|মোড়|মোড়|স্টেশন)(?:য়|য়|তে|ে)$/u,'$1')
    .trim();

  return cleanSpecificLocationText(candidate);
};

export const isSafeSpecificLocationText = (
  value: unknown,
  district?: string | null
) => {
  const raw=String(value ?? '').replace(/\s+/g,' ').trim();
  const normalized=normalizeText(raw);
  if (!normalized || normalized.length<5 || normalized.length>120) return false;

  if (/^(এলাকা|বাজার|মার্কেট|থানা|উপজেলা|ইউনিয়ন|ইউনিয়ন|গ্রাম|শহর|নগরী|মহানগরী|রোড|লেন|গলি|মোড়|মোড়|স্টেশন|area|market|bazaar|thana|upazila|union|village|city|road|street|lane|station)$/iu.test(normalized)) return false;
  if (/^(?:on|at|in|near)\s+(?:the\s+)?(?:road|street|lane|area|city|district|station)(?:\s+\d+)?$/iu.test(normalized)) return false;
  if (/(বিভিন্ন|various|several)\s+(এলাকা|areas?)/iu.test(normalized)) return false;
  if (/^(?:(?:\d{1,2}\s+)?(?:জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর|january|february|march|april|may|june|july|august|september|october|november|december)|(?:সকাল|দুপুর|বিকেল|সন্ধ্যা|রাত|morning|afternoon|evening|night)\b)/iu.test(normalized)) return false;
  if (/^(?:(?:গত|পূর্ববর্তী)\s+(?:বছর(?:ের)?|মাস(?:ের)?|সপ্তাহ(?:ের)?|দিন(?:ের)?)|(?:last|previous)\s+(?:year|month|week|day)\b)/iu.test(normalized)) return false;
  if (/(?:জেলার|district(?:'s)?).{0,90}(?:\sও\s|\sএবং\s|\sand\s|,).{0,90}(?:উপজেলা|থানা|upazila|thana)/iu.test(normalized)) return false;
  if (/(?:উপজেলা|থানা|upazila|thana).{0,70}(?:\sও\s|\sএবং\s|\sand\s|,).{0,70}(?:উপজেলা|থানা|upazila|thana)/iu.test(normalized)) return false;

  // Narrative/action fragments must never be promoted to an incident place.
  if (/(?:collected\s+evidence|cordoned\s+off|investigat(?:e|ed|ing|ion)|police\s+said|officials?\s+said|victim(?:s)?|the\s+victim|was\s+arrested|were\s+arrested|detained|reported\s+the\s+incident|went\s+to\s+the\s+area|visited\s+the\s+area)/iu.test(normalized)) return false;
  if (/(?:ভুক্তভোগী|পুলিশ\s+জানায়|পুলিশ\s+জানায়|কর্তৃপক্ষ|তদন্ত|গ্রেপ্তার|আটক|নিহত|আহত|উদ্ধার|জানান|বলেন|সন্ধান\s+না\s+পেয়ে|সন্ধান\s+না\s+পেয়ে|খোঁজ\s+করেও)/iu.test(normalized)) return false;
  if (/(?:ঘটনার|ঘটনায়|ঘটনায়|হত্যার\s+ঘটনায়|হত্যার\s+ঘটনায়|মামলার|মামলায়|মামলায়).{0,90}(?:থানা|পুলিশ\s+স্টেশন|police\s+station|thana)/iu.test(normalized)) return false;
  if (/(?:^|\s)(?:এদিকে|অন্যদিকে|এ\s+ঘটনায়|এ\s+ঘটনায়|এই\s+ঘটনায়|এই\s+ঘটনায়|এ\s+বিষয়ে|এ\s+বিষয়ে)(?=\s|$)/iu.test(normalized)) return false;

  // A road/street/lane phrase must carry an actual identifier or named place.
  if (/^(?:road|street|lane|avenue)\s*$/iu.test(normalized)) return false;
  if (/^(?:on|at|in|near)\s+(?:road|street|lane|avenue)\b/iu.test(normalized)) return false;
  if (/^(?:র|এর)\s+/u.test(normalized)) return false;

  // Positive place proof: do not accept arbitrary prose merely because it
  // avoided the narrative blacklist. A fine-grained location must either
  // contain an explicit geographic designator or be a compact Latin proper
  // place name captured from an incident-bound "at/near" phrase.
  const hasBanglaGeographicDesignator =
    /(?:^|[\s,;:()\-–—/])(?:থানা|উপজেলা|ইউনিয়ন|ইউনিয়ন|বাজার|মার্কেট|এলাকা|মহল্লা|গ্রাম|সড়ক|সড়ক|মহাসড়ক|মহাসড়ক|রোড|লেন|গলি|মোড়|মোড়|রেলগেট|স্টেশন|শহর|নগরী|মহানগরী)(?:য়|য়|তে|ে|র|ের|এর)?(?=$|[\s,.;:।()\-–—/])/u.test(raw);
  const hasEnglishGeographicDesignator =
    /(?:^|[\s,;:()\-–—/])(?:police\s+station|thana|upazila|union|market|bazaar|area|neighbou?rhood|village|road|street|lane|avenue|highway|rail\s*gate|station|city|metropolitan\s+area)(?=$|[\s,.;:()\-–—/])/iu.test(raw);
  const hasGeographicDesignator =
    hasBanglaGeographicDesignator || hasEnglishGeographicDesignator;
  const compactLatinProperPlace =
    /^(?:[A-Z][A-Za-z0-9.'’\-]*)(?:[\s,]+[A-Z0-9][A-Za-z0-9.'’\-]*){0,6}$/u.test(raw);

  if (!hasGeographicDesignator && !compactLatinProperPlace) return false;

  if (district) {
    const districtNormalized=normalizeText(district);
    if (normalized===districtNormalized || normalized===districtNormalized + ' district') return false;
  }
  return true;
};

const locationCandidateIsUsable = (candidate: string, district?: string | null) =>
  isSafeSpecificLocationText(candidate,district);

const SPECIFIC_LOCATION_PATTERNS = [
  /([^।.!?;,\n]{2,150}(?:থানা|উপজেলা|ইউনিয়ন|ইউনিয়ন|বাজার|মার্কেট|এলাকা|মহল্লা|গ্রাম|সড়ক|সড়ক|রোড|লেন|গলি|মোড়|মোড়|স্টেশন)(?:য়|য়|তে|ে)?)(?=\s|[।.!?;,]|$)/gu,
  /([^.!?;,\n]{2,150}(?:police station|thana|upazila|union|market|bazaar|area|neighbourhood|neighborhood|village|road|street|lane|avenue|station))(?=\s|[.!?;,]|$)/gi,
];

const incidentLocationScopes = (text: string) =>
  text
    .split(/(?<=[.!?।])\s+/)
    .map((item)=>item.trim())
    .filter(Boolean)
    .filter((item)=>
      /(ঘটনাটি|এ ঘটনা|এই ঘটনা|দুর্ঘটনাটি|হামলাটি|ঘটেছে|ঘটে|ঘটেছিল|সংঘটিত|incident|accident|attack|happened|occurred|took\s+place)/iu.test(item)
    );

const locationFromScope = (scope: string, district?: string | null) => {
  // Preserve common English administrative hierarchies before the broader
  // designator regex can collapse them to a trailing fragment such as
  // "of Garpara union".
  const englishVillageUnionPattern =
    /\b([A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){0,3}\s+village\s+of\s+[A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){0,3}\s+union)\b/gu;
  for (const match of scope.matchAll(englishVillageUnionPattern)) {
    const candidate=compactLocationPhrase(match[1] || '');
    if (locationCandidateIsUsable(candidate,district)) return candidate;
  }

  // Incident sentences often use a bare proper place after "at/near" without
  // adding words such as area, road, market, or village. Evaluate each match
  // in reading order, but ignore medical/destination phrases such as
  // "died at RMCH" so they cannot beat the actual incident place.
  const englishIncidentPlacePattern =
    /\b(?:at|near)\s+([A-Z][A-Za-z0-9.'’\-]*(?:\s+[A-Z][A-Za-z0-9.'’\-]*){0,5})(?=\s+(?:around|about|at|on|in|when|where|while|after|before|and|but)|[,.!?]|$)/gu;
  for (const match of scope.matchAll(englishIncidentPlacePattern)) {
    const matchIndex=match.index ?? 0;
    const prefix=scope.slice(Math.max(0,matchIndex-48),matchIndex);
    const medicalDestination=
      /(?:dies?|died|death|treated|admitted|hospitali[sz]ed|taken|shifted|referred)\s*$/i.test(prefix);
    if (medicalDestination) continue;

    const candidate=compactLocationPhrase(match[1] || '');
    if (locationCandidateIsUsable(candidate,district)) return candidate;
  }

  for (const pattern of SPECIFIC_LOCATION_PATTERNS) {
    const matches=[...scope.matchAll(pattern)];
    for (let index=matches.length-1;index>=0;index-=1) {
      const raw=matches[index]?.[1];
      if (!raw) continue;
      const candidate=compactLocationPhrase(raw);
      if (locationCandidateIsUsable(candidate,district)) return candidate;
    }
  }
  return null;
};

export const inferSpecificLocationPhrase = (value: unknown, district?: string | null) => {
  const text = String(value ?? '').replace(/\s+/g,' ').trim();
  if (!text) return null;

  // Prefer the sentence that explicitly describes where the incident happened.
  for (const scope of incidentLocationScopes(text)) {
    const candidate=locationFromScope(scope,district);
    if (candidate) return candidate;
  }

  // Only then consider the full article, with narrative fragments rejected.
  const fallback=locationFromScope(text,district);
  if (fallback) return fallback;

  const broadPatterns = [
    /([^।.!?;,\n]{2,90}?(?:মহানগরী|মহানগর|নগরী|শহর))(?:তে|য়|য়ে|ে|র|এর)?(?=\s|[।.!?;,]|$)/gu,
    /([^.!?;,\n]{2,100}?(?:metropolitan area|city))(?=\s|[.!?;,]|$)/gi,
  ];
  for (const pattern of broadPatterns) {
    const matches=[...text.matchAll(pattern)];
    for (let index=matches.length-1;index>=0;index-=1) {
      const raw=matches[index]?.[1];
      if (!raw) continue;
      const candidate=compactLocationPhrase(raw);
      if (locationCandidateIsUsable(candidate,district)) return candidate;
    }
  }
  return null;
};

export const inferDistrictWideScope = (value: unknown) => {
  const text = normalizeText(value);
  return /(জেলাজুড়ে|জেলাজুড়ে|জেলা\s*জুড়ে|জেলা\s*জুড়ে|district[- ]wide|across\s+(?:the\s+)?district|throughout\s+(?:the\s+)?district)/iu.test(text);
};

const BN_DIGITS: Record<string,string> = {'০':'0','১':'1','২':'2','৩':'3','৪':'4','৫':'5','৬':'6','৭':'7','৮':'8','৯':'9'};
const asciiDigits = (value: unknown) => String(value ?? '').replace(/[০-৯]/g, (d) => BN_DIGITS[d] || d);
const MONTHS: Record<string,number> = {
  january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12,
  'জানুয়ারি':1,'জানুয়ারি':1,'ফেব্রুয়ারি':2,'ফেব্রুয়ারি':2,'মার্চ':3,'এপ্রিল':4,'মে':5,'জুন':6,'জুলাই':7,'আগস্ট':8,'সেপ্টেম্বর':9,'অক্টোবর':10,'নভেম্বর':11,'ডিসেম্বর':12
};
const ymd = (year: number, month: number, day: number) => {
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
};

const NAMED_MONTH_RE =
  '(?:january|february|march|april|may|june|july|august|september|october|november|december|জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর)';

const namedDateFromText = (text: string, publishedDate?: string | null) => {
  const baseYear = publishedDate
    ? Number(publishedDate.slice(0,4))
    : new Date().getUTCFullYear();

  const dayFirst=text.match(
    new RegExp('(?:^|[\\s(])(\\d{1,2})\\s+(' + NAMED_MONTH_RE + ')(?:\\s*,?\\s*(20\\d{2}))?','iu')
  );
  if(dayFirst){
    return ymd(
      Number(dayFirst[3] || baseYear),
      MONTHS[dayFirst[2].toLowerCase()] || MONTHS[dayFirst[2]],
      Number(dayFirst[1])
    );
  }

  const monthFirst=text.match(
    new RegExp('(?:^|[\\s(])(' + NAMED_MONTH_RE + ')\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(20\\d{2}))?','iu')
  );
  if(monthFirst){
    return ymd(
      Number(monthFirst[3] || baseYear),
      MONTHS[monthFirst[1].toLowerCase()] || MONTHS[monthFirst[1]],
      Number(monthFirst[2])
    );
  }

  return null;
};

const numericDateFromText = (text: string) => {
  const explicitIso = text.match(/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.]([0-2]?\d|3[01])\b/);
  if (explicitIso) return ymd(Number(explicitIso[1]),Number(explicitIso[2]),Number(explicitIso[3]));
  const explicitDmy = text.match(/\b([0-2]?\d|3[01])[-\/.](0?[1-9]|1[0-2])[-\/.](20\d{2})\b/);
  if (explicitDmy) return ymd(Number(explicitDmy[3]),Number(explicitDmy[2]),Number(explicitDmy[1]));
  return null;
};

const relativeIncidentDateFromText = (
  text: string,
  publishedDate?: string | null,
  allowToday=true
) => {
  if (!publishedDate) return null;
  if (/(গতকাল|yesterday)/iu.test(text)) {
    const d = new Date(publishedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate()-1);
    return d.toISOString().slice(0,10);
  }

  const weekdayNames: Array<[number, RegExp]> = [
    [0, /(গত\s*)?(?:রবিবার|রোববার)(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?sunday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [1, /(গত\s*)?সোমবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?monday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [2, /(গত\s*)?মঙ্গলবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?tuesday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [3, /(গত\s*)?বুধবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?wednesday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [4, /(গত\s*)?বৃহস্পতিবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?thursday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [5, /(গত\s*)?শুক্রবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?friday(?:\s+(?:night|morning|afternoon|evening))?/iu],
    [6, /(গত\s*)?শনিবার(?:\s*(?:রাত(?:ে)?|সকাল(?:ে)?|ভোর(?:ে)?|দুপুর(?:ে)?|বিকেল(?:ে)?|বেলা))?|(?:last\s+)?saturday(?:\s+(?:night|morning|afternoon|evening))?/iu],
  ];

  const incidentAnchorPattern =
    /(ঘটনাটি|দুর্ঘটনা(?:টি|য়|য়)?|ছিনতাইয়ের\s+ঘটনা|ছিনতাইয়ের\s+ঘটনা|হামলাটি|ধর্ষণের\s+ঘটনা|ডাকাতির\s+ঘটনা|চুরির\s+ঘটনা|ঘটে|ঘটেছে|ঘটেছিল|incident|accident|collision|crash|attack|rape|robbery|snatching|theft|occurred|happened)/iu;
  const anchorMatch=text.match(incidentAnchorPattern);
  const anchorIndex=anchorMatch?.index ?? Math.floor(text.length/2);

  const weekdayCandidates:Array<{
    weekday:number;
    matchedText:string;
    index:number;
    distance:number;
  }>=[];
  for(const [weekday,pattern] of weekdayNames){
    const match=text.match(pattern);
    if(!match) continue;
    const index=match.index ?? 0;
    weekdayCandidates.push({
      weekday,
      matchedText:match[0],
      index,
      distance:Math.abs(index-anchorIndex),
    });
  }

  if(!weekdayCandidates.length) {
    return allowToday && /(আজ|today)/iu.test(text) ? publishedDate : null;
  }

  // A news sentence can mention the press-release day and the actual incident
  // day together. Choose the weekday closest to the incident/action wording,
  // not simply the first weekday in calendar order.
  weekdayCandidates.sort((a,b)=>a.distance-b.distance || a.index-b.index);
  const chosen=weekdayCandidates[0];

  const base=new Date(publishedDate + 'T00:00:00Z');
  const d=new Date(base);
  let delta=(d.getUTCDay()-chosen.weekday+7)%7;
  if (/(গত|last)/iu.test(chosen.matchedText) && delta===0) delta=7;
  d.setUTCDate(d.getUTCDate()-delta);
  return d.toISOString().slice(0,10);
};

const todayIncidentDateFromText = (text: string, publishedDate?: string | null) =>
  publishedDate && /(আজ|today)/iu.test(text) ? publishedDate : null;

const INCIDENT_DATE_CUE_RE =
  /(ঘটনাটি|এ ঘটনা|এই ঘটনা|দুর্ঘটনা(?:টি|য়|য়)?|হামলাটি|ধর্ষণের ঘটনা|ছিনতাইয়ের ঘটনা|ছিনতাইয়ের ঘটনা|ডাকাতির ঘটনা|চুরির ঘটনা|ঘটেছে|ঘটে|ঘটেছিল|সংঘটিত|নিয়ন্ত্রণ হারিয়ে|নিয়ন্ত্রণ হারিয়ে|অবরোধ|অপহরণ|হত্যা|খুন|উদ্ধার|নিখোঁজ|নিহত|আহত|সংঘর্ষ|পিটিয়ে|পিটিয়ে|মারধর|incident|accident|attack|rape|robbery|snatching|theft|lost control|blockade|abduct|kidnap|murder|missing|disappeared|killed|injured|rescued|collision|crash|assault)/iu;

const PUBLICATION_METADATA_RE =
  /(?:প্রকাশ(?:িত)?|আপডেট|নিজস্ব প্রতিবেদক|স্টাফ রিপোর্টার|published(?:\\s+on)?|publication\\s+date|updated|last\\s+updated)(?:\\s|:|-)/iu;

export const inferIncidentDate = (value: unknown, publishedDate?: string | null) => {
  const text = asciiDigits(normalizeText(value));
  if (!text) return null;

  const sentences=text
    .split(/(?<=[.!?।])\s+/)
    .map((item)=>item.trim())
    .filter(Boolean);

  const incidentIndexes=sentences
    .map((item,index)=>INCIDENT_DATE_CUE_RE.test(item)?index:-1)
    .filter((index)=>index>=0);

  // First pass: prefer source-grounded explicit dates, yesterday, and named
  // weekdays across ALL incident sentences. Generic "today" wording must not
  // win merely because it appears in an earlier narrative sentence.
  for (const index of incidentIndexes) {
    const scope=sentences[index];
    const named=namedDateFromText(scope,publishedDate);
    if (named) return named;
    const numeric=numericDateFromText(scope);
    if (numeric) return numeric;
    const strongRelative=relativeIncidentDateFromText(scope,publishedDate,false);
    if (strongRelative) return strongRelative;

    const backReferencesPriorSentence=
      /^(?:এর\s*আগে|এরআগে|এর\s*পূর্বে|এরপূর্বে|earlier|previously|before\s+that)(?:\s|,|:|।|$)/iu.test(scope);
    const previous=index>0?sentences[index-1]:'';
    const previousLooksLikePublicationMetadata=
      /(?:প্রকাশ(?:িত)?|আপডেট|published(?:\s+on)?|publication\s+date|updated)(?:\s|:|-)/iu.test(previous);

    if(backReferencesPriorSentence && previous && !previousLooksLikePublicationMetadata){
      const previousNamed=namedDateFromText(previous,publishedDate);
      if(previousNamed) return previousNamed;
      const previousNumeric=numericDateFromText(previous);
      if(previousNumeric) return previousNumeric;
      const previousRelative=relativeIncidentDateFromText(previous,publishedDate,false);
      if(previousRelative) return previousRelative;
    }
  }

  // Second pass: an explicit "today" attached to an incident sentence is valid
  // only when no stronger source date/weekday exists anywhere in the incident.
  for (const index of incidentIndexes) {
    const today=todayIncidentDateFromText(sentences[index],publishedDate);
    if(today) return today;
  }

  // Accept explicit event dates from other non-metadata incident sentences.
  for(const sentence of sentences){
    if(PUBLICATION_METADATA_RE.test(sentence) || !INCIDENT_DATE_CUE_RE.test(sentence)) continue;
    const named=namedDateFromText(sentence,publishedDate);
    if(named) return named;
    const numeric=numericDateFromText(sentence);
    if(numeric) return numeric;
    const strongRelative=relativeIncidentDateFromText(sentence,publishedDate,false);
    if(strongRelative) return strongRelative;
  }

  for(const sentence of sentences){
    if(PUBLICATION_METADATA_RE.test(sentence) || !INCIDENT_DATE_CUE_RE.test(sentence)) continue;
    const today=todayIncidentDateFromText(sentence,publishedDate);
    if(today) return today;
  }

  const nonMetadataText=sentences.filter((sentence)=>!PUBLICATION_METADATA_RE.test(sentence)).join(' ');
  const namedFallback=namedDateFromText(nonMetadataText,publishedDate);
  if (namedFallback) return namedFallback;

  const numericFallback=numericDateFromText(nonMetadataText);
  if (numericFallback) return numericFallback;

  // Relative weekdays/today are only trustworthy when attached to an
  // incident-bearing sentence. Never infer them from unrelated circulation,
  // publication, responder, or background text.
  return null;
};

const incidentContextTokens = (value: string) =>
  normalizeText(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2);

const isNearDuplicateIncidentSentence = (candidate: string, existing: string) => {
  const candidateKey = normalizeText(candidate);
  const existingKey = normalizeText(existing);
  if (!candidateKey || !existingKey) return false;
  if (candidateKey === existingKey || candidateKey.includes(existingKey) || existingKey.includes(candidateKey)) {
    return true;
  }

  const candidateTokens = new Set(incidentContextTokens(candidate));
  const existingTokens = new Set(incidentContextTokens(existing));
  const smaller = Math.min(candidateTokens.size, existingTokens.size);
  if (smaller < 7) return false;

  let shared = 0;
  for (const token of candidateTokens) {
    if (existingTokens.has(token)) shared += 1;
  }

  // Excerpt/body copies from publishers often differ by only a preposition,
  // punctuation mark, or one rewritten word. Suppress those near-duplicates
  // without collapsing genuinely different incident facts.
  return shared / smaller >= 0.84;
};

export const buildIncidentContext = (article: { excerpt?: string | null; body?: string | null }) => {
  const excerpt = String(article.excerpt || '').trim();
  const body = String(article.body || '').trim();
  const toSentences=(value:string)=>
    value
      .split(/(?<=[.!?।])\s+/)
      .map((item)=>item.trim())
      .filter((item)=>item.length >= 25);

  const sentenceCandidates = [
    ...toSentences(excerpt),
    ...toSentences(body),
  ];

  const selected: string[] = [];
  for (const candidate of sentenceCandidates) {
    if (!candidate) continue;
    if (selected.some((existing)=>isNearDuplicateIncidentSentence(candidate,existing))) continue;
    selected.push(candidate);
    if (selected.join(' ').length >= 1200 || selected.length >= 10) break;
  }
  return clip(selected.join(' '), 1800);
};

export const sourceTextLength = (value: unknown) =>
  Array.from(String(value ?? '').trim()).length;

const clipSourceTextWithoutInventing = (value: unknown, max: number) => {
  const text=String(value ?? '').replace(/\s+/g,' ').trim();
  const chars=Array.from(text);
  if(chars.length<=max) return text;

  const head=chars.slice(0,max+1).join('');
  const punctuation=[head.lastIndexOf('।'),head.lastIndexOf('.'),head.lastIndexOf('!'),head.lastIndexOf('?')]
    .filter((index)=>index>=400);
  if(punctuation.length){
    return head.slice(0,Math.max(...punctuation)+1).trim();
  }

  const lastSpace=head.lastIndexOf(' ');
  return (lastSpace>=400 ? head.slice(0,lastSpace) : chars.slice(0,max).join('')).trim();
};

export const buildFeedReadyIncidentContext = (
  article: { excerpt?: string | null; body?: string | null },
  min=400,
  max=800
) => {
  const context=buildIncidentContext(article);
  const clipped=clipSourceTextWithoutInventing(context,max);
  return sourceTextLength(clipped)>=min ? clipped : '';
};

export const buildSourceLanguageFields = (
  title: string,
  description: string,
  language: string
) => ({
  titlePrimary: clip(title,100),
  descriptionPrimary: clipSourceTextWithoutInventing(description,800),
  titleEn: '',
  descriptionEn: '',
  sourceLanguage: language || 'unknown',
});

const FOREIGN_INCIDENT_TITLE_RE =
  /(mumbai|delhi|kolkata|chennai|bengaluru|bangalore|karachi|lahore|islamabad|new york|los angeles|london|paris|tokyo|beijing|moscow|kyiv|gaza|israel|india|pakistan|nepal|sri lanka|united states|\busa\b|united kingdom|\buk\b|canada|australia|malaysia|singapore|dubai|uae|saudi arabia|qatar|মুম্বাই|দিল্লি|কলকাতা|ভারত|পাকিস্তান|নেপাল|শ্রীলঙ্কা|লন্ডন|যুক্তরাষ্ট্র|যুক্তরাজ্য|কানাডা|অস্ট্রেলিয়া|অস্ট্রেলিয়া|দুবাই|সৌদি আরব)/iu;

export const isLikelyForeignIncident = (title: unknown, articleUrl?: unknown, fullText?: unknown) => {
  const headline=normalizeText(title);
  let path='';
  try{path=new URL(String(articleUrl||'')).pathname.toLowerCase();}catch{}
  const hasBangladeshDistrict=Boolean(findLocation(headline));
  if(hasBangladeshDistrict) return false;
  if(/\/(world|international|asia|middle-east|europe|americas|global)(?:\/|$)/i.test(path)) return true;
  if(FOREIGN_INCIDENT_TITLE_RE.test(headline)) return true;

  const text=normalizeText(fullText);
  return !findLocation(text) && FOREIGN_INCIDENT_TITLE_RE.test(headline+' '+text.slice(0,700));
};

export const scoreDiscoveryLink = (url: string, anchorText: string) => {
  if (classifyArticle(anchorText)) return 0;
  let path = '';
  try { path = new URL(url).pathname.toLowerCase(); } catch {}
  if (/(\/bangladesh(?:\/|$)|\/national(?:\/|$)|\/crime(?:\/|$)|\/law(?:\/|$)|\/capital(?:\/|$)|\/country(?:\/|$)|\/whole-country(?:\/|$)|\/samagrabangladesh(?:\/|$)|\/sara-bangla(?:\/|$)|\/saradesh(?:\/|$))/i.test(path)) return 1;
  return 2;
};
