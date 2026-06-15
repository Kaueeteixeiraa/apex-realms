const campaignId = document.body.dataset.campaign;
const isOwner = document.body.dataset.owner === "true";
const stage = document.querySelector("#vtt-stage");
const viewport = document.querySelector("#vtt-viewport");
const board = document.querySelector("#vtt-board");
const grid = document.querySelector("#vtt-grid");
const fog = document.querySelector("#vtt-fog");
const messages = document.querySelector("#messages");
let tool = "select", zoom = 1, panX = 0, panY = 0, gridSize = Number(document.body.dataset.gridSize || 50), snap = true, selected = null, spaceHeld = false;

const api = async (url, options={}) => {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error((await response.json().catch(()=>({}))).error || "Não foi possível concluir.");
  return response.json();
};
const json = data => ({headers:{"Content-Type":"application/json"}, body:JSON.stringify(data)});
const toast = text => { const el=document.createElement("div"); el.className="vtt-toast"; el.textContent=text; document.body.append(el); setTimeout(()=>el.remove(),2200); };
const applyTransform = () => { board.style.transform=`translate(${panX}px,${panY}px) scale(${zoom})`; document.querySelector("#zoom-value").textContent=`${Math.round(zoom*100)}%`; };
const centerBoard = () => { zoom=1; panX=0; panY=0; applyTransform(); };

document.querySelectorAll("[data-left-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-left-tab],.left-pane").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector(`#left-${b.dataset.leftTab}`).classList.add("active")});
document.querySelectorAll("[data-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-tab],.tab-content").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector(`#tab-${b.dataset.tab}`).classList.add("active")});
document.querySelectorAll("[data-vtt-tool]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-vtt-tool]").forEach(x=>x.classList.remove("active"));b.classList.add("active");tool=b.dataset.vttTool;stage.dataset.tool=tool});
document.querySelector("#grid-toggle").onclick=e=>{e.currentTarget.classList.toggle("active");grid.classList.toggle("hidden")};
document.querySelector("#snap-toggle").onclick=e=>{snap=!snap;e.currentTarget.classList.toggle("active",snap)};
document.querySelector("#fog-toggle")?.addEventListener("click",e=>{e.currentTarget.classList.toggle("active");fog.classList.toggle("hidden")});
document.querySelector("#zoom-in").onclick=()=>{zoom=Math.min(2.5,zoom+.1);applyTransform()};
document.querySelector("#zoom-out").onclick=()=>{zoom=Math.max(.35,zoom-.1);applyTransform()};
document.querySelector("#center-map").onclick=centerBoard;
document.querySelector("#fullscreen-btn").onclick=()=>document.fullscreenElement?document.exitFullscreen():document.documentElement.requestFullscreen();
viewport.addEventListener("wheel",e=>{e.preventDefault();zoom=Math.max(.35,Math.min(2.5,zoom+(e.deltaY<0?.1:-.1)));applyTransform()},{passive:false});

