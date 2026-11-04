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
function showActive(){const box=$("active");box.classList.toggle("hidden",!active);$("start").disabled=!!active;$("end").disabled=!active;if(active){$("startedAt").textContent="Takeoff: "+localDate(active.takeoffISO);updateElapsed();if(tick)clearInterval(tick);tick=setInterval(updateElapsed,1000);}else if(tick){clearInterval(tick);tick=null;}}
function updateElapsed(){if(active)$("elapsed").textContent=duration(Date.now()-new Date(active.takeoffISO).getTime());}
function formData(){return {pilot:$("pilot").value.trim()||"Jacob Griffin",aircraft:$("aircraft").value,controller:$("controller").value,flightType:$("flightType").value,operation:$("operation").value,location:$("location").value.trim(),notes:$("notes").value.trim()};}
$("start").addEventListener("click",()=>{if(active)return;active={...formData(),id:crypto.randomUUID(),takeoffISO:new Date().toISOString()};saveActive();showActive();$("message").textContent="Flight started. You can close the app; the active flight is saved on this device.";});
$("end").addEventListener("click",async()=>{if(!active)return;const landingISO=new Date().toISOString(),hours=(new Date(landingISO)-new Date(active.takeoffISO))/3600000;const record={...active,landingISO,flightHours:Number(hours.toFixed(4)),createdISO:new Date().toISOString(),syncStatus:"Local only"};await tx("readwrite",s=>s.put(record));active=null;localStorage.removeItem(ACTIVE);showActive();$("location").value="";$("notes").value="";await render();$("message").textContent="Flight saved on this device.";if(accessToken)syncFlights();});
async function render(){const rows=(await getAll()).sort((a,b)=>b.takeoffISO.localeCompare(a.takeoffISO));$("flightCount").textContent=rows.length;$("totalHours").textContent=rows.reduce((n,r)=>n+r.flightHours,0).toFixed(2);$("history").innerHTML=rows.length?rows.map(r=>`<div class="history-item"><span class="duration">${duration(r.flightHours*3600000)}</span><div class="history-title">${esc(r.aircraft)} · ${esc(r.operation)}</div><div class="history-meta">${localDate(r.takeoffISO)} – ${localDate(r.landingISO)}<br>${esc(r.pilot)} · ${esc(r.flightType)} · ${esc(r.controller)}${r.location?"<br>"+esc(r.location):""}<br>${r.syncStatus==="Synced to Google Sheets"?"☁ Synced":"● Stored on this device"}</div></div>`).join(""):'<p class="empty">No completed flights yet.</p>';}
function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
$("export").addEventListener("click",async()=>{const rows=await getAll();const cols=["Record ID","Date","Takeoff Time","Landing Time","Flight Hours","Aircraft","Flight Type","Location / Operation","Pilot","Notes","Controller","Operation Type"];const q=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const data=[cols.join(","),...rows.sort((a,b)=>a.takeoffISO.localeCompare(b.takeoffISO)).map(r=>{const d=new Date(r.takeoffISO),end=new Date(r.landingISO);return [r.id,d.toLocaleDateString("en-CA"),d.toLocaleTimeString("en-GB",{hour12:false}),end.toLocaleTimeString("en-GB",{hour12:false}),r.flightHours,r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation].map(q).join(",");})].join("\r\n");const blob=new Blob(["\ufeff"+data],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sUAS_Flight_Log.csv";a.click();URL.revokeObjectURL(url);});
function setSyncMessage(s){$("syncMessage").textContent=s;}
function initGoogle(){if(!window.google?.accounts?.oauth2){setSyncMessage("Google sign-in is loading. If it does not appear, reload while online.");return;}tokenClient=google.accounts.oauth2.initTokenClient({client_id:window.GOOGLE_OAUTH_CLIENT_ID,scope:"https://www.googleapis.com/auth/drive.file",callback:async(resp)=>{if(resp.error){setSyncMessage("Google sign-in failed: "+resp.error);return;}accessToken=resp.access_token;$("syncNow").disabled=false;$("connectGoogle").textContent="GOOGLE ACCOUNT CONNECTED";setSyncMessage("Connected for this session. Select Sync Flights to create or update your private spreadsheet.");await syncFlights();}});tokenClient.requestAccessToken({prompt:"consent"});}
$("connectGoogle").addEventListener("click",()=>{if(!tokenClient){if(window.google?.accounts?.oauth2)initGoogle();else setSyncMessage("Google sign-in is still loading. Please try again in a moment.");}else tokenClient.requestAccessToken({prompt:""});});
$("syncNow").addEventListener("click",()=>syncFlights());
async function googleFetch(url,options={}){const res=await fetch(url,{cache:"no-store",...options,headers:{Authorization:"Bearer "+accessToken,"Content-Type":"application/json",...(options.headers||{})}});const data=await res.json().catch(()=>({}));if(!res.ok)throw new Error(data.error?.message||("Google API error "+res.status));return data;}
async function getOrCreateSheet(){
// All installations use the same user-selected master spreadsheet.
const id=MASTER_SHEET_ID;
await googleFetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=spreadsheetId`);
localStorage.setItem(SHEET_KEY,id);
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
      const values=pending.map(r=>{const d=new Date(r.takeoffISO),e=new Date(r.landingISO);return [String(r.id),d.toLocaleDateString("en-CA"),d.toLocaleTimeString("en-GB",{hour12:false}),e.toLocaleTimeString("en-GB",{hour12:false}),r.flightHours,r.aircraft,r.flightType,r.location,r.pilot,r.notes,r.controller,r.operation];});
      const appendRange=encodeURIComponent("'Flights'!A:L");
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
window.addEventListener("online",()=>{if(accessToken)syncFlights();else setSyncMessage("Internet restored. Connect Google to sync queued flights.");});
(async()=>{db=await openDB();try{active=JSON.parse(localStorage.getItem(ACTIVE)||"null");}catch{}if(active){$("pilot").value=active.pilot;$("aircraft").value=active.aircraft;$("controller").value=active.controller;$("flightType").value=active.flightType;$("operation").value=active.operation;$("location").value=active.location||"";$("notes").value=active.notes||"";}showActive();await render();if("serviceWorker"in navigator)navigator.serviceWorker.register("./sw.js").catch(()=>{});})();
