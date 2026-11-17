import test from 'node:test';
import assert from 'node:assert/strict';
import {
  braveSearch, searxngSearch, serpApiSearch, configuredProviders, searchWithFallback,
} from '../scripts/search-providers.mjs';

const recipe = { query:'metal fabrication excel inventory', gl:'us' };
const json = data => ({status:200,ok:true,json:async()=>data});

test('Brave adapter parses results without leaking its private token into URLs', async () => {
  let token,requestUrl;
  const fetchFn=async (url,opts)=>{
    token=opts.headers['X-Subscription-Token']; requestUrl=String(url);
    return json({web:{results:[{title:'Metal Plant',url:'https://example.org/jobs',description:'Excel material stock'}]}});
  };
  const results=await braveSearch('test-brave-key',recipe,fetchFn);
  assert.equal(token,'test-brave-key');
  assert.ok(!requestUrl.includes('test-brave-key'));
  assert.equal(results[0].provider,'brave');
  assert.equal(results[0].link,'https://example.org/jobs');
});

test('SearXNG accepts only locally hosted URLs and JSON arrays', async () => {
  const results=await searxngSearch('http://127.0.0.1:8888',recipe,async()=>json({results:[
    {title:'Metal Works',url:'https://metal.example.com',content:'Stock reconciliation'},
  ]}));
  assert.equal(results[0].provider,'searxng');
  await assert.rejects(()=>searxngSearch('https://untrusted-search.example',recipe,async()=>json({results:[]})),/localhost/);
});

test('SerpAPI adapter preserves conventional organic results',async()=>{
  const results=await serpApiSearch('test-serp-key',recipe,async()=>json({organic_results:[
    {title:'Steel Shop',link:'https://steel.example.com',snippet:'Production planning'},
  ]}));
  assert.equal(results[0].provider,'serpapi');
});

test('Unusable SerpAPI falls back to a configured Brave provider', async()=>{
  let calls=0;
  const providers=[
    {name:'serpapi',search:async()=>{calls++;throw new Error('SerpAPI HTTP 401');}},
    {name:'brave',search:async()=>{calls++;return [{title:'Steel Shop',link:'https://steel.example.com',snippet:'Excel'}];}},
  ];
  const a=await searchWithFallback(providers,recipe);
  assert.equal(a.provider,'brave');
  assert.equal(a.results.length,1);
  assert.equal(providers[0].disabled,true);
  const b=await searchWithFallback(providers,recipe);
  assert.equal(b.provider,'brave');
  assert.equal(calls,3);
});

test('No provider is configured without keys or a local SearXNG URL',()=>{
  assert.equal(configuredProviders({}).length,0);
  assert.equal(configuredProviders({braveKey:'a',searxngUrl:'http://localhost:8888'}).length,2);
});
