import {
  buildSourceLanguageFields,
  inferChildIncidentType,
  inferRideSharingIncidentType,
  inferRideSharingPlatform,
  inferRideSharingVehicleType,
  isSafeSpecificLocationText,
  sourceTextLength,
} from "./newsIntakeAutomationCore.ts";

export type NewsIntakeBuilderArticle = {
  title: string;
  excerpt?: string | null;
  body?: string | null;
  publisherName: string;
  canonicalUrl: string;
  sourcePublishedDate?: string | null;
};

export type NewsIntakeBuilderClassification = {
  segmentId: string;
  subcategoryId: string;
  confidence?: number;
};

export type NewsIntakeBuilderLocation = {
  division?: string | null;
  district?: string | null;
  upazilaOrThana?: string | null;
  area?: string | null;
  road?: string | null;
  landmark?: string | null;
  formattedAddress?: string | null;
  locationScope?: string | null;
  quality?: string | null;
};

export type NewsIntakeBuilderInput = {
  article: NewsIntakeBuilderArticle;
  classification: NewsIntakeBuilderClassification;
  location: NewsIntakeBuilderLocation | null;
  incidentDate: string | null;
  language: string;
  feedContext: string;
};

type BuilderKind =
  | "standard"
  | "bribery"
  | "harassment"
  | "sexual_harassment"
  | "mob_justice"
  | "child_safety"
  | "ride_sharing"
  | "utility_outage"
  | "excess_bill";

type FrequencyMode = "adaptive" | "one_time" | "ongoing" | "repeated" | "unknown";

type BuilderPolicy = {
  segmentId: string;
  kind: BuilderKind;
  frequency: FrequencyMode;
  basePriority: "medium" | "high";
};

export const NEWS_INTAKE_SUBCATEGORY_BUILDERS: Record<string, BuilderPolicy> = {
  "bribe-demanded-service": {segmentId:"extortion",kind:"bribery",frequency:"adaptive",basePriority:"medium"},
  "shop-business": {segmentId:"extortion",kind:"standard",frequency:"adaptive",basePriority:"medium"},
  "transport-movement": {segmentId:"extortion",kind:"standard",frequency:"ongoing",basePriority:"medium"},
  "construction-property": {segmentId:"extortion",kind:"standard",frequency:"adaptive",basePriority:"medium"},
  "threat-money-demand": {segmentId:"extortion",kind:"standard",frequency:"adaptive",basePriority:"medium"},
  "extortion-other": {segmentId:"extortion",kind:"standard",frequency:"adaptive",basePriority:"medium"},

  "rape-sexual-violence": {segmentId:"harassment",kind:"harassment",frequency:"adaptive",basePriority:"medium"},
  "sexual-harassment": {segmentId:"harassment",kind:"sexual_harassment",frequency:"adaptive",basePriority:"medium"},
  "domestic-violence": {segmentId:"harassment",kind:"harassment",frequency:"adaptive",basePriority:"medium"},
  "blackmail-coercion": {segmentId:"harassment",kind:"harassment",frequency:"adaptive",basePriority:"medium"},
  "honeytrap": {segmentId:"harassment",kind:"harassment",frequency:"one_time",basePriority:"medium"},

  "road-public-space-encroachment": {segmentId:"illegal_occupation",kind:"standard",frequency:"unknown",basePriority:"medium"},
  "private-property-occupation": {segmentId:"illegal_occupation",kind:"standard",frequency:"adaptive",basePriority:"medium"},
  "government-property-occupation": {segmentId:"illegal_occupation",kind:"standard",frequency:"unknown",basePriority:"medium"},

  "load-shedding-outage": {segmentId:"load_shedding",kind:"utility_outage",frequency:"one_time",basePriority:"medium"},
  "gas-shortage": {segmentId:"load_shedding",kind:"utility_outage",frequency:"adaptive",basePriority:"medium"},
  "excess-electricity-bill": {segmentId:"load_shedding",kind:"excess_bill",frequency:"one_time",basePriority:"medium"},

  "theft": {segmentId:"public_safety",kind:"standard",frequency:"one_time",basePriority:"medium"},
  "robbery": {segmentId:"public_safety",kind:"standard",frequency:"one_time",basePriority:"high"},
  "snatching": {segmentId:"public_safety",kind:"standard",frequency:"one_time",basePriority:"high"},
  "mob-justice": {segmentId:"public_safety",kind:"mob_justice",frequency:"one_time",basePriority:"high"},
  "child_abduction_murder": {segmentId:"public_safety",kind:"child_safety",frequency:"one_time",basePriority:"high"},
  "ride_sharing_safety": {segmentId:"public_safety",kind:"ride_sharing",frequency:"one_time",basePriority:"high"},

  "charging-station-location": {segmentId:"rickshaw",kind:"standard",frequency:"repeated",basePriority:"medium"},

  "road-repair-delay": {segmentId:"road_transport",kind:"standard",frequency:"ongoing",basePriority:"medium"},
  "road-accident": {segmentId:"road_transport",kind:"standard",frequency:"one_time",basePriority:"medium"},
  "road-block": {segmentId:"road_transport",kind:"standard",frequency:"adaptive",basePriority:"medium"},
};

