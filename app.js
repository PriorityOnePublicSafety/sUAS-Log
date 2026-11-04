const DB="suas-flight-logger", STORE="records", ACTIVE="activeFlight";
const SHEET_KEY="suasGoogleSheetId";
const MASTER_SHEET_ID="1lNUgg_z4n8huxdvIssJ-czXcaoI8drAEHFd-u0x3HoQ";
let db, active=null, tick=null, tokenClient=null, accessToken=null, syncing=false;
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(mode,fn){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let result;try{result=fn(s)}catch(e){reject(e);return}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);});}
function getAll(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}

async function migrateLocalDurations(){
  const rows=await getAll();
  for(const r of rows){
    if(!Number.isFinite(Number(r.flightMinutes))){
      r.flightMinutes=getFlightMinutes(r);
      delete r.flightHours;
      await tx("readwrite",store=>store.put(r));
    }
  }
}
function saveActive(){localStorage.setItem(ACTIVE,JSON.stringify(active));}
function localDate(iso){return new Intl.DateTimeFormat("en-US",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(iso));}
function getFlightMinutes(r){if(Number.isFinite(Number(r.flightMinutes)))return Math.max(0,Math.round(Number(r.flightMinutes)));if(Number.isFinite(Number(r.flightHours)))return Math.max(0,Math.round(Number(r.flightHours)*60));return 0;}
function formatMinutes(value){const n=Math.max(0,Math.round(Number(value)||0)),h=Math.floor(n/60),m=n%60;return h?`${h} hr${h===1?"":"s"}${m?` ${m} min`:""}`:`${m} min`;}
function duration(ms){return formatMinutes(Math.max(0,Math.round(ms/60000)));}
function dateInputValue(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function recordDate(r){return r.flightDate|| (r.takeoffISO?dateInputValue(new Date(r.takeoffISO)):"");}
function recordSortKey(r){return r.takeoffISO?new Date(r.takeoffISO).getTime():new Date((r.flightDate||"1970-01-01")+"T00:00:00").getTime();}
function recordTimeText(r){const d=recordDate(r);const t=r.takeoffISO?new Date(r.takeoffISO).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}):"";const e=r.landingISO?new Date(r.landingISO).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}):"";return `${d}${t||e?" · ":""}${t?"Takeoff "+t:""}${t&&e?" – ":""}${e?"Landing "+e:""}`;}
function showActive(){const box=$("active");box.classList.toggle("hidden",!active);$("start").disabled=!!active;$("end").disabled=!active;if(active){$("startedAt").textContent="Takeoff: "+localDate(active.takeoffISO);updateElapsed();if(tick)clearInterval(tick);tick=setInterval(updateElapsed,1000);}else if(tick){clearInterval(tick);tick=null;}}
function updateElapsed(){if(active)$("elapsed").textContent=duration(Date.now()-new Date(active.takeoffISO).getTime());}
function formData(){return {pilot:$("pilot").value.trim()||"Jacob Griffin",aircraft:$("aircraft").value,controller:$("controller").value,flightType:$("flightType").value,operation:$("operation").value,location:$("location").value.trim(),notes:$("notes").value.trim()};}
$("start").addEventListener("click",()=>{if(active)return;active={...formData(),id:crypto.randomUUID(),takeoffISO:new Date().toISOString()};saveActive();showActive();$("message").textContent="Flight started. You can close the app; the active flight is saved on this device.";});
$("end").addEventListener("click",async()=>{if(!active)return;const landingISO=new Date().toISOString(),flightMinutes=Math.max(1,Math.round((new Date(landingISO)-new Date(active.takeoffISO))/60000));const record={...active,landingISO,flightMinutes,createdISO:new Date().toISOString(),syncStatus:"Local only"};await tx("readwrite",s=>s.put(record));active=null;localStorage.removeItem(ACTIVE);showActive();$("location").value="";$("notes").value="";await render();$("message").textContent="Flight saved on this device.";if(accessToken)syncFlights();});
async function render(){const rows=(await getAll()).sort((a,b)=>recordSortKey(b)-recordSortKey(a));$("flightCount").textContent=rows.length;$("totalHours").textContent=formatMinutes(rows.reduce((n,r)=>n+getFlightMinutes(r),0));$("history").innerHTML=rows.length?rows.map(r=>`<div class="history-item"><span class="duration">${formatMinutes(getFlightMinutes(r))}</span><div class="history-title">${esc(r.aircraft)} · ${esc(r.operation)}</div><div class="history-meta">${esc(recordTimeText(r))}<br>${esc(r.pilot)} · ${esc(r.flightType)} · ${esc(r.controller)}${r.location?"<br>"+esc(r.location):""}${r.notes?"<div class=\"history-notes\">Notes: "+esc(r.notes)+"</div>":""}<br>${r.entrySource==="Manual Entry"?"✎ Manual entry · ":""}${r.syncStatus==="Synced to Google Sheets"?"☁ Synced":"● Stored on this device"}</div></div>`).join(""):'<p class="empty">No completed flights yet.</p>';renderDashboard(rows);}
function renderDashboard(allRows){
  const now=new Date(),period=$("dashboardPeriod")?.value||"all";let start=null;
  if(period==="year")start=new Date(now.getFullYear(),0,1);
  if(period==="12m")start=new Date(now.getFullYear(),now.getMonth()-11,1);
  if(period==="month")start=new Date(now.getFullYear(),now.getMonth(),1);
  const rows=allRows.filter(r=>{const d=recordDate(r);if(!d)return period==="all";const dt=new Date(d+"T00:00:00");return !start||dt>=start;});
  const total=rows.reduce((n,r)=>n+getFlightMinutes(r),0);
  const yearStart=new Date(now.getFullYear(),0,1);
  const yearTotal=allRows.filter(r=>{const d=recordDate(r);return d&&new Date(d+"T00:00:00")>=yearStart;}).reduce((n,r)=>n+getFlightMinutes(r),0);
  $("dashFlights").textContent=rows.length;$("dashMinutes").textContent=formatMinutes(total);$("dashAircraft").textContent=new Set(rows.map(r=>r.aircraft).filter(Boolean)).size;$("dashYearMinutes").textContent=formatMinutes(yearTotal);
  const group=(key)=>{const m=new Map();for(const r of rows){const label=(r[key]||"Not specified").trim()||"Not specified";m.set(label,(m.get(label)||0)+getFlightMinutes(r));}return [...m.entries()].sort((a,b)=>b[1]-a[1]);};
  const drawBars=(id,items)=>{const el=$(id);if(!items.length){el.innerHTML='<p class="empty">No flight data for this period.</p>';return;}const max=Math.max(1,...items.map(x=>x[1]));el.innerHTML=items.map(([name,mins])=>`<div class="bar-row"><div class="bar-label"><span>${esc(name)}</span><strong>${esc(formatMinutes(mins))}</strong></div><div class="bar-track"><div class="bar-fill" style="width:${Math.max(1,mins/max*100)}%"></div></div></div>`).join("");};
  const aircraftGroups=new Map();
  for(const r of rows){const name=(r.aircraft||"Not specified").trim()||"Not specified";const item=aircraftGroups.get(name)||{flights:0,minutes:0};item.flights++;item.minutes+=getFlightMinutes(r);aircraftGroups.set(name,item);}
  const aircraftItems=[...aircraftGroups.entries()].sort((a,b)=>b[1].minutes-a[1].minutes);
  const aircraftEl=$("aircraftBreakdown");
  if(!aircraftItems.length){aircraftEl.innerHTML='<p class="empty">No flight data for this period.</p>';}
  else{aircraftEl.innerHTML='<div class="aircraft-table-wrap"><table class="aircraft-table"><thead><tr><th>Aircraft</th><th>Flights</th><th>Flight time</th><th>Share</th></tr></thead><tbody>'+aircraftItems.map(([name,v])=>`<tr><td>${esc(name)}</td><td>${v.flights}</td><td>${esc(formatMinutes(v.minutes))}</td><td>${total?Math.round(v.minutes/total*100):0}%</td></tr>`).join('')+'</tbody></table></div>';}
  drawBars("missionChart",group("operation"));drawBars("flightTypeChart",group("flightType"));drawBars("pilotChart",group("pilot"));
  const monthBase=period==="year"?new Date(now.getFullYear(),0,1):new Date(now.getFullYear(),now.getMonth()-11,1);
  const months=[];for(let i=0;i<12;i++){const d=new Date(monthBase.getFullYear(),monthBase.getMonth()+i,1);months.push({key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`,label:d.toLocaleDateString("en-US",{month:"short"}),mins:0});}
  const byMonth=new Map(months.map(m=>[m.key,m]));for(const r of rows){const d=recordDate(r);if(d){const m=byMonth.get(d.slice(0,7));if(m)m.mins+=getFlightMinutes(r);}}
  const maxMonth=Math.max(1,...months.map(m=>m.mins));$("monthlyChart").innerHTML=months.map(m=>`<div class="month-col"><div class="month-value">${m.mins?esc(formatMinutes(m.mins)):""}</div><div class="month-track"><div class="month-fill" style="height:${m.mins?Math.max(2,m.mins/maxMonth*100):0}%"></div></div><span>${m.label}</span></div>`).join("");
}
$("dashboardPeriod").addEventListener("change",async()=>render());
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("export").addEventListener("click",async()=>{const rows=await getAll();const cols=["Record ID","Date","Takeoff Time","Landing Time","Flight Minutes","Aircraft","Flight Type","Location / Operation","Pilot","Notes","Controller","Operation Type","Entry Source"];const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const data=[cols.join(","),...rows.sort((a,b)=>recordSortKey(a)-recordSortKey(b)).map(r=>{const d=r.takeoffISO?new Date(r.takeoffISO):null,end=r.landingISO?new Date(r.landingISO):null;return [r.id,recordDate(r),d?d.toLocaleTimeString("en-GB",{hour12:false}):"",end?end.toLocaleTimeString("en-GB",{hour12:false}):"",getFlightMinutes(r),r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation,r.entrySource||"Live Recorded"].map(q).join(",");})].join("\r\n");const blob=new Blob(["\ufeff"+data],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sUAS_Flight_Log.csv";a.click();URL.revokeObjectURL(url);});
function setSyncMessage(s){$("syncMessage").textContent=s;}
// Local data management. These actions never modify the Google Sheet.
async function clearLocalData(){
  const confirmed=window.confirm("Delete ALL flight records stored on THIS device, including any active flight? This cannot be undone. Your Google Sheet and Google connection settings will not be changed.");
  if(!confirmed)return;
  try{
    await tx("readwrite",store=>store.clear());
    active=null;localStorage.removeItem(ACTIVE);showActive();
    await render();
    $("message").textContent="Local flight records cleared on this device. Your Google Sheet and connection settings were preserved.";
    setSyncMessage("Local records cleared. Use Merge or Replace from Google Sheets to restore records to this device.");
  }catch(e){$("message").textContent="Could not clear local records: "+e.message;}
}
$("clearLocalTests").addEventListener("click",clearLocalData);

function sheetDate(value){
  const v=String(value??"").trim();
  if(!v)return "";
  // Accept ISO dates only when the calendar date is real.
  const iso=v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(iso){const y=Number(iso[1]),m=Number(iso[2]),d=Number(iso[3]);const check=new Date(Date.UTC(y,m-1,d));return check.getUTCFullYear()===y&&check.getUTCMonth()===m-1&&check.getUTCDate()===d?v:"";}
  // Google Sheets may return a serial date when a cell is formatted as a date.
  const n=Number(v);
  if(Number.isFinite(n)&&n>20000&&n<80000){const dt=new Date(Date.UTC(1899,11,30)+n*86400000);return Number.isNaN(dt.getTime())?"":dt.toISOString().slice(0,10);}
  const parsed=new Date(v);if(!Number.isNaN(parsed.getTime()))return dateInputValue(parsed);
  return "";
}
function sheetTime(value){
  if(value===null||value===undefined||value==="")return "";
  const v=String(value).trim();if(!v)return "";
  // Google Sheets UNFORMATTED_VALUE normally returns times as a fraction of a day.
  const n=Number(v);
  if(Number.isFinite(n)&&n>=0&&n<1){const sec=Math.round(n*86400)%86400;return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(x=>String(x).padStart(2,"0")).join(":");}
  // Accept 24-hour times and validate each component before creating a Date.
  const m=v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if(m){const h=Number(m[1]),min=Number(m[2]),sec=Number(m[3]||0);if(h<=23&&min<=59&&sec<=59)return [h,min,sec].map(x=>String(x).padStart(2,"0")).join(":");return "";}
  // Also accept common 12-hour values if the sheet was formatted as text.
  const ap=v.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if(ap){let h=Number(ap[1]),min=Number(ap[2]),sec=Number(ap[3]||0);if(h<1||h>12||min>59||sec>59)return "";h=h%12+(ap[4].toUpperCase()==="PM"?12:0);return [h,min,sec].map(x=>String(x).padStart(2,"0")).join(":");}
  return "";
}
function safeSheetISO(date,time){
  if(!date||!time)return null;
  const d=new Date(`${date}T${time}`);
  return Number.isNaN(d.getTime())?null:d.toISOString();
}
function sheetRowToRecord(row){
  const [id,date,takeoff,landing,minutes,aircraft,flightType,location,pilot,notes,controller,operation,entrySource]=row;
  const flightDate=sheetDate(date),takeoffTime=sheetTime(takeoff),landingTime=sheetTime(landing);
  const makeISO=t=>safeSheetISO(flightDate,t);
  const flightMinutes=Number(minutes);
  return {id:String(id??"").trim(),flightDate,takeoffISO:makeISO(takeoffTime),landingISO:makeISO(landingTime),flightMinutes:Number.isFinite(flightMinutes)?Math.max(0,Math.round(flightMinutes)):0,aircraft:String(aircraft??""),flightType:String(flightType??""),location:String(location??""),pilot:String(pilot??""),notes:String(notes??""),controller:String(controller??""),operation:String(operation??""),entrySource:String(entrySource??"Live Recorded"),createdISO:new Date().toISOString(),syncStatus:"Synced to Google Sheets"};
}
async function downloadSheetRecords(){
  if(!accessToken)throw new Error("Connect your Google account first.");
  if(!navigator.onLine)throw new Error("You are offline. Connect to the internet first.");
  const id=await getOrCreateSheet();
  const range=encodeURIComponent("'Flights'!A:M");
  const result=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
  const rows=(result.values||[]).slice(1),seen=new Set(),records=[];
  for(const row of rows){const record=sheetRowToRecord(row);if(!record.id||seen.has(record.id))continue;seen.add(record.id);records.push(record);}
  return records;
}
async function setDataButtonsEnabled(enabled){$("mergeFromSheet").disabled=!enabled;$("replaceFromSheet").disabled=!enabled;}
async function mergeFromSheet(){
  if(syncing)return;syncing=true;await setDataButtonsEnabled(false);$("syncNow").disabled=true;
  try{
    setSyncMessage("Reading flight records from Google Sheets…");
    const remote=await downloadSheetRecords(),local=await getAll(),localIds=new Set(local.map(r=>String(r.id)));
    const missing=remote.filter(r=>!localIds.has(r.id));
    if(missing.length)await tx("readwrite",store=>missing.forEach(r=>store.put(r)));
    await render();setSyncMessage(`Merge complete. ${missing.length} record(s) added from Google Sheets; ${local.length} existing local record(s) preserved.`);
  }catch(e){setSyncMessage("Could not merge spreadsheet data: "+e.message+". Existing local records were preserved.");}
  finally{syncing=false;await setDataButtonsEnabled(!!accessToken);$("syncNow").disabled=!accessToken;}
}
async function replaceFromSheet(){
  if(syncing)return;
  if(active&&!window.confirm("A flight is currently in progress. Replacing local data will discard that active flight too. Continue?"))return;
  if(!window.confirm("Replace ALL flight records on THIS device with the records currently in Google Sheets? Local-only records not yet uploaded will be deleted. The Google Sheet will not be changed."))return;
  syncing=true;await setDataButtonsEnabled(false);$("syncNow").disabled=true;
  try{
    setSyncMessage("Reading the master spreadsheet before replacing local records…");
    const remote=await downloadSheetRecords();
    await tx("readwrite",store=>{store.clear();remote.forEach(r=>store.put(r));});
    active=null;localStorage.removeItem(ACTIVE);showActive();await render();
    $("message").textContent="Local flight history replaced with the Google Sheets copy.";
    setSyncMessage(`Replace complete. ${remote.length} flight record(s) loaded from Google Sheets. No spreadsheet data was changed.`);
  }catch(e){setSyncMessage("Could not replace local data: "+e.message+". The existing local database was not intentionally cleared.");}
  finally{syncing=false;await setDataButtonsEnabled(!!accessToken);$("syncNow").disabled=!accessToken;}
}
$("mergeFromSheet").addEventListener("click",mergeFromSheet);
$("replaceFromSheet").addEventListener("click",replaceFromSheet);

function initGoogle(){if(!window.google?.accounts?.oauth2){setSyncMessage("Google sign-in is loading. If it does not appear, reload while online.");return;}tokenClient=google.accounts.oauth2.initTokenClient({client_id:window.GOOGLE_OAUTH_CLIENT_ID,scope:"https://www.googleapis.com/auth/drive.file",callback:async(resp)=>{if(resp.error){setSyncMessage("Google sign-in failed: "+resp.error);return;}accessToken=resp.access_token;$("syncNow").disabled=false;await setDataButtonsEnabled(true);$("connectGoogle").textContent="GOOGLE ACCOUNT CONNECTED";setSyncMessage("Connected for this session. Select Sync Flights to create or update your private spreadsheet.");await syncFlights();}});tokenClient.requestAccessToken({prompt:"consent"});}
$("connectGoogle").addEventListener("click",()=>{if(!tokenClient){if(window.google?.accounts?.oauth2)initGoogle();else setSyncMessage("Google sign-in is still loading. Please try again in a moment.");}else tokenClient.requestAccessToken({prompt:""});});
$("syncNow").addEventListener("click",()=>syncFlights());
async function googleFetch(url,options={}){const res=await fetch(url,{cache:"no-store",...options,headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json",...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error?.message||("Google API error "+res.status));return data;}
async function getOrCreateSheet(){
  const id=MASTER_SHEET_ID;
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`);
  localStorage.setItem(SHEET_KEY,id);

  // One-time migration: old Flight Hours values were decimal hours. Convert them
  // to whole minutes in the same batch that renames the header, avoiding a
  // partially migrated sheet if the request fails.
  const headerRange=encodeURIComponent("'Flights'!E1");
  const headerResult=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${headerRange}?valueRenderOption=UNFORMATTED_VALUE`);
  const durationHeader=String(headerResult.values?.[0]?.[0]??"").trim();
  if(durationHeader==="Flight Hours"){
    const all=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent("'Flights'!A:M")}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
    const rows=all.values||[];
    const converted=rows.slice(1).map((row,index)=>{
      const raw=row?.[4];
      if(raw===undefined||raw===null||raw==="")return [""];
      const n=Number(raw);
      if(!Number.isFinite(n)||n<0)throw new Error(`Cannot safely migrate Flight Hours in spreadsheet row ${index+2}. Please check that cell before syncing.`);
      return [Math.round(n*60)];
    });
    const data=[{range:"'Flights'!E1",values:[["Flight Minutes"]]}];
    if(converted.length)data.push({range:`'Flights'!E2:E${converted.length+1}`,values:converted});
    await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values:batchUpdate`,{method:"POST",body:JSON.stringify({valueInputOption:"RAW",data})});
  }else if(durationHeader!=="Flight Minutes"){
    throw new Error(`Expected the duration column header to be Flight Hours or Flight Minutes, but found "${durationHeader||"blank"}". No duration data was changed.`);
  }

  const sourceHeaderRange=encodeURIComponent("'Flights'!M1");
  const sourceHeader=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${sourceHeaderRange}`);
  if(sourceHeader.values?.[0]?.[0]!=="Entry Source"){
    await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${sourceHeaderRange}?valueInputOption=RAW`,{method:"PUT",body:JSON.stringify({values:[["Entry Source"]]})});
  }
  return id;
}
async function readSheetRecordIds(id){
  const range=encodeURIComponent("'Flights'!A:A");
  const result=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}?majorDimension=ROWS&valueRenderOption=UNFORMATTED_VALUE`);
  return new Set((result.values||[]).slice(1).map(row=>String(row?.[0]??"").trim()).filter(Boolean));
}
async function syncFlights(){
  if(syncing)return;
  if(!accessToken){setSyncMessage("Connect your Google account first.");return;}
  if(!navigator.onLine){setSyncMessage("You're offline. Flights remain safely queued on this device.");return;}
  syncing=true;$("syncNow").disabled=true;
  try{
    const id=await getOrCreateSheet();
    const ids=await readSheetRecordIds(id);
    const rows=await getAll();
    const seenLocal=new Set();
    const pending=rows.filter(r=>{const rid=String(r.id??"").trim();if(!rid||ids.has(rid)||seenLocal.has(rid))return false;seenLocal.add(rid);return true;});
    if(pending.length){
      const values=pending.map(r=>{const d=r.takeoffISO?new Date(r.takeoffISO):null,e=r.landingISO?new Date(r.landingISO):null;return [String(r.id),recordDate(r),d?d.toLocaleTimeString("en-GB",{hour12:false}):"",e?e.toLocaleTimeString("en-GB",{hour12:false}):"",getFlightMinutes(r),r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation,r.entrySource||"Live Recorded"];});
      const appendRange=encodeURIComponent("'Flights'!A:M");
      await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${appendRange}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:"POST",body:JSON.stringify({majorDimension:"ROWS",values})});
      const verified=await readSheetRecordIds(id);
      const missing=pending.filter(r=>!verified.has(String(r.id).trim()));
      if(missing.length)throw new Error(`Google Sheets did not confirm ${missing.length} uploaded Record ID(s). No further retry was attempted.`);
      for(const r of pending){r.syncStatus="Synced to Google Sheets";await tx("readwrite",s=>s.put(r));}
      verified.forEach(v=>ids.add(v));
    }
    $("syncMessage").textContent=`Sync complete. ${pending.length} new flight(s) uploaded. ${rows.length-pending.length} already in the spreadsheet.`;
    await render();
  }catch(e){setSyncMessage("Sync could not complete: "+e.message+". Your local records are still saved.");}
  finally{syncing=false;$("syncNow").disabled=!accessToken;}
}

function setManualMode(){const mode=$("manualMode").value;$("manualTimesGroup").classList.toggle("hidden",mode!=="times");$("manualElapsedGroup").classList.toggle("hidden",mode!=="elapsed");$("manualDurationGroup").classList.toggle("hidden",mode!=="duration");updateManualCalculation();}
function localDateTime(date,time){return new Date(`${date}T${time}:00`);}
function elapsedMinutes(value){const m=Number(value);return Number.isInteger(m)&&m>0?m:NaN;}
function updateManualCalculation(){const mode=$("manualMode").value,date=$("manualDate").value;let message="Enter the flight details to calculate duration.";try{if(mode==="times"&&date&&$("manualTakeoff").value&&$("manualLanding").value){const start=localDateTime(date,$("manualTakeoff").value),end=localDateTime(date,$("manualLanding").value);if(end<=start)end.setDate(end.getDate()+1);const mins=Math.round((end-start)/60000);message=`Duration: ${duration(mins*60000)} · Landing: ${end.toLocaleString()}`;}else if(mode==="elapsed"&&date&&$("manualElapsedTakeoff").value){const mins=elapsedMinutes($("manualElapsedMinutes").value);if(Number.isFinite(mins)&&mins>0){const start=localDateTime(date,$("manualElapsedTakeoff").value),end=new Date(start.getTime()+mins*60000);message=`Duration: ${duration(mins*60000)} · Recorded landing: ${end.toLocaleString()}`;}}else if(mode==="duration"){const mins=elapsedMinutes($("manualDurationMinutes").value);if(Number.isFinite(mins)&&mins>0)message=`Duration: ${duration(mins*60000)} · Takeoff and landing times will be left blank.`;}}catch{}$("manualCalculation").textContent=message;}
$("openManual").addEventListener("click",()=>{$("manualPanel").classList.remove("hidden");$("entryPanel").classList.add("hidden");$("manualDate").value=dateInputValue(new Date());setManualMode();window.scrollTo(0,0);});
$("closeManual").addEventListener("click",()=>{$("manualPanel").classList.add("hidden");$("entryPanel").classList.remove("hidden");});
$("manualMode").addEventListener("change",setManualMode);
["manualDate","manualTakeoff","manualLanding","manualElapsedTakeoff","manualElapsedMinutes","manualDurationMinutes"].forEach(id=>$(id).addEventListener("input",updateManualCalculation));
$("saveManual").addEventListener("click",async()=>{try{const date=$("manualDate").value,mode=$("manualMode").value;if(!date)throw new Error("Please select the flight date.");let takeoffISO=null,landingISO=null,mins=0;if(mode==="times"){const t=$("manualTakeoff").value,l=$("manualLanding").value;if(!t||!l)throw new Error("Enter both takeoff and landing times.");const start=localDateTime(date,t),end=localDateTime(date,l);if(end<=start)end.setDate(end.getDate()+1);mins=Math.round((end-start)/60000);if(mins<=0)throw new Error("Flight duration must be greater than zero.");takeoffISO=start.toISOString();landingISO=end.toISOString();}else if(mode==="elapsed"){const t=$("manualElapsedTakeoff").value;if(!t)throw new Error("Enter the takeoff time.");mins=elapsedMinutes($("manualElapsedMinutes").value);if(!Number.isFinite(mins)||mins<=0)throw new Error("Enter a valid elapsed duration greater than zero.");const start=localDateTime(date,t),end=new Date(start.getTime()+mins*60000);takeoffISO=start.toISOString();landingISO=end.toISOString();}else{mins=elapsedMinutes($("manualDurationMinutes").value);if(!Number.isFinite(mins)||mins<=0)throw new Error("Enter a valid elapsed duration greater than zero.");}
const record={id:crypto.randomUUID(),flightDate:date,takeoffISO,landingISO,flightMinutes:mins,pilot:$("manualPilot").value.trim()||"Jacob Griffin",aircraft:$("manualAircraft").value,controller:$("manualController").value,flightType:$("manualFlightType").value,operation:$("manualOperation").value,location:$("manualLocation").value.trim(),notes:$("manualNotes").value.trim(),entrySource:"Manual Entry",createdISO:new Date().toISOString(),syncStatus:"Local only"};await tx("readwrite",s=>s.put(record));await render();$("manualMessage").textContent="Manual flight saved on this device.";$("manualNotes").value="";$("manualLocation").value="";if(accessToken)syncFlights();}catch(e){$("manualMessage").textContent=e.message;}});

window.addEventListener("online",()=>{if(accessToken)syncFlights();else setSyncMessage("Internet restored. Connect Google to sync queued flights.");});
(async()=>{db=await openDB();try{active=JSON.parse(localStorage.getItem(ACTIVE)||"null");}catch{}if(active){$("pilot").value=active.pilot;$("aircraft").value=active.aircraft;$("controller").value=active.controller;$("flightType").value=active.flightType;$("operation").value=active.operation;$("location").value=active.location||"";$("notes").value=active.notes||"";}showActive();await migrateLocalDurations();await render();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});})();