let panning=null;
viewport.addEventListener("pointerdown",e=>{if(tool==="pan"||e.button===1||spaceHeld){panning={x:e.clientX-panX,y:e.clientY-panY};viewport.setPointerCapture(e.pointerId)}});
viewport.addEventListener("pointermove",e=>{if(panning){panX=e.clientX-panning.x;panY=e.clientY-panning.y;applyTransform()}});
viewport.addEventListener("pointerup",()=>panning=null);
window.addEventListener("keydown",async e=>{
  if(e.target.matches("input,textarea,select"))return;
  if(e.code==="Space"){spaceHeld=true;e.preventDefault()}
  if(e.key==="Escape"){selected?.classList.remove("selected");selected=null;document.querySelector("#token-inspector").hidden=true;document.querySelector("#inspector-empty").hidden=false}
  if(e.key==="+"||e.key==="="){zoom=Math.min(2.5,zoom+.1);applyTransform()}
  if(e.key==="-"){zoom=Math.max(.35,zoom-.1);applyTransform()}
  if(selected&&["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)){
    e.preventDefault();const step=(e.shiftKey?1:gridSize)/viewport.getBoundingClientRect().width*100;
    let x=parseFloat(selected.style.left),y=parseFloat(selected.style.top);
    if(e.key==="ArrowUp")y-=step;if(e.key==="ArrowDown")y+=step;if(e.key==="ArrowLeft")x-=step;if(e.key==="ArrowRight")x+=step;
    x=Math.max(0,Math.min(100,x));y=Math.max(0,Math.min(100,y));selected.style.left=`${x}%`;selected.style.top=`${y}%`;await saveToken(selected,{x,y});
  }
});
window.addEventListener("keyup",e=>{if(e.code==="Space")spaceHeld=false});

function selectToken(token){
  selected=token;document.querySelectorAll(".vtt-map-token,.vtt-token-row").forEach(x=>x.classList.remove("selected"));
  token.classList.add("selected");document.querySelector(`[data-focus-token="${token.dataset.tokenId}"]`)?.classList.add("selected");
  document.querySelector("#inspector-empty").hidden=true;const form=document.querySelector("#token-inspector");form.hidden=false;
  const set=(id,v)=>document.querySelector(id).value=v;
  document.querySelector("#inspect-title").textContent=token.dataset.name;document.querySelector("#inspect-avatar").textContent=token.dataset.name[0];
  set("#inspect-name",token.dataset.name);set("#inspect-class",token.dataset.class);set("#inspect-hp",token.dataset.hp);set("#inspect-max-hp",token.dataset.maxHp);set("#inspect-conditions",token.dataset.conditions);set("#inspect-notes",token.dataset.notes);set("#inspect-color",token.dataset.color);set("#inspect-size",token.dataset.size);
  set("#inspect-temp-hp",token.dataset.tempHp);set("#inspect-defense",token.dataset.defense);
  document.querySelector("#combat-selected-empty").hidden=true;document.querySelector("#combat-actions").hidden=false;document.querySelector("#combat-target").textContent=token.dataset.name;
  if(document.querySelector("#inspect-hidden"))document.querySelector("#inspect-hidden").checked=token.dataset.hidden==="1";
}
document.querySelectorAll(".vtt-map-token").forEach(token=>{
  token.onclick=e=>{e.stopPropagation();selectToken(token)};
  token.onpointerdown=e=>{
    if(tool!=="select"||spaceHeld)return;e.stopPropagation();selectToken(token);token.setPointerCapture(e.pointerId);
    const move=ev=>{const r=viewport.getBoundingClientRect();let px=(ev.clientX-r.left-panX)/zoom,py=(ev.clientY-r.top-panY)/zoom;if(snap){px=Math.round(px/gridSize)*gridSize;py=Math.round(py/gridSize)*gridSize}token.style.left=`${px/r.width*100}%`;token.style.top=`${py/r.height*100}%`};
    token.addEventListener("pointermove",move);token.addEventListener("pointerup",async()=>{token.removeEventListener("pointermove",move);await saveToken(token,{x:parseFloat(token.style.left),y:parseFloat(token.style.top)});},{once:true});
  };
});
document.querySelectorAll("[data-focus-token]").forEach(row=>row.onclick=()=>{const t=document.querySelector(`[data-token-id="${row.dataset.focusToken}"]`);selectToken(t);t.scrollIntoView({block:"center",inline:"center"})});
const saveToken=(token,data)=>api(`/api/campaign/${campaignId}/token/${token.dataset.tokenId}`,{method:"PATCH",...json(data)});
document.querySelector("#token-inspector").onsubmit=async e=>{e.preventDefault();if(!selected)return;const data={name:document.querySelector("#inspect-name").value,class_name:document.querySelector("#inspect-class").value,hp:+document.querySelector("#inspect-hp").value,max_hp:+document.querySelector("#inspect-max-hp").value,temp_hp:+document.querySelector("#inspect-temp-hp").value,defense:+document.querySelector("#inspect-defense").value,conditions:document.querySelector("#inspect-conditions").value,notes:document.querySelector("#inspect-notes").value,color:document.querySelector("#inspect-color").value,size:+document.querySelector("#inspect-size").value,hidden:document.querySelector("#inspect-hidden")?.checked};await saveToken(selected,data);toast("Token atualizado");location.reload()};
document.querySelector("#delete-token")?.addEventListener("click",async()=>{if(selected&&confirm(`Remover ${selected.dataset.name} da mesa?`)){await api(`/api/campaign/${campaignId}/token/${selected.dataset.tokenId}`,{method:"DELETE"});location.reload()}});
document.querySelector("#add-initiative")?.addEventListener("click",async()=>{if(selected){const score=prompt("Valor da iniciativa:","10");if(score!==null){await api(`/api/campaign/${campaignId}/initiative/${selected.dataset.tokenId}`,{method:"POST",...json({score:+score})});location.reload()}}});
document.querySelectorAll("[data-remove-init]").forEach(b=>b.onclick=async()=>{await api(`/api/campaign/${campaignId}/initiative/${b.dataset.removeInit}`,{method:"DELETE"});location.reload()});
document.querySelector("#next-turn")?.addEventListener("click",async()=>{await api(`/api/campaign/${campaignId}/initiative/next`,{method:"POST"});location.reload()});
document.querySelector("#combat-toggle")?.addEventListener("click",async()=>{await api(`/api/campaign/${campaignId}/combat/toggle`,{method:"POST"});location.reload()});
document.querySelector("[data-combat-minus]")?.addEventListener("click",()=>document.querySelector("#combat-amount").value=Math.max(0,+document.querySelector("#combat-amount").value-1));
document.querySelector("[data-combat-plus]")?.addEventListener("click",()=>document.querySelector("#combat-amount").value=+document.querySelector("#combat-amount").value+1);
document.querySelectorAll("[data-combat-action]").forEach(b=>b.onclick=async()=>{if(!selected)return;await api(`/api/campaign/${campaignId}/combat/action`,{method:"POST",...json({token_id:+selected.dataset.tokenId,action:b.dataset.combatAction,amount:+document.querySelector("#combat-amount").value})});location.reload()});
document.querySelector("#roll-all-initiative")?.addEventListener("click",async()=>{await api(`/api/campaign/${campaignId}/initiative/roll-all`,{method:"POST"});location.reload()});
document.querySelector("#make-attack")?.addEventListener("click",async()=>{if(!selected||!document.querySelector("#attack-target").value)return toast("Selecione atacante e alvo");const result=await api(`/api/campaign/${campaignId}/combat/attack`,{method:"POST",...json({attacker_id:+selected.dataset.tokenId,target_id:+document.querySelector("#attack-target").value,bonus:+document.querySelector("#attack-bonus").value,damage:document.querySelector("#attack-damage").value})});toast(result.hit?`Acertou: ${result.damage} de dano`:"Ataque errou");setTimeout(()=>location.reload(),700)});
document.querySelectorAll("[data-condition]").forEach(b=>b.onclick=async()=>{if(!selected)return;const current=selected.dataset.conditions.split(",").map(x=>x.trim()).filter(Boolean),condition=b.dataset.condition,index=current.indexOf(condition);index>=0?current.splice(index,1):current.push(condition);await saveToken(selected,{conditions:current.join(", ")});location.reload()});

let measure=null;
viewport.addEventListener("click",e=>{if(e.target.closest(".vtt-map-token,.vtt-toolbar,.vtt-zoom"))return;const r=viewport.getBoundingClientRect(),x=(e.clientX-r.left-panX)/zoom,y=(e.clientY-r.top-panY)/zoom;if(tool==="ping"){const p=document.createElement("i");p.className="vtt-ping";p.style.cssText=`left:${x}px;top:${y}px`;document.querySelector("#vtt-effects").append(p);setTimeout(()=>p.remove(),1800)}if(tool==="measure"){if(!measure){measure={x,y};toast("Clique no ponto final")}else{const dx=x-measure.x,dy=y-measure.y,l=document.createElement("div");l.className="vtt-measure";l.style.cssText=`left:${measure.x}px;top:${measure.y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;l.dataset.distance=`${Math.round(Math.hypot(dx,dy)/gridSize)} quadrados`;document.querySelector("#vtt-effects").append(l);measure=null}}});

const openModal=id=>document.querySelector(id).showModal();
["#upload-map-top","#upload-map-side","#upload-map-bottom","#upload-map-empty"].forEach(s=>document.querySelector(s)?.addEventListener("click",()=>openModal("#map-upload-modal")));
["#add-character","#add-character-bottom"].forEach(s=>document.querySelector(s)?.addEventListener("click",()=>openModal("#game-character-modal")));
document.querySelectorAll(".modal-close").forEach(b=>b.onclick=()=>b.closest("dialog").close());
document.querySelectorAll("[data-sheet-tab]").forEach(b=>b.onclick=()=>{document.querySelectorAll("[data-sheet-tab],.sheet-pane").forEach(x=>x.classList.remove("active"));b.classList.add("active");document.querySelector(`#sheet-${b.dataset.sheetTab}`).classList.add("active")});
document.querySelector("#open-sheet")?.addEventListener("click",async()=>{if(!selected)return;const s=await api(`/api/campaign/${campaignId}/token/${selected.dataset.tokenId}/sheet`);document.querySelector("#sheet-title").textContent=s.name;for(const [id,key] of [["#sheet-race","race"],["#sheet-class","class_name"],["#sheet-level","level"],["#sheet-defense","defense"],["#sheet-speed","speed"],["#sheet-skills","skills"],["#sheet-inventory","inventory"],["#sheet-abilities","abilities"],["#sheet-spells","spells"],["#sheet-story","story"],["#sheet-custom","custom_fields"]])document.querySelector(id).value=s[key]||"";document.querySelectorAll("[data-attribute]").forEach(i=>i.value=s.attributes[i.dataset.attribute]??10);openModal("#sheet-modal")});
document.querySelector("#sheet-form")?.addEventListener("submit",async e=>{e.preventDefault();const attrs={};document.querySelectorAll("[data-attribute]").forEach(i=>attrs[i.dataset.attribute]=+i.value);await saveToken(selected,{race:document.querySelector("#sheet-race").value,class_name:document.querySelector("#sheet-class").value,level:+document.querySelector("#sheet-level").value,defense:+document.querySelector("#sheet-defense").value,speed:+document.querySelector("#sheet-speed").value,attributes:attrs,skills:document.querySelector("#sheet-skills").value,inventory:document.querySelector("#sheet-inventory").value,abilities:document.querySelector("#sheet-abilities").value,spells:document.querySelector("#sheet-spells").value,story:document.querySelector("#sheet-story").value,custom_fields:document.querySelector("#sheet-custom").value});toast("Ficha salva");document.querySelector("#sheet-modal").close()});
document.querySelector("#map-upload-form")?.addEventListener("submit",async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;b.textContent="Enviando...";await api(`/api/campaign/${campaignId}/map/upload`,{method:"POST",body:new FormData(e.currentTarget)});location.reload()});
document.querySelectorAll(".scene-item").forEach(s=>s.onclick=async()=>{if(!isOwner||s.classList.contains("active"))return;await api(`/api/campaign/${campaignId}/map/${s.dataset.mapId}/activate`,{method:"POST"});location.reload()});
document.querySelector("#grid-size")?.addEventListener("input",e=>{gridSize=+e.target.value;grid.style.backgroundSize=`${gridSize}px ${gridSize}px`;document.querySelector("#grid-size-value").textContent=`${gridSize}px`});
document.querySelector("#save-scene-settings")?.addEventListener("click",async()=>{await api(`/api/campaign/${campaignId}/map/${document.body.dataset.mapId}`,{method:"PATCH",...json({grid_size:gridSize,grid_enabled:!grid.classList.contains("hidden"),fog_enabled:!fog.classList.contains("hidden")})});toast("Cena salva")});
document.querySelector("#delete-scene")?.addEventListener("click",async()=>{if(confirm("Remover esta cena? Os tokens serão mantidos.")){await api(`/api/campaign/${campaignId}/map/${document.body.dataset.mapId}`,{method:"DELETE"});location.reload()}});

function addMessage(d){const el=document.createElement("div"),author=document.createElement("span"),text=document.createElement("p"),time=document.createElement("small");el.className=`message ${d.kind||"message"}`;author.textContent=d.author;text.textContent=d.content;time.textContent="agora";el.append(author,text,time);messages.append(el);messages.scrollTop=messages.scrollHeight}
async function roll(formula){try{addMessage(await api(`/api/campaign/${campaignId}/roll`,{method:"POST",...json({formula})}))}catch(e){toast(e.message)}}
document.querySelectorAll("[data-roll]").forEach(b=>b.onclick=()=>roll(b.dataset.roll));
document.querySelector("#chat-form").onsubmit=async e=>{e.preventDefault();const i=document.querySelector("#chat-input"),v=i.value.trim();if(!v)return;i.value="";if(/^\d+d\d+([+-]\d+)?$/i.test(v))return roll(v);addMessage(await api(`/api/campaign/${campaignId}/chat`,{method:"POST",...json({content:v})}))};
messages.scrollTop=messages.scrollHeight;applyTransform();