export const NEWS_INTAKE_SUBCATEGORY_IDS = Object.freeze(Object.keys(NEWS_INTAKE_SUBCATEGORY_BUILDERS));

const asText=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();

const BN_DIGITS:Record<string,string>={
  "০":"0","১":"1","২":"2","৩":"3","৪":"4","৫":"5","৬":"6","৭":"7","৮":"8","৯":"9"
};
const asciiDigits=(value:unknown)=>asText(value).replace(/[০-৯]/g,(d)=>BN_DIGITS[d]||d);

const fullText=(article:NewsIntakeBuilderArticle)=>
  [article.title,article.excerpt,article.body].map(asText).filter(Boolean).join(" ");

const hasRepeatedCue=(text:string)=>
  /(বারবার|একাধিকবার|নিয়মিত|নিয়মিত|প্রতিদিন|প্রতি\s*(দিন|মাস|গাড়ি|গাড়ি|যান)|দীর্ঘদিন|repeated|repeatedly|multiple\s+times|regularly|daily|monthly|per\s+(vehicle|truck|bus)|for\s+months|for\s+years)/iu.test(text);

const hasOngoingCue=(text:string)=>
  /(চলমান|এখনও|এখনো|অব্যাহত|দখলে|বেহাল|দীর্ঘদিন|অবরোধ চলছে|ongoing|continues?|still|remains?|occupied|encroached|blocked|in disrepair)/iu.test(text);

const inferFrequency=(text:string,mode:FrequencyMode)=>{
  if(mode==="one_time") return "one-time";
  if(mode==="ongoing") return "ongoing";
  if(mode==="repeated") return "repeated";
  if(mode==="unknown"){
    if(hasOngoingCue(text)) return "ongoing";
    if(hasRepeatedCue(text)) return "repeated";
    return "unknown_not_stated";
  }
  if(hasOngoingCue(text)) return "ongoing";
  if(hasRepeatedCue(text)) return "repeated";
  return "one-time";
};

const inferPriority=(text:string,base:"medium"|"high")=>{
  if(/(গুলি|অস্ত্র|ছুরি|চাকু|গুরুতর|নিহত|মৃত্যু|খুন|ধর্ষণ|অপহরণ|gun|firearm|weapon|knife|seriously\s+injured|killed|death|murder|rape|kidnap)/iu.test(text)){
    return "high";
  }
  return base;
};

