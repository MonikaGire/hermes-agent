#!/usr/bin/env node
/**
 * Read-only metal ERP lead pilot.
 *
 * Requirements: Node.js 22+, a SerpAPI key. No MongoDB, Redis, SMTP,
 * Gmail, AI model, outbound email or user account is needed.
 * Search excerpts are only potential evidence, never "verified buyers".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = path.join(projectRoot, 'pilot-results');

const searchRecipes = [
  { sector: 'Sheet metal fabrication', country: 'USA', gl: 'us', query: '"sheet metal fabrication" "Excel" "inventory" -software' },
  { sector: 'Sheet metal fabrication', country: 'USA', gl: 'us', query: '"metal fabrication" "ERP implementation" "jobs"' },
  { sector: 'Steel service centres', country: 'USA', gl: 'us', query: '"steel service center" "stock reconciliation" -software' },
  { sector: 'Laser cutting', country: 'UK', gl: 'uk', query: '"laser cutting" "job costing" "spreadsheet"' },
  { sector: 'Sheet metal fabrication', country: 'UK', gl: 'uk', query: '"sheet metal" "production planning" "Excel" vacancies' },
  { sector: 'Metal stockholders', country: 'UK', gl: 'uk', query: '"steel stockholder" "inventory management" "manual"' },
  { sector: 'Laser cutting', country: 'Australia', gl: 'au', query: '"laser cutting" "material tracking" "Excel" jobs' },
  { sector: 'Metal fabrication', country: 'Australia', gl: 'au', query: '"metal fabrication" "ERP" "implementation" hiring' },
  { sector: 'Steel fabrication', country: 'Australia', gl: 'au', query: '"steel fabrication" "stock reconciliation" "ERP"' },
  { sector: 'Metal fabrication', country: 'UAE', gl: 'ae', query: '"metal fabrication" "inventory system" "implementation"' },
  { sector: 'Steel processing', country: 'UAE', gl: 'ae', query: '"steel processing" "Excel" "stock" manufacturing' },
  { sector: 'Steel fabrication', country: 'UAE', gl: 'ae', query: '"steel fabrication" "production planning" "manual" jobs' },
];

const excludedHostnames = [
  'google.com','linkedin.com','indeed.com','glassdoor.com','facebook.com',
  'reddit.com','youtube.com','ziprecruiter.com','naukri.com','jobstreet.com',
  'monster.com','apollo.io','clutch.co','yellowpages.com','g2.com',
  'capterra.com','softwareadvice.com','serpapi.com','workday.com',
  'lever.co','greenhouse.io','amazon.com','wikipedia.org','crunchbase.com',
  'pinterest.com','instagram.com','prnewswire.com','businesswire.com',
  'scribd.com','slideshare.net','quora.com'
];
const metalTerms = /\b(?:steel|sheet[\s-]?metal|metal[\s-]?(?:fabricat\w*|process\w*|work\w*)|laser[\s-]?cut\w*|cnc|machin\w*|weld\w*|stainless|alumin(?:um|ium)|offcuts?|remnants?|coil[\s-]?slitt\w*|rebar)\b/i;
const selectionTerms = /(?:\b(?:erp|mrp|inventory|production|warehouse)\s+(?:software|system|platform)\b.{0,110}\b(?:select\w*|evaluat\w*|replac\w*|implement\w*|migrat\w*|procure\w*|rfp|tender|build\w*|develop\w*)\b|\b(?:select\w*|evaluat\w*|replac\w*|implement\w*|migrat\w*|procure\w*|rfp|tender|build\w*|develop\w*)\b.{0,110}\b(?:erp|mrp|inventory|production|warehouse)\s+(?:software|system|platform)\b)/i;
const painTerms = /\b(?:excel|spreadsheet\w*|manual(?:ly)?|paper[\s-]?based|(?:stock|inventory)[\s-]?(?:discrepanc\w*|varianc\w*|reconcil\w*)|offcuts?|remnants?|material[\s-]?(?:shortag\w*|traceab\w*)|heat[\s-]?number|job[\s-]?cost\w*|work[\s-]?in[\s-]?progress|production[\s-]?(?:delay\w*|bottleneck\w*|planning)|quotation[\s-]?register\w*|duplicat\w*[\s-]?entr\w*)\b/i;

function csvCell(value) {
  const text = String(value ?? '').replace(/[\r\n]+/g, ' ').trim();
  // Prevent spreadsheet formula injection from untrusted search content.
  const safe = /^[=+\-@\t]/.test(text) ? "'" + text : text;
  return '"' + safe.replace(/"/g, '""') + '"';
}
function csv(rows, keys) {
  return [keys.map(csvCell).join(','), ...rows.map(row => keys.map(k => csvCell(row[k])).join(','))].join('\r\n') + '\r\n';
}
function hostOf(url) {
  try {
    const u = new URL(url);
    if (!['http:', 'https:'].includes(u.protocol)) return null;
    if (u.username || u.password) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./,'');
    if (!host.includes('.') || host.endsWith('.local') || host === 'localhost' || /^(\d+\.){3}\d+$/.test(host)) return null;
    if (excludedHostnames.some(x => host === x || host.endsWith('.' + x))) return null;
    return host;
  } catch { return null; }
}
function classify(row) {
  const combined = (row.title + ' ' + row.snippet).replace(/\s+/g,' ');
  if (!metalTerms.test(combined)) return { status:'NOT_METAL_SPECIFIC', signal:'none' };
  const signal = selectionTerms.test(combined) ? 'software_selection' : painTerms.test(combined) ? 'operational_pain' : 'none';
  if (signal === 'none') return { status:'NO_DOCUMENTED_SIGNAL', signal };
  if (!hostOf(row.source_url)) return { status:'THIRD_PARTY_NEEDS_COMPANY_MATCH', signal };
  return { status:'REVIEW_FIRST_PARTY_SOURCE', signal };
}
function getKey() {
  const fromEnv = process.env.SERPAPI_KEY?.trim();
  if (fromEnv && !/^(your-|placeholder|replace|sk-\.{3})/i.test(fromEnv)) return fromEnv;
  const dotenv = path.join(projectRoot,'.env');
  if (!fs.existsSync(dotenv)) return '';
  const match = fs.readFileSync(dotenv,'utf8').match(/^\s*SERPAPI_KEY\s*=\s*(.+?)\s*$/m);
  const key = match?.[1]?.replace(/^['"]|['"]$/g,'').trim() ?? '';
  return key && !/^(your-|placeholder|replace)/i.test(key) ? key : '';
}
async function fetchSerpApi(key, recipe) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine','google');
  url.searchParams.set('q',recipe.query);
  url.searchParams.set('num','10');
  url.searchParams.set('hl','en');
  url.searchParams.set('gl',recipe.gl);
  url.searchParams.set('api_key',key);
  const response = await fetch(url, { signal: AbortSignal.timeout(35000) });
  if (!response.ok) throw new Error('Search provider returned HTTP ' + response.status);
  const body = await response.json();
  if (body.error) throw new Error(String(body.error).slice(0,180));
  if (!Array.isArray(body.organic_results)) throw new Error('Search provider returned no organic results array');
  return body.organic_results;
}

async function main() {
  if (process.argv.includes('--self-test')) {
    const a = classify({ title:'Example Steel fabrication inventory job',snippet:'We track stock in Excel spreadsheets and reconcile heat numbers',source_url:'https://example-steel.com/careers/stock' });
    const b = classify({ title:'Manufacturer jobs',snippet:'Metal fabricator uses manual steel stock management',source_url:'https://linkedin.com/jobs/123' });
    const c = csv([{title:'=HYPERLINK("malicious")'}],['title']);
    if (a.status !== 'REVIEW_FIRST_PARTY_SOURCE' || b.status !== 'THIRD_PARTY_NEEDS_COMPANY_MATCH' || !c.includes("'=HYPERLINK")) {
      throw new Error('Pilot classifier self-test failed: first_party=' + a.status + ', third_party=' + b.status + ', csv_escaped=' + c.includes("'=HYPERLINK"));
    }
    console.log('Pilot self-tests passed. No network requests or emails were sent.');
    return;
  }
  const key=getKey();
  if(!key) {
    console.error('SerpAPI key missing. Set SERPAPI_KEY in this project .env or provide it privately to the Windows launcher.');
    process.exitCode=2;
    return;
  }

  console.log('Read-only metal ERP lead pilot: NO emails, NO CRM imports, NO database changes.');
  const all=[];
  const errors=[];
  for(let i=0;i<searchRecipes.length;i++){
    const recipe=searchRecipes[i];
    process.stdout.write('Searching ' + (i+1) + '/' + searchRecipes.length + ': ' + recipe.sector + ' / ' + recipe.country + '\n');
    try {
      const results=await fetchSerpApi(key,recipe);
      for(const item of results) {
        const row={
          sector:recipe.sector,country:recipe.country,search_query:recipe.query,
          title:item.title||'',snippet:item.snippet||'',source_url:item.link||'',
          published_at:item.date||'',company_domain:hostOf(item.link||'')||'',
        };
        Object.assign(row,classify(row));
        all.push(row);
      }
    }catch(e){errors.push(recipe.country + ' / ' + recipe.sector + ': ' + (e?.message||String(e)));}
  }

  const dedup=new Map();
  for(const row of all){
    const url=row.source_url.replace(/#.*$/,'');
    if(url && !dedup.has(url)) dedup.set(url,row);
  }
  const unique=[...dedup.values()];
  const prioritized=unique.filter(x=>x.status==='REVIEW_FIRST_PARTY_SOURCE').sort((a,b)=>(a.signal==='software_selection'?0:1)-(b.signal==='software_selection'?0:1));
  const thirdParty=unique.filter(x=>x.status==='THIRD_PARTY_NEEDS_COMPANY_MATCH');
  fs.mkdirSync(outputDir,{recursive:true});
  const day=new Date().toISOString().slice(0,10);
  const prefix='metal-erp-pilot-' + day;
  const candidatePath=path.join(outputDir,prefix+'-REVIEW.csv');
  const allPath=path.join(outputDir,prefix+'-ALL-SEARCH-RESULTS.csv');
  const thirdPath=path.join(outputDir,prefix+'-THIRD-PARTY.csv');
  const keys=['sector','country','signal','status','company_domain','title','snippet','source_url','published_at','search_query'];
  fs.writeFileSync(candidatePath,csv(prioritized,keys),'utf8');
  fs.writeFileSync(allPath,csv(unique,keys),'utf8');
  fs.writeFileSync(thirdPath,csv(thirdParty,keys),'utf8');
  const report=[
    'HERMES - METAL ERP LEAD RESEARCH PILOT',
    'Date: '+new Date().toISOString(),
    'Live search queries attempted: '+searchRecipes.length,
    'Unique search results: '+unique.length,
    'First-party evidence candidates for HUMAN REVIEW: '+prioritized.length,
    'Third-party clues needing company matching: '+thirdParty.length,
    'Search errors: '+errors.length,
    '',
    'Important: These are search-result clues, NOT verified buyers, decision-makers, or send-ready leads.',
    'The script does not read your database or send emails.',
    'Review every source URL, employer identity, date and buying stage before contacting anyone.',
    '',
    'FILES:',
    candidatePath,thirdPath,allPath,
    '',
    'ERRORS:',
    ...(errors.length?errors:['None']),
  ].join('\r\n');
  fs.writeFileSync(path.join(outputDir,prefix+'-SUMMARY.txt'),report,'utf8');
  console.log('\n'+report);
  if(errors.length===searchRecipes.length){process.exitCode=1;}
}

main().catch(err=>{console.error('Pilot failed: '+(err?.message||String(err)));process.exitCode=1;});
