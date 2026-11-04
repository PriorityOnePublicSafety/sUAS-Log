const DB="suas-flight-logger", STORE="records", ACTIVE="activeFlight";
const SHEET_KEY="suasGoogleSheetId";
const MASTER_SHEET_ID="1lNUgg_z4n8huxdvIssJ-czXcaoI8drAEHFd-u0x3HoQ";
let db, active=null, tick=null, tokenClient=null, accessToken=null, syncing=false;
const $=id=>document.getElementById(id);
function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:"id"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
function tx(mode,fn){return new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),s=t.objectStore(STORE);let result;try{result=fn(s)}catch(e){reject(e);return}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error);});}
function getAll(){return new Promise((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);});}
function saveActive(){localStorage.setItem(ACTIVE,JSON.stringify(active));}
function localDate(iso){return new Intl.DateTimeFormat("en-US",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hour12:false}).format(new Date(iso));}
function duration(ms){let s=Math.max(0,Math.floor(ms/1000)),h=Math.floor(s/3600),m=Math.floor(s%3600/60),sec=s%60;return [h,m,sec].map(x=>String(x).padStart(2,"0")).join(":");}
function dateInputValue(d){return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");}
function recordDate(r){return r.flightDate|| (r.takeoffISO?dateInputValue(new Date(r.takeoffISO)):"");}
function recordSortKey(r){return r.takeoffISO?new Date(r.takeoffISO).getTime():new Date((r.flightDate||"1970-01-01")+"T00:00:00").getTime();}
function recordTimeText(r){const d=recordDate(r);const t=r.takeoffISO?new Date(r.takeoffISO).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}):"";const e=r.landingISO?new Date(r.landingISO).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit",hour12:false}):"";return `${d}${t||e?" · ":""}${t?"Takeoff "+t:""}${t&&e?" – ":""}${e?"Landing "+e:""}`;}
function showActive(){const box=$("active");box.classList.toggle("hidden",!active);$("start").disabled=!!active;$("end").disabled=!active;if(active){$("startedAt").textContent="Takeoff: "+localDate(active.takeoffISO);updateElapsed();if(tick)clearInterval(tick);tick=setInterval(updateElapsed,1000);}else if(tick){clearInterval(tick);tick=null;}}
function updateElapsed(){if(active)$("elapsed").textContent=duration(Date.now()-new Date(active.takeoffISO).getTime());}
function formData(){return {pilot:$("pilot").value.trim()||"Jacob Griffin",aircraft:$("aircraft").value,controller:$("controller").value,flightType:$("flightType").value,operation:$("operation").value,location:$("location").value.trim(),notes:$("notes").value.trim()};}
$("start").addEventListener("click",()=>{if(active)return;active={...formData(),id:crypto.randomUUID(),takeoffISO:new Date().toISOString()};saveActive();showActive();$("message").textContent="Flight started. You can close the app; the active flight is saved on this device.";});
$("end").addEventListener("click",async()=>{if(!active)return;const landingISO=new Date().toISOString(),hours=(new Date(landingISO)-new Date(active.takeoffISO))/3600000;const record={...active,landingISO,flightHours:Number(hours.toFixed(4)),createdISO:new Date().toISOString(),syncStatus:"Local only"};await tx("readwrite",s=>s.put(record));active=null;localStorage.removeItem(ACTIVE);showActive();$("location").value="";$("notes").value="";await render();$("message").textContent="Flight saved on this device.";if(accessToken)syncFlights();});
async function render(){const rows=(await getAll()).sort((a,b)=>recordSortKey(b)-recordSortKey(a));$("flightCount").textContent=rows.length;$("totalHours").textContent=rows.reduce((n,r)=>n+r.flightHours,0).toFixed(2);$("history").innerHTML=rows.length?rows.map(r=>`<div class="history-item"><span class="duration">${duration(r.flightHours*3600000)}</span><div class="history-title">${esc(r.aircraft)} · ${esc(r.operation)}</div><div class="history-meta">${esc(recordTimeText(r))}<br>${esc(r.pilot)} · ${esc(r.flightType)} · ${esc(r.controller)}${r.location?"<br>"+esc(r.location):""}<br>${r.entrySource==="Manual Entry"?"✎ Manual entry · ":""}${r.syncStatus==="Synced to Google Sheets"?"☁ Synced":"● Stored on this device"}</div></div>`).join(""):'<p class="empty">No completed flights yet.</p>';}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("export").addEventListener("click",async()=>{const rows=await getAll();const cols=["Record ID","Date","Takeoff Time","Landing Time","Flight Hours","Aircraft","Flight Type","Location / Operation","Pilot","Notes","Controller","Operation Type","Entry Source"];const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const data=[cols.join(","),...rows.sort((a,b)=>recordSortKey(a)-recordSortKey(b)).map(r=>{const d=r.takeoffISO?new Date(r.takeoffISO):null,end=r.landingISO?new Date(r.landingISO):null;return [r.id,recordDate(r),d?d.toLocaleTimeString("en-GB",{hour12:false}):"",end?end.toLocaleTimeString("en-GB",{hour12:false}):"",r.flightHours,r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation,r.entrySource||"Live Recorded"].map(q).join(",");})].join("\r\n");const blob=new Blob(["\ufeff"+data],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sUAS_Flight_Log.csv";a.click();URL.revokeObjectURL(url);});
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
  if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;
  const d=new Date(v);if(!Number.isNaN(d.getTime()))return dateInputValue(d);
  // Google Sheets may return a serial date when a cell was formatted as a date.
  const n=Number(v);if(Number.isFinite(n)&&n>20000&&n<80000){const d2=new Date(Date.UTC(1899,11,30)+n*86400000);return d2.toISOString().slice(0,10);}
  return "";
}
function sheetTime(value){
  const v=String(value??"").trim();if(!v)return "";
  if(/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)){const a=v.split(":");return a[0].padStart(2,"0")+":"+a[1].padStart(2,"0")+(a[2]?":"+a[2].padStart(2,"0"): ":00");}
  const n=Number(v);if(Number.isFinite(n)&&n>=0&&n<1){const sec=Math.round(n*86400);return [Math.floor(sec/3600),Math.floor(sec%3600/60),sec%60].map(x=>String(x).padStart(2,"0")).join(":");}
  return "";
}
function sheetRowToRecord(row){
  const [id,date,takeoff,landing,hours,aircraft,flightType,location,pilot,notes,controller,operation,entrySource]=row;
  const flightDate=sheetDate(date),takeoffTime=sheetTime(takeoff),landingTime=sheetTime(landing);
  const makeISO=t=>flightDate&&t?new Date(`${flightDate}T${t}`).toISOString():null;
  const flightHours=Number(hours);
  return {id:String(id??"").trim(),flightDate,takeoffISO:makeISO(takeoffTime),landingISO:makeISO(landingTime),flightHours:Number.isFinite(flightHours)?flightHours:0,aircraft:String(aircraft??""),flightType:String(flightType??""),location:String(location??""),pilot:String(pilot??""),notes:String(notes??""),controller:String(controller??""),operation:String(operation??""),entrySource:String(entrySource??"Live Recorded"),createdISO:new Date().toISOString(),syncStatus:"Synced to Google Sheets"};
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
// All installations use the same user-selected master spreadsheet.
const id=MASTER_SHEET_ID;
await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`);
localStorage.setItem(SHEET_KEY,id);
// Add the source column for manual/live record identification without changing existing columns.
const headerRange=encodeURIComponent("'Flights'!M1");
const header=await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${headerRange}`);
if(header.values?.[0]?.[0]!=="Entry Source"){
  await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${headerRange}?valueInputOption=RAW`,{method:"PUT",body:JSON.stringify({values:[["Entry Source"]]})});
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
      const values=pending.map(r=>{const d=r.takeoffISO?new Date(r.takeoffISO):null,e=r.landingISO?new Date(r.landingISO):null;return [String(r.id),recordDate(r),d?d.toLocaleTimeString("en-GB",{hour12:false}):"",e?e.toLocaleTimeString("en-GB",{hour12:false}):"",r.flightHours,r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation,r.entrySource||"Live Recorded"];});
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
function elapsedMinutes(hours,minutes){const h=Number(hours||0),m=Number(minutes||0);if(!Number.isInteger(h)||!Number.isInteger(m)||h<0||m<0||m>59)return NaN;return h*60+m;}
function updateManualCalculation(){const mode=$("manualMode").value,date=$("manualDate").value;let message="Enter the flight details to calculate duration.";try{if(mode==="times"&&date&&$("manualTakeoff").value&&$("manualLanding").value){const start=localDateTime(date,$("manualTakeoff").value),end=localDateTime(date,$("manualLanding").value);if(end<=start)end.setDate(end.getDate()+1);const mins=Math.round((end-start)/60000);message=`Duration: ${duration(mins*60000)} · Landing: ${end.toLocaleString()}`;}else if(mode==="elapsed"&&date&&$("manualElapsedTakeoff").value){const mins=elapsedMinutes($("manualHours").value,$("manualMinutes").value);if(Number.isFinite(mins)&&mins>0){const start=localDateTime(date,$("manualElapsedTakeoff").value),end=new Date(start.getTime()+mins*60000);message=`Duration: ${duration(mins*60000)} · Recorded landing: ${end.toLocaleString()}`;}}else if(mode==="duration"){const mins=elapsedMinutes($("manualDurationHours").value,$("manualDurationMinutes").value);if(Number.isFinite(mins)&&mins>0)message=`Duration: ${duration(mins*60000)} · Takeoff and landing times will be left blank.`;}}catch{}$("manualCalculation").textContent=message;}
$("openManual").addEventListener("click",()=>{$("manualPanel").classList.remove("hidden");$("entryPanel").classList.add("hidden");$("manualDate").value=dateInputValue(new Date());setManualMode();window.scrollTo(0,0);});
$("closeManual").addEventListener("click",()=>{$("manualPanel").classList.add("hidden");$("entryPanel").classList.remove("hidden");});
$("manualMode").addEventListener("change",setManualMode);
["manualDate","manualTakeoff","manualLanding","manualElapsedTakeoff","manualHours","manualMinutes","manualDurationHours","manualDurationMinutes"].forEach(id=>$(id).addEventListener("input",updateManualCalculation));
$("saveManual").addEventListener("click",async()=>{try{const date=$("manualDate").value,mode=$("manualMode").value;if(!date)throw new Error("Please select the flight date.");let takeoffISO=null,landingISO=null,mins=0;if(mode==="times"){const t=$("manualTakeoff").value,l=$("manualLanding").value;if(!t||!l)throw new Error("Enter both takeoff and landing times.");const start=localDateTime(date,t),end=localDateTime(date,l);if(end<=start)end.setDate(end.getDate()+1);mins=Math.round((end-start)/60000);if(mins<=0)throw new Error("Flight duration must be greater than zero.");takeoffISO=start.toISOString();landingISO=end.toISOString();}else if(mode==="elapsed"){const t=$("manualElapsedTakeoff").value;if(!t)throw new Error("Enter the takeoff time.");mins=elapsedMinutes($("manualHours").value,$("manualMinutes").value);if(!Number.isFinite(mins)||mins<=0)throw new Error("Enter a valid elapsed duration greater than zero.");const start=localDateTime(date,t),end=new Date(start.getTime()+mins*60000);takeoffISO=start.toISOString();landingISO=end.toISOString();}else{mins=elapsedMinutes($("manualDurationHours").value,$("manualDurationMinutes").value);if(!Number.isFinite(mins)||mins<=0)throw new Error("Enter a valid elapsed duration greater than zero.");}
const record={id:crypto.randomUUID(),flightDate:date,takeoffISO,landingISO,flightHours:Number((mins/60).toFixed(4)),pilot:$("manualPilot").value.trim()||"Jacob Griffin",aircraft:$("manualAircraft").value,controller:$("manualController").value,flightType:$("manualFlightType").value,operation:$("manualOperation").value,location:$("manualLocation").value.trim(),notes:$("manualNotes").value.trim(),entrySource:"Manual Entry",createdISO:new Date().toISOString(),syncStatus:"Local only"};await tx("readwrite",s=>s.put(record));await render();$("manualMessage").textContent="Manual flight saved on this device.";$("manualNotes").value="";$("manualLocation").value="";if(accessToken)syncFlights();}catch(e){$("manualMessage").textContent=e.message;}});

window.addEventListener("online",()=>{if(accessToken)syncFlights();else setSyncMessage("Internet restored. Connect Google to sync queued flights.");});
(async()=>{db=await openDB();try{active=JSON.parse(localStorage.getItem(ACTIVE)||"null");}catch{}if(active){$("pilot").value=active.pilot;$("aircraft").value=active.aircraft;$("controller").value=active.controller;$("flightType").value=active.flightType;$("operation").value=active.operation;$("location").value=active.location||"";$("notes").value=active.notes||"";}showActive();await render();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});})();