const parseSourceTimes=(value:unknown)=>{
  const text=asciiDigits(value);
  const found:string[]=[];
  const push=(hour:number,minute:number)=>{
    if(hour<0||hour>23||minute<0||minute>59)return;
    const v=String(hour).padStart(2,"0")+":"+String(minute).padStart(2,"0");
    if(!found.includes(v)) found.push(v);
  };

  for(const match of text.matchAll(/(?:^|\s)(\d{1,2})(?::(\d{2}))?\s*(am|pm)(?=\s|[,.।;]|$)/giu)){
    let h=Number(match[1]);
    const m=Number(match[2]||0);
    if(h<1||h>12)continue;
    if(String(match[3]).toLowerCase()==="pm"&&h!==12)h+=12;
    if(String(match[3]).toLowerCase()==="am"&&h===12)h=0;
    push(h,m);
  }

  for(const match of text.matchAll(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?=\s|[,.।;]|$)/gu)){
    push(Number(match[1]),Number(match[2]));
  }

  for(const match of text.matchAll(/(?:সকাল|ভোর|দুপুর|বিকেল|সন্ধ্যা|রাত)\s*(\d{1,2})(?:টা|টার|টায়|টায়)?(?::(\d{2}))?/gu)){
    let h=Number(match[1]);
    const m=Number(match[2]||0);
    const cue=match[0];
    if(/দুপুর|বিকেল|সন্ধ্যা|রাত/u.test(cue)&&h<12) h+=12;
    push(h,m);
  }
  return found;
};

const parseAgeGroup=(text:string)=>{
  const normalized=asciiDigits(text);
  const m=normalized.match(/(?:aged?|age|বয়স|বয়স|বছর বয়সী|বছর বয়সী)\s*[:\-]?\s*(\d{1,3})|\b(\d{1,3})[- ]year[- ]old|(?:^|\s)(\d{1,2})\s*বছর(?:ের| বয়সী| বয়সী)/iu);
  const age=Number(m?.[1]||m?.[2]||m?.[3]||0);
  if(age>0){
    if(age<18)return "under_18";
    if(age<=29)return "18_29";
    if(age<=59)return "30_59";
    return "60_plus";
  }
  if(/(শিশু|কিশোরী|কিশোর|স্কুলছাত্রী|স্কুলছাত্র|minor|child|teenager|schoolgirl|schoolboy)/iu.test(text)) return "under_18";
  return "unknown_not_stated";
};

const inferRelationship=(text:string)=>{
  // Prefer an explicitly stated alleged-person relationship. News stories often
  // mention police, doctors, or other officials later as responders; those
  // narrative mentions must not become the alleged person's relationship.
  if(/(স্বামী|স্ত্রী|husband|wife|spouse|boyfriend|girlfriend|partner)/iu.test(text)) return "intimate_partner";
  if(/(বাবা|মা|ভাই|বোন|পরিবারের সদস্য|family member|father|mother|brother|sister)/iu.test(text)) return "household_family";
  if(/(আত্মীয়|আত্মীয়|চাচা|মামা|কাকা|relative|uncle|cousin)/iu.test(text)) return "other_relative";
  if(/(সহপাঠী|classmate|সহকর্মী|colleague|coworker)/iu.test(text)) return "coworker_classmate";
  if(/(প্রতিবেশী|neighbor|neighbour)/iu.test(text)) return "neighbor";
  if(/(শিক্ষক|টিউটর|teacher|tutor)/iu.test(text)) return "teacher_tutor";
  if(/(বস|সুপারভাইজার|নিয়োগকর্তা|নিয়োগকর্তা|boss|supervisor|employer)/iu.test(text)) return "supervisor_employer";
  if(/(ড্রাইভার|চালক|হেলপার|transport worker|driver|helper)/iu.test(text)) return "transport_worker";
  if(/(বন্ধু|পরিচিত ব্যক্তি|friend|acquaintance)/iu.test(text)) return "friend_acquaintance";
  if(/(অজ্ঞাত|অপরিচিত|unknown man|unknown person|unidentified man|unidentified person|stranger)/iu.test(text)) return "stranger";
  if(/(একাধিক অভিযুক্ত|একাধিক ব্যক্তি|দলবদ্ধভাবে|several assailants|multiple people|group of (?:men|people|persons))/iu.test(text)) return "multiple_people";
  if(/(পুলিশ সদস্য|পুলিশ কর্মকর্তা|কনস্টেবল|এসআই|ওসি|police officer|police constable|law enforcement officer)/iu.test(text)) return "law_enforcement_authority";
  if(/(ডাক্তার|নার্স|স্বাস্থ্যকর্মী|সেবাদানকারী|doctor|nurse|health worker|service provider)/iu.test(text)) return "service_health_worker";
  return "unknown_not_stated";
};

