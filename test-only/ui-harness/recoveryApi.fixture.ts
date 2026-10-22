// Browser-only synthetic fixture. Built separately from deployable dist.
// NEVER imported into production. All writes mutate local in-memory test data.
const keys = ['harassment','load_shedding','extortion','public_safety','road_transport','illegal_occupation','rickshaw'];
const images = ['harassment-hero-public-harassment-v02.jpg','load-shedding-hero-family-blackout-v01.jpg',
  'extortion-hero-shopkeeper-coercion-v02.jpg','public-safety-hero-rickshaw-snatching-reconstructed-v01.jpg',
  'road-transport-hero-broken-road-rickshaw-reconstructed-v01.jpg',
  'illegal-occupation-hero-footpath-encroachment-reconstructed-v01.jpg',
  'rickshaw-hero-illegal-charging-station-v02.jpg'];
const clone = <T,>(v:T):T => structuredClone(v);
const longBn = 'ক'.repeat(60);
const longEn = 'E'.repeat(62);
const makeBanner = (key:string, i:number) => ({
  category_key:key, version:1, draft_updated_at:'2026-10-21T10:00:00Z',
  published_at:'2026-10-21T10:00:00Z',
  draft_content: {
    titleBn:'পরীক্ষামূলক ব্যানার '+(i+1),titleEn:'Synthetic banner '+(i+1),
    mobileDescriptionBn:longBn,tabletDescriptionBn:longBn,desktopDescriptionBn:longBn,
    mobileDescriptionEn:longEn,tabletDescriptionEn:longEn,desktopDescriptionEn:longEn,
    illustrationSrc:'/illustrations/services/'+images[i],
    primaryCtaBn:'প্রতিবেদন করুন',primaryCtaEn:'Report now',
    isActive:true,showOnHome:true,sortOrder:i+1,
  },
  published_content:{} as Record<string,unknown>,
});
const banners = keys.map(makeBanner);
for(const row of banners)row.published_content=clone(row.draft_content);
const report = {
  titleBn:'নিরাপদ কৃত্রিম প্রতিবেদন',titleEn:'Synthetic reviewed report',
  descriptionBn:'প্রকাশনার পূর্বে সুরক্ষিত পর্যালোচনা',descriptionEn:'Reviewed fixture description',
  segmentId:'public_safety',subcategoryId:'test-safety',
  district:'Dhaka',incidentDate:'2026-10-20',
};
const article = (id:string, overrides: Record<string,unknown>={}) => ({
  id,itemKind:'article',action:'created_draft',duplicateStatus:'clear',reportId:null,
  sourceTitle:'Synthetic article '+id,publisherName:'Fixture publisher',
  sourceHostname:'fixture.example',sourcePublishedDate:'2026-10-20',
  canonicalUrl:'https://fixture.example/article/'+id,
  contentLanguage:'en',
  reviewPayload:{source:{canonicalUrl:'https://fixture.example/article/'+id,publisherName:'Fixture publisher',sourceType:'news'},report},
  ...overrides,
});
let entries = [
  article('ready'),
  article('held',{action:'skip_duplicate',duplicateStatus:'exact'}),
  article('needs-review',{action:'needs_review'}),
  article('resumable',{reportId:'synthetic-submitted-1',reviewPayload:null}),
  article('already-published',{reportId:'synthetic-published-1',reviewPayload:null}),
  {id:'source-error-tbs',itemKind:'source',action:'error',sourceHostname:'www.tbsnews.net',reason:'Source returned HTTP 403.'},
  {id:'source-error-star',itemKind:'source',action:'error',sourceHostname:'www.thedailystar.net',reason:'Source returned HTTP 403.'},
];
const events: string[] = [];
let mode:'ready'|'duplicate'|'uncertain'|'reject'='ready';
const statuses:Record<string,string> = {'synthetic-submitted-1':'submitted','synthetic-published-1':'published'};
const api = { events,
  getMode:()=>mode,
  setMode:(m:typeof mode)=>{mode=m;events.push('mode:'+m);},
  getArticles:()=>clone(entries),
  getBanners:()=>clone(banners),
  clearEvents:()=>{events.length=0;},
};
declare global { interface Window { __recoveryFixture:typeof api } }
window.__recoveryFixture=api;

export const recoveryApi={
  async getNewsIntake(){
    events.push('news:read');
    return clone({
      dashboard:{
        sources:[],automation:{enabled:false,intervalHours:36},
        runs:[{
          triggerType:'manual',status:'partial',startedAt:'2026-10-21T10:00:00Z',
          errorCount:2,sourceCount:7,createdCount:0,items:entries,
        }],
      },
      scanSources:[],taxonomy:{
        segments:[{id:'public_safety',nameEn:'Public Safety',nameBn:'জননিরাপত্তা'}],
        subcategories:[{id:'test-safety',nameEn:'Safety report',nameBn:'নিরাপত্তা'}],
      },
    });
  },
  async scanNewsIntake(){ events.push('scan:manual');return {success:true}; },
  async getNewsSourcePreview(url:string) {
    events.push('source:preview');
    return {approved:true,canonicalUrl:url,sourceTitle:'Synthetic approved source',
      publisherName:'Fixture publisher',sourcePublishedDate:'2026-10-20',
      descriptionPreview:'Controlled test article: no personal information.',hostname:'fixture.example'};
  },
  async checkNewsSourceDuplicate(url:string){
    events.push('duplicate:check');
    if(url.endsWith('/resumable'))return {duplicate:true,complaintId:'synthetic-submitted-1',complaintStatus:statuses['synthetic-submitted-1']};
    if(url.endsWith('/already-published'))return {duplicate:true,complaintId:'synthetic-published-1',complaintStatus:statuses['synthetic-published-1']};
    return {duplicate:false};
  },
  async previewSourcedReport(_payload:Record<string,unknown>){
    events.push('preflight');
    return {report,canCreateDraft:true,canPublishImmediately:mode!=='duplicate',
      duplicate:{status:mode==='duplicate'?'exact':'clear'},schemaValidation:{ready:true}};
  },
  async createSourcedReport(payload:Record<string,unknown>){
    events.push('create');
    const source=payload?.source as {canonicalUrl?:string}|undefined;
    if(!source?.canonicalUrl)throw new Error('Synthetic source contract missing');
    return {reportId:'synthetic-created-1'};
  },
  async completeNewsItemReview(_itemId:string,_reportId:string){
    events.push('review');return {ready:mode!=='reject'};
  },
  async publishSourcedReport(reportId:string){
    events.push('publish');
    if(mode==='uncertain')throw new Error('Synthetic timeout: outcome unknown');
    if(mode==='reject')throw Object.assign(new Error('Synthetic rejection'),{outcome:'rejected'});
    statuses[reportId]='published';
    return {success:true,status:'published'};
  },
  async getBannerRows(){
    events.push('banner:read');
    return clone([...banners].sort((a,b)=>Number(a.draft_content.sortOrder)-Number(b.draft_content.sortOrder)));
  },
  async saveBannerDraft(key:string, content:Record<string,unknown>){
    events.push('banner:save:'+key);
    const row=banners.find(x=>x.category_key===key);
    if(!row)throw new Error('Unknown synthetic banner');
    row.draft_content=clone(content) as typeof row.draft_content;
    row.version++;
    return {success:true};
  },
  async publishBanner(key:string){
    events.push('banner:publish:'+key);
    const row=banners.find(x=>x.category_key===key);
    if(!row)throw new Error('Unknown synthetic banner');
    row.published_content=clone(row.draft_content);
    row.version++;
    return {success:true};
  },
};