const inferSexualType=(text:string)=>{
  if(/(অনাকাঙ্ক্ষিত স্পর্শ|শ্লীলতাহানি|\bunwanted physical contact\b|\btouch(?:ed|ing)?\b|\bgrop(?:e|ed|ing)?\b|\bmolest(?:ed|ing)?\b)/iu.test(text)) return "unwanted_physical_contact";
  if(/(ইভ\s*টিজ|eve[- ]?teas|কটূক্তি|যৌন মন্তব্য|sexual comment|gesture|proposition)/iu.test(text)) return "eve_teasing";
  if(/(স্টকিং|অনুসরণ|\bstalk(?:ed|ing)?\b)/iu.test(text)) return "stalking";
  if(/(অনলাইন|ফেসবুক|মেসেঞ্জার|সোশ্যাল|\bonline\b|\bfacebook\b|\bmessenger\b|\bsocial media\b)/iu.test(text)) return "online_digital_harassment";
  if(/(কর্মক্ষেত্র|অফিস|\bworkplace\b|\boffice\b)/iu.test(text)) return "workplace_harassment";
  if(/(ক্ষমতা|পদমর্যাদা|authority|abuse of power)/iu.test(text)) return "abuse_of_power";
  return "unknown_not_stated";
};

const sexualContextFromScope=(scope:string)=>{
  if(/(স্কুল|কলেজ|বিশ্ববিদ্যালয়|বিশ্ববিদ্যালয়|ক্যাম্পাস|\bschool\b|\bcollege\b|\buniversity\b|\bcampus\b)/iu.test(scope)) return "educational_institution";
  if(/(বাস|ট্রেন|লঞ্চ|গণপরিবহন|\bpublic transport\b|\bbus\b|\btrain\b)/iu.test(scope)) return "public_transport";
  if(/(হাসপাতাল|ক্লিনিক|\bhealthcare\b|\bhospital\b|\bclinic\b)/iu.test(scope)) return "healthcare";
  if(/(অফিস|কর্মক্ষেত্র|\bworkplace\b|\boffice\b)/iu.test(scope)) return "workplace";
  if(/(অনলাইন|ফেসবুক|মেসেঞ্জার|সোশ্যাল|\bonline\b|\bfacebook\b|\bmessenger\b|\bsocial media\b)/iu.test(scope)) return "online_social_media";
  if(/(সরকারি অফিস|\bservice office\b|\bgovernment office\b)/iu.test(scope)) return "government_service";
  if(/(রাস্তা|পার্ক|উদ্যান|বাজার|\bpublic space\b|\broad\b|\bstreet\b|\bpark\b|\bmarket\b)/iu.test(scope)) return "road_public_space";
  if(/(বাসা|বাড়ি|বাড়ি|ফ্ল্যাট|\bhome\b|\bhouse\b|\bflat\b|\bresidence\b)/iu.test(scope)) return "home_private_space";
  return "";
};

const inferSexualContext=(text:string)=>{
  const sentences=text
    .split(/(?<=[.!?।])\s+/)
    .map((sentence)=>sentence.trim())
    .filter(Boolean);

  // Resolve the context from the sentence that actually describes the alleged
  // harassment/incident before looking at background, destination or responder
  // sentences such as "returning home" or "taken to hospital".
  for(const sentence of sentences){
    if(!/(যৌন\s*হয়রানি|যৌন\s*হয়রানি|শ্লীলতাহানি|ইভ\s*টিজ|অনাকাঙ্ক্ষিত\s*স্পর্শ|sexual harassment|unwanted physical contact|eve[- ]?teas|grop|molest|incident (?:happened|occurred|took place))/iu.test(sentence)) continue;
    const contextual=sexualContextFromScope(sentence);
    if(contextual) return contextual;
  }

  return sexualContextFromScope(text) || "unknown_not_stated";
};

const inferMobDetails=(text:string)=>{
  const trigger=
    /(ছিনতাই|snatching)/iu.test(text) ? "snatching_allegation" :
    /(চুরি|ডাকাতি|theft|robbery|dacoity)/iu.test(text) ? "suspected_theft_robbery" :
    /(অপহরণ|kidnap|ছেলেধরা)/iu.test(text) ? "kidnapping_allegation" :
    /(যৌন|sexual)/iu.test(text) ? "sexual_offence_allegation" :
    /(ধর্ম|religious)/iu.test(text) ? "religious_sentiment_allegation" :
    /(বিরোধ|dispute)/iu.test(text) ? "personal_local_dispute" :
    "unknown";

  const outcome=
    /(নিহত|মৃত্যু|মারা গেছে|হত্যা|dead|died|killed)/iu.test(text) ? "death_reported" :
    /(গুরুতর আহত|seriously injured|critical)/iu.test(text) ? "seriously_injured" :
    /(মারধর|পিটুনি|পিটিয়ে|পিটিয়ে|assault|beaten)/iu.test(text) ? "physically_assaulted" :
    /(ঘেরাও|বেঁধে|আটকে|restrained|surrounded)/iu.test(text) ? "restrained_surrounded" :
    /(উদ্ধার|rescued|intervention)/iu.test(text) ? "rescued_intervention" :
    hasOngoingCue(text) ? "ongoing" :
    "unknown";

  const spread=
    /(ফেসবুক|সামাজিক যোগাযোগ|social media|facebook)/iu.test(text) ? "social_media" :
    /(মাইক|লাউডস্পিকার|loudspeaker)/iu.test(text) ? "loudspeaker_announcement" :
    /(সালিশ|বৈঠক|arbitration|meeting)/iu.test(text) ? "local_arbitration_meeting" :
    /(গুজব|মুখে মুখে|rumou?r|word of mouth)/iu.test(text) ? "word_of_mouth" :
    /(অভিযোগ|সন্দেহ|accusation|suspected)/iu.test(text) ? "direct_accusation" :
    "unknown";

  const countMatch=asciiDigits(text).match(/(?:মোট\s*)?(\d{1,4})\s*(?:জন|ব্যক্তি|people|persons?)/iu);
  const targetedCount=countMatch ? Math.max(1,Math.min(9999,Number(countMatch[1]))) : "";

  const ongoingStatus=
    hasOngoingCue(text) && !/(উদ্ধার|গ্রেপ্তার|আটক|শেষ|থেমে|rescued|arrested|detained|ended|stopped)/iu.test(text)
      ? "ongoing"
      : /(উদ্ধার|গ্রেপ্তার|আটক|শেষ|থেমে|rescued|arrested|detained|ended|stopped|নিহত|মৃত্যু|killed|died)/iu.test(text)
        ? "ended"
        : "unknown";

  return {trigger,spread,outcome,targetedCount,ongoingStatus};
};

const inferBriberyDepartment=(text:string)=>{
  if(/(ভূমি অফিস|land office)/iu.test(text)) return "land_office";
  if(/(ইমিগ্রেশন|immigration)/iu.test(text)) return "immigration_office";
  if(/(কর অফিস|tax office|tax authority)/iu.test(text)) return "tax_office";
  if(/(কাস্টমস|customs)/iu.test(text)) return "customs_office";
  if(/(ট্রাফিক পুলিশ|traffic police)/iu.test(text)) return "traffic_police";
  if(/(বিআরটিএ|brta)/iu.test(text)) return "brta";
  if(/(পাসপোর্ট|passport)/iu.test(text)) return "passport_office";
  if(/(সিটি কর্পোরেশন|city corporation)/iu.test(text)) return "city_corporation";
  if(/(সাব[- ]?রেজিস্ট্রি|sub[- ]?registry)/iu.test(text)) return "sub_registry_office";
  if(/(শিক্ষা অফিস|education office)/iu.test(text)) return "education_office";
  if(/(সরকারি হাসপাতাল|government hospital)/iu.test(text)) return "government_hospital";
  if(/(সরকারি|government|উপজেলা অফিস|জেলা অফিস|office)/iu.test(text)) return "other_government_service";
  return "";
};

const parseMoneyAmount=(value:unknown)=>{
  const text=asciiDigits(value).replace(/,/g,"");
  const patterns=[
    /(?:tk|taka|৳|টাকা)\s*([0-9]+(?:\.[0-9]+)?)\s*(crore|lakh|lac|million|কোটি|লাখ)?/giu,
    /([0-9]+(?:\.[0-9]+)?)\s*(crore|lakh|lac|million|কোটি|লাখ)?\s*(?:tk|taka|৳|টাকা)/giu,
  ];
  for(const pattern of patterns){
    const match=pattern.exec(text);
    if(!match)continue;
    let amount=Number(match[1]);
    const unit=String(match[2]||"").toLowerCase();
    if(/crore|কোটি/u.test(unit)) amount*=10000000;
    else if(/lakh|lac|লাখ/u.test(unit)) amount*=100000;
    else if(/million/u.test(unit)) amount*=1000000;
    if(Number.isFinite(amount)&&amount>0)return amount;
  }
  return "";
};

const monthMap:Record<string,string>={
  january:"01",february:"02",march:"03",april:"04",may:"05",june:"06",
  july:"07",august:"08",september:"09",october:"10",november:"11",december:"12",
  "জানুয়ারি":"01","জানুয়ারি":"01","ফেব্রুয়ারি":"02","ফেব্রুয়ারি":"02","মার্চ":"03","এপ্রিল":"04","মে":"05","জুন":"06",
  "জুলাই":"07","আগস্ট":"08","সেপ্টেম্বর":"09","অক্টোবর":"10","নভেম্বর":"11","ডিসেম্বর":"12"
};

const extractBillPair=(text:string,sourcePublishedDate?:string|null)=>{
  const t=asciiDigits(text).replace(/,/g,"");
  const yearFallback=Number(sourcePublishedDate?.slice(0,4)||new Date().getUTCFullYear());
  const names="january|february|march|april|may|june|july|august|september|october|november|december|জানুয়ারি|জানুয়ারি|ফেব্রুয়ারি|ফেব্রুয়ারি|মার্চ|এপ্রিল|মে|জুন|জুলাই|আগস্ট|সেপ্টেম্বর|অক্টোবর|নভেম্বর|ডিসেম্বর";
  const re=new RegExp("("+names+")(?:\\s+(20\\d{2}))?[^।.!?]{0,90}?(?:tk|taka|৳|টাকা)?\\s*([0-9]+(?:\\.[0-9]+)?)\\s*(crore|lakh|lac|million|কোটি|লাখ)?","giu");
  const found:Array<{month:string;amount:number;index:number}>=[];
  for(const match of t.matchAll(re)){
    let amount=Number(match[3]);
    const unit=String(match[4]||"").toLowerCase();
    if(/crore|কোটি/u.test(unit))amount*=10000000;
    else if(/lakh|lac|লাখ/u.test(unit))amount*=100000;
    else if(/million/u.test(unit))amount*=1000000;
    if(!Number.isFinite(amount)||amount<=0)continue;
    const month=monthMap[String(match[1]).toLowerCase()]||monthMap[String(match[1])]||"";
    const year=Number(match[2]||yearFallback);
    if(month) found.push({month:String(year)+"-"+month,amount,index:match.index||0});
  }
  const unique=found.filter((item,index,arr)=>arr.findIndex(x=>x.month===item.month)===index);
  unique.sort((a,b)=>b.month.localeCompare(a.month)||a.index-b.index);
  if(unique.length<2)return null;
  return {
    recentBillMonth:unique[0].month,
    recentBillAmount:unique[0].amount,
    previousBillMonth:unique[1].month,
    previousBillAmount:unique[1].amount,
  };
};

const servicePhrase=(text:string)=>{
  const sentence=text.split(/(?<=[.!?।])\s+/).find(s=>/(ঘুষ|bribe|bribery)/iu.test(s))||"";
  return Array.from(sentence.trim()).slice(0,160).join("");
};

const hasValidLocation=(location:NewsIntakeBuilderLocation|null)=>{
  if(!location?.division||!location?.district)return false;
  if(location.locationScope==="district_wide")return true;
  const upazila=asText(location.upazilaOrThana);
  if(upazila)return true;
  return [location.area,location.road,location.landmark,location.formattedAddress]
    .map(asText)
    .filter(Boolean)
    .some((candidate)=>isSafeSpecificLocationText(candidate,location.district));
};

export const buildNewsIntakeSubcategoryReport=(input:NewsIntakeBuilderInput)=>{
  const {article,classification,location,incidentDate,language,feedContext}=input;
  const registeredPolicy=NEWS_INTAKE_SUBCATEGORY_BUILDERS[classification.subcategoryId];
  // Current proven subcategories keep their specialized extractors. A newly
  // published Admin subcategory no longer breaks News Intake: it receives the
  // conservative standard builder and is then validated against the live
  // published form schema before it can become Feed Ready or be published.
  const policy:BuilderPolicy=
    registeredPolicy && registeredPolicy.segmentId===classification.segmentId
      ? registeredPolicy
      : {
          segmentId:classification.segmentId,
          kind:"standard",
          frequency:"adaptive",
          basePriority:"medium",
        };

  const text=fullText(article);
  const fields=buildSourceLanguageFields(article.title,feedContext,language);
  const times=parseSourceTimes(text);
  const locationScope=
    location?.locationScope==="district_wide"
      ? "district_wide"
      : hasValidLocation(location)
        ? "specific"
        : "source_unspecified";

  const report:any={
    segmentId:classification.segmentId,
    subcategoryId:classification.subcategoryId,
    titleBn:fields.titlePrimary,
    titleEn:"",
    descriptionBn:fields.descriptionPrimary,
    descriptionEn:"",
    incidentDate:incidentDate||"",
    incidentTime:"",
    utilityEndTime:"",
    frequency:inferFrequency(text,policy.frequency),
    priority:inferPriority(text,policy.basePriority),
    division:asText(location?.division),
    district:asText(location?.district),
    upazilaOrThana:asText(location?.upazilaOrThana),
    area:asText(location?.area),
    road:asText(location?.road),
    landmark:asText(location?.landmark),
    formattedAddress:asText(location?.formattedAddress),
    relationshipContext:"",
    recentBillMonth:"",
    recentBillAmount:"",
    previousBillMonth:"",
    previousBillAmount:"",
    briberyDepartment:"",
    briberyService:"",
    briberyAmount:"",
    affectedPersonAgeGroup:"",
    allegedAbuserRelationship:"",
    reportingFor:"",
    sexualHarassmentType:"",
    sexualHarassmentContext:"",
    sexualHarassmentInstitution:"",
    intimateWhatHappened:"",
    intimatePlatform:"",
    mobJusticeDetails:null,
    customFieldAnswers:{
      sourceLanguage:fields.sourceLanguage,
      automatedIntake:true,
      trustedSourceAuto:true,
      sourceTruthMode:"approved_publisher",
      sourceOmittedFields:[],
      locationScope,
    },
  };

  if(times[0]) report.incidentTime=times[0];

  switch(policy.kind){
    case "bribery":
      report.briberyDepartment=inferBriberyDepartment(text);
      report.briberyService=servicePhrase(text);
      report.briberyAmount=parseMoneyAmount(text);
      break;
    case "harassment":
      report.affectedPersonAgeGroup=parseAgeGroup(text);
      report.allegedAbuserRelationship=inferRelationship(text);
      report.reportingFor="someone_else";
      break;
    case "sexual_harassment":
      report.affectedPersonAgeGroup=parseAgeGroup(text);
      report.allegedAbuserRelationship=inferRelationship(text);
      report.reportingFor="someone_else";
      report.sexualHarassmentType=inferSexualType(text);
      report.sexualHarassmentContext=inferSexualContext(text);
      break;
    case "mob_justice":
      report.mobJusticeDetails=inferMobDetails(text);
      break;
    case "child_safety":
      report.customFieldAnswers.childIncidentType=inferChildIncidentType(text);
      break;
    case "ride_sharing":
      report.customFieldAnswers.rideSharePlatform=inferRideSharingPlatform(text);
      report.customFieldAnswers.rideShareIncidentType=inferRideSharingIncidentType(text);
      report.customFieldAnswers.rideShareRole="unknown_not_stated";
      report.customFieldAnswers.rideShareVehicleType=inferRideSharingVehicleType(text);
      break;
    case "utility_outage":
      report.incidentTime=times[0]||"";
      report.utilityEndTime=times[1]||"";
      break;
    case "excess_bill": {
      const bills=extractBillPair(text,article.sourcePublishedDate);
      if(bills) Object.assign(report,bills);
      break;
    }
  }

  const omitted:string[]=[];
  if(!incidentDate && classification.subcategoryId!=="excess-electricity-bill") omitted.push("incidentDate");
  if(!hasValidLocation(location)) omitted.push("location");
  report.customFieldAnswers.sourceOmittedFields=omitted;

  return {
    source:{
      sourceType:"news",
      publisherName:article.publisherName,
      sourceTitle:article.title,
      canonicalUrl:article.canonicalUrl,
      sourcePublishedDate:article.sourcePublishedDate||"",
    },
    report,
  };
};

export const missingNewsIntakeSubcategoryFields=(report:any)=>{
  const missing:string[]=[];
  const text=(value:unknown)=>asText(value);
  const subcategory=text(report?.subcategoryId);
  const registeredPolicy=NEWS_INTAKE_SUBCATEGORY_BUILDERS[subcategory];
  const policy:BuilderPolicy=
    registeredPolicy || {
      segmentId:text(report?.segmentId),
      kind:"standard",
      frequency:"adaptive",
      basePriority:"medium",
    };

  if(sourceTextLength(report?.descriptionBn)<400||sourceTextLength(report?.descriptionBn)>800){
    missing.push("description400To800");
  }

  if(!text(report?.incidentDate)&&subcategory!=="excess-electricity-bill") missing.push("incidentDate");

  const scope=text(report?.customFieldAnswers?.locationScope);
  const location:NewsIntakeBuilderLocation={
    division:report?.division,district:report?.district,upazilaOrThana:report?.upazilaOrThana,
    area:report?.area,road:report?.road,landmark:report?.landmark,formattedAddress:report?.formattedAddress,
    locationScope:scope,
  };
  if(!hasValidLocation(location)) missing.push("location");

  for(const key of ["area","road","landmark","formattedAddress"]){
    const value=text(report?.[key]);
    if(value&&!isSafeSpecificLocationText(value,report?.district)) missing.push("locationQuality");
  }

  if(policy.kind==="utility_outage"&&!text(report?.incidentTime)) missing.push("incidentTime");

  if(policy.kind==="excess_bill"){
    if(!text(report?.recentBillMonth)) missing.push("recentBillMonth");
    if(!(Number(report?.recentBillAmount)>0)) missing.push("recentBillAmount");
    if(!text(report?.previousBillMonth)) missing.push("previousBillMonth");
    if(!(Number(report?.previousBillAmount)>0)) missing.push("previousBillAmount");
  }

  if(policy.kind==="harassment"||policy.kind==="sexual_harassment"){
    if(!text(report?.affectedPersonAgeGroup)) missing.push("affectedPersonAgeGroup");
    if(!text(report?.allegedAbuserRelationship)) missing.push("allegedAbuserRelationship");
    if(!text(report?.reportingFor)) missing.push("reportingFor");
  }

  if(policy.kind==="sexual_harassment"){
    if(!text(report?.sexualHarassmentType)) missing.push("sexualHarassmentType");
    if(!text(report?.sexualHarassmentContext)) missing.push("sexualHarassmentContext");
  }

  if(policy.kind==="child_safety"&&!text(report?.customFieldAnswers?.childIncidentType)){
    missing.push("childIncidentType");
  }

  if(policy.kind==="ride_sharing"){
    if(!text(report?.customFieldAnswers?.rideSharePlatform)) missing.push("rideSharePlatform");
    if(!text(report?.customFieldAnswers?.rideShareIncidentType)) missing.push("rideShareIncidentType");
    if(!text(report?.customFieldAnswers?.rideShareRole)) missing.push("rideShareRole");
  }

  if(policy.kind==="mob_justice"){
    if(!text(report?.mobJusticeDetails?.trigger)) missing.push("mobJusticeTrigger");
    if(!text(report?.mobJusticeDetails?.outcome)) missing.push("mobJusticeOutcome");
    if(!text(report?.mobJusticeDetails?.ongoingStatus)) missing.push("mobJusticeOngoingStatus");
  }

  return Array.from(new Set(missing));
};
