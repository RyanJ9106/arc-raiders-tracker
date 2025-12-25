const STORE_KEY_MATS = "arc_raiders_materials_v3";
const STORE_KEY_RECIPES = "arc_raiders_recipes_v3";
const STORE_KEY_LOCS = "arc_raiders_locations_v1"; // NEW

const PRIORITY_SCORE = { Low:1, Medium:2, High:3, Critical:4 };

function $(id){ return document.getElementById(id); }
function uid(){ return Math.random().toString(16).slice(2) + Date.now().toString(16); }
function clamp0(n){ n = Number(n); return Number.isFinite(n) ? Math.max(0, n) : 0; }

function toast(msg){
  const el = $("toast");
  if(!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(()=> el.classList.remove("show"), 1400);
}

/* =========================================================
   SAVE MANAGER (NEW)
   - Shows "Last saved" badge if present (id="lastSaved")
   - Wires "Save now" button if present (id="saveNowBtn")
   - Automatically updates timestamp whenever save*() is called
========================================================= */
const STORE_KEY_LASTSAVED = "arc_raiders_last_saved_ts";

function setLastSaved(ts){
  try{
    localStorage.setItem(STORE_KEY_LASTSAVED, String(ts));
  }catch{}

  const el = $("lastSaved");
  if(el){
    const d = new Date(ts);
    el.textContent = "Last saved: " + d.toLocaleString();
  }
}

function getLastSaved(){
  try{
    const raw = localStorage.getItem(STORE_KEY_LASTSAVED);
    const ts = raw ? Number(raw) : 0;
    return Number.isFinite(ts) ? ts : 0;
  }catch{
    return 0;
  }
}

function initSaveUI(){
  const ts = getLastSaved();
  if(ts) setLastSaved(ts);

  const btn = $("saveNowBtn");
  if(btn){
    btn.addEventListener("click", ()=>{
      // Your site already autosaves. This is a manual "commit" + timestamp.
      setLastSaved(Date.now());
      toast("Saved");
    });
  }
}
/* ======================= END SAVE MANAGER ======================= */

function loadJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(!raw) return fallback;
    const data = JSON.parse(raw);
    return data ?? fallback;
  }catch{ return fallback; }
}
function saveJSON(key, data){
  localStorage.setItem(key, JSON.stringify(data));
}

// ---------- Materials ----------
function loadMaterials(){
  const arr = loadJSON(STORE_KEY_MATS, []);
  return Array.isArray(arr) ? arr : [];
}
function saveMaterials(list){
  saveJSON(STORE_KEY_MATS, list);
  setLastSaved(Date.now()); // NEW
}

function stillNeed(m){
  return clamp0(clamp0(m.needed) - clamp0(m.have));
}
function pctHave(m){
  const need = clamp0(m.needed);
  if(need <= 0) return 100;
  const hv = clamp0(m.have);
  return Math.max(0, Math.min(100, Math.round((hv/need)*100)));
}
function overallProgress(materials){
  const need = materials.reduce((a,m)=>a+clamp0(m.needed),0);
  const have = materials.reduce((a,m)=>a+Math.min(clamp0(m.have), clamp0(m.needed)),0);
  const pct = need <= 0 ? 100 : Math.max(0, Math.min(100, Math.round((have/need)*100)));
  return { need, have, pct };
}

function exportMaterialsCSV(materials){
  const header = ["name","category","rarity","priority","pinned","needed","have","still_need","notes"];
  const clean = (s)=> `"${String(s ?? "").replaceAll('"','""')}"`;
  const rows = materials.map(m=>{
    const needed = clamp0(m.needed);
    const have = clamp0(m.have);
    return [
      clean(m.name),
      clean(m.category),
      clean(m.rarity),
      clean(m.priority),
      m.pinned ? "TRUE" : "FALSE",
      needed,
      have,
      clamp0(needed - have),
      clean(m.notes)
    ].join(",");
  });
  return [header.join(","), ...rows].join("\n");
}

function download(filename, text, mime){
  const blob = new Blob([text], {type:mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 400);
}

// ---------- Recipes ----------
function loadRecipes(){
  const arr = loadJSON(STORE_KEY_RECIPES, []);
  return Array.isArray(arr) ? arr : [];
}
function saveRecipes(list){
  saveJSON(STORE_KEY_RECIPES, list);
  setLastSaved(Date.now()); // NEW
}

function normalizeRecipe(r){
  return {
    id: String(r.id || uid()),
    name: String(r.name || "Unnamed Recipe"),
    crafts: {
      itemName: String(r.crafts?.itemName || ""),
      qty: clamp0(r.crafts?.qty || 1)
    },
    inputs: Array.isArray(r.inputs) ? r.inputs.map(x=>({
      materialName: String(x.materialName || ""),
      qtyPerCraft: clamp0(x.qtyPerCraft || 0)
    })).filter(x=>x.materialName) : [],
    planQty: clamp0(r.planQty || 0),
    notes: String(r.notes || "")
  };
}

function applyRecipePlanToNeeded(materials, recipe){
  const crafts = clamp0(recipe.planQty);
  if(crafts <= 0) return materials;

  const map = new Map(materials.map(m=>[m.name.toLowerCase(), m]));
  for(const inp of recipe.inputs){
    const k = inp.materialName.toLowerCase();
    const add = clamp0(inp.qtyPerCraft) * crafts;
    if(add <= 0) continue;

    if(map.has(k)){
      map.get(k).needed = clamp0(map.get(k).needed) + add;
    }else{
      const m = {
        id: uid(),
        name: inp.materialName,
        category: "Basic",
        rarity: "Common",
        priority: "High",
        pinned: false,
        needed: add,
        have: 0,
        notes: "Auto-added from recipe plan",
        updatedAt: Date.now()
      };
      materials.push(m);
      map.set(k, m);
    }
  }
  return materials;
}

function resetAllNeeded(materials){
  for(const m of materials) m.needed = 0;
  return materials;
}

// ---------- Locations (NEW) ----------
function loadLocations(){
  const arr = loadJSON(STORE_KEY_LOCS, []);
  return Array.isArray(arr) ? arr : [];
}
function saveLocations(list){
  saveJSON(STORE_KEY_LOCS, list);
  setLastSaved(Date.now()); // NEW
}
// location model: { id, name, notes, materialIds: [materialId,...] }
function normalizeLocation(l){
  return {
    id: String(l.id || uid()),
    name: String(l.name || "Unnamed Area"),
    notes: String(l.notes || ""),
    materialIds: Array.isArray(l.materialIds) ? l.materialIds.map(String) : []
  };
}

// ---------- Shared UI helpers ----------
function setActiveNav(){
  const path = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".navlink").forEach(a=>{
    const href = a.getAttribute("href");
    if(href === path) a.classList.add("active");
    else a.classList.remove("active");
  });
}
function rarityClass(r){
  if(r === "Epic") return "epic";
  if(r === "Rare") return "rar";
  if(r === "Uncommon") return "uncom";
  return "com";
}
function escapeHtml(str){
  return String(str ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

window.ARCT = {
  setActiveNav,

  // HOME
  initHome(){
    setActiveNav();
    initSaveUI(); // NEW

    const materials = loadMaterials();
    const recipes = loadRecipes();
    const locs = loadLocations();

    const prog = overallProgress(materials);

    $("homeMatCount").textContent = String(materials.length);
    $("homeRecCount").textContent = String(recipes.length);
    if($("homeLocCount")) $("homeLocCount").textContent = String(locs.length);

    $("homeHave").textContent = String(materials.reduce((a,m)=>a+clamp0(m.have),0));
    $("homeNeed").textContent = String(materials.reduce((a,m)=>a+clamp0(m.needed),0));
    $("homeMissing").textContent = String(materials.reduce((a,m)=>a+stillNeed(m),0));

    if($("homeProgPct")) $("homeProgPct").textContent = `${prog.pct}%`;
    if($("homeProgBar")) $("homeProgBar").firstElementChild.style.width = `${prog.pct}%`;

    // top missing
    const top = [...materials]
      .map(m=>({m, miss: stillNeed(m)}))
      .filter(x=>x.miss>0)
      .sort((a,b)=>{
        const ap = PRIORITY_SCORE[a.m.priority||"High"]||3;
        const bp = PRIORITY_SCORE[b.m.priority||"High"]||3;
        if(bp!==ap) return bp-ap;
        // pinned always first
        if(!!b.m.pinned !== !!a.m.pinned) return (b.m.pinned?1:0) - (a.m.pinned?1:0);
        return b.miss - a.miss;
      })
      .slice(0,8);

    const list = $("homeTopMissing");
    list.innerHTML = "";
    if(top.length === 0){
      list.innerHTML = `<div class="muted">Nothing missing right now — you’re stacked.</div>`;
    }else{
      for(const x of top){
        const div = document.createElement("div");
        div.style.display="flex";
        div.style.justifyContent="space-between";
        div.style.gap="10px";
        div.style.padding="8px 0";
        div.innerHTML = `
          <div>
            <div class="inline">
              <div class="name">${escapeHtml(x.m.name)}</div>
              ${x.m.pinned ? `<span class="tag pin">Pinned</span>` : ``}
            </div>
            <div class="muted">${escapeHtml(x.m.category||"")} • ${escapeHtml(x.m.priority||"")}</div>
            <div class="bar" style="margin-top:6px"><div style="width:${pctHave(x.m)}%"></div></div>
          </div>
          <div class="${x.miss===0?"need0":"needpos"}" style="font-size:16px;font-weight:900">${x.miss}</div>
        `;
        list.appendChild(div);
      }
    }

    $("homeExportJson").addEventListener("click", ()=>{
      const payload = JSON.stringify({ materials, recipes, locations: locs }, null, 2);
      download("arc-raiders-tracker-backup.json", payload, "application/json");
      toast("Exported backup");
    });

    $("homeImportJson").addEventListener("click", ()=> $("homeFile").click());
    $("homeFile").addEventListener("change", (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const data = JSON.parse(String(reader.result||"{}"));
          if(!data || typeof data !== "object") throw new Error("bad");
          if(Array.isArray(data.materials)) saveMaterials(data.materials);
          if(Array.isArray(data.recipes)) saveRecipes(data.recipes);
          if(Array.isArray(data.locations)) saveLocations(data.locations.map(normalizeLocation));
          toast("Imported backup");
          setTimeout(()=> location.reload(), 200);
        }catch{
          alert("Import failed. Use the backup JSON exported from this site.");
        }
      };
      reader.readAsText(file);
      e.target.value="";
    });

    $("homeWipe").addEventListener("click", ()=>{
      if(!confirm("Wipe ALL saved materials + recipes + locations on this device?")) return;
      localStorage.removeItem(STORE_KEY_MATS);
      localStorage.removeItem(STORE_KEY_RECIPES);
      localStorage.removeItem(STORE_KEY_LOCS);
      localStorage.removeItem(STORE_KEY_LASTSAVED); // NEW (optional cleanup)
      toast("Wiped");
      setTimeout(()=> location.reload(), 200);
    });
  },

  // MATERIALS
  initMaterials(){
    setActiveNav();
    initSaveUI(); // NEW
    let materials = loadMaterials();

    const formTitle = $("formTitle");
    const editId = $("editId");
    const matName = $("matName");
    const category = $("category");
    const rarity = $("rarity");
    const needed = $("needed");
    const have = $("have");
    const priority = $("priority");
    const notes = $("notes");
    const deleteBtn = $("deleteBtn");

    const pinned = $("pinned"); // NEW checkbox (see materials.html update below)

    function resetForm(){
      editId.value = "";
      formTitle.textContent = "Add material";
      matName.value = "";
      category.value = "Basic";
      rarity.value = "Common";
      needed.value = 0;
      have.value = 0;
      priority.value = "High";
      if(pinned) pinned.checked = false;
      notes.value = "";
      deleteBtn.style.display = "none";
    }

    function fillForm(m){
      editId.value = m.id;
      formTitle.textContent = "Edit material";
      matName.value = m.name ?? "";
      category.value = m.category ?? "Basic";
      rarity.value = m.rarity ?? "Common";
      needed.value = clamp0(m.needed);
      have.value = clamp0(m.have);
      priority.value = m.priority ?? "High";
      if(pinned) pinned.checked = !!m.pinned;
      notes.value = m.notes ?? "";
      deleteBtn.style.display = "inline-block";
    }

    function upsert(){
      const id = editId.value || uid();
      const name = matName.value.trim();
      if(!name){ toast("Add a name"); matName.focus(); return; }

      const m = {
        id,
        name,
        category: category.value,
        rarity: rarity.value,
        needed: clamp0(parseInt(needed.value,10)),
        have: clamp0(parseInt(have.value,10)),
        priority: priority.value,
        pinned: pinned ? !!pinned.checked : false,
        notes: notes.value.trim(),
        updatedAt: Date.now()
      };

      const idx = materials.findIndex(x=>x.id===id);
      if(idx>=0) materials[idx]=m; else materials.push(m);
      saveMaterials(materials);
      render();
      toast(idx>=0?"Updated":"Saved");
      resetForm();
    }

    function remove(){
      const id = editId.value;
      if(!id) return;
      if(!confirm("Delete this material?")) return;
      materials = materials.filter(m=>m.id!==id);
      saveMaterials(materials);
      render();
      toast("Deleted");
      resetForm();
    }

    function adjustHave(id, delta){
      const m = materials.find(x=>x.id===id);
      if(!m) return;
      m.have = clamp0(clamp0(m.have) + delta);
      m.updatedAt = Date.now();
      saveMaterials(materials);
      render();
    }

    function setHave(id, value){
      const m = materials.find(x=>x.id===id);
      if(!m) return;
      m.have = clamp0(value);
      m.updatedAt = Date.now();
      saveMaterials(materials);
      render();
    }

    function togglePin(id){
      const m = materials.find(x=>x.id===id);
      if(!m) return;
      m.pinned = !m.pinned;
      m.updatedAt = Date.now();
      saveMaterials(materials);
      render();
      toast(m.pinned ? "Pinned" : "Unpinned");
    }

    // KPIs + bars
    function setKPIs(){
      $("kpiCount").textContent = String(materials.length);
      $("kpiNeed").textContent = String(materials.reduce((a,m)=>a+clamp0(m.needed),0));
      $("kpiMissing").textContent = String(materials.reduce((a,m)=>a+stillNeed(m),0));
      if($("matProgPct") && $("matProgBar")){
        const p = overallProgress(materials);
        $("matProgPct").textContent = `${p.pct}%`;
        $("matProgBar").firstElementChild.style.width = `${p.pct}%`;
      }
    }

    // per-category progress bars (optional area)
    function renderCategoryProgress(){
      const el = $("catProgress");
      if(!el) return;
      const cats = ["Basic","Tech","Mechanical","Power","Utility","Rare"];
      const byCat = new Map(cats.map(c=>[c, {need:0, have:0}]));
      for(const m of materials){
        const c = m.category || "Basic";
        if(!byCat.has(c)) byCat.set(c, {need:0, have:0});
        byCat.get(c).need += clamp0(m.needed);
        byCat.get(c).have += Math.min(clamp0(m.have), clamp0(m.needed));
      }
      el.innerHTML = "";
      for(const [c,v] of byCat){
        if(v.need <= 0) continue;
        const pct = Math.max(0, Math.min(100, Math.round((v.have/v.need)*100)));
        const row = document.createElement("div");
        row.style.marginBottom = "10px";
        row.innerHTML = `
          <div class="inline" style="justify-content:space-between">
            <div class="tag">${escapeHtml(c)}</div>
            <div class="muted">${pct}%</div>
          </div>
          <div class="bar" style="margin-top:6px"><div style="width:${pct}%"></div></div>
        `;
        el.appendChild(row);
      }
      if(el.innerHTML.trim()===""){
        el.innerHTML = `<div class="muted">Set some “Needed” values to see progress by category.</div>`;
      }
    }

    function render(){
      materials = loadMaterials();
      setKPIs();
      renderCategoryProgress();

      const q = $("search").value.trim().toLowerCase();
      const cat = $("filterCategory").value;
      const sort = $("sortBy").value;

      let list = [...materials];

      if(cat !== "All") list = list.filter(m => (m.category||"Basic") === cat);
      if(q){
        list = list.filter(m=>{
          const hay = `${m.name||""} ${m.category||""} ${m.rarity||""} ${m.priority||""} ${m.notes||""}`.toLowerCase();
          return hay.includes(q);
        });
      }

      list.sort((a,b)=>{
        // pinned always first
        if(!!b.pinned !== !!a.pinned) return (b.pinned?1:0) - (a.pinned?1:0);

        const aNeed = stillNeed(a);
        const bNeed = stillNeed(b);
        const ap = PRIORITY_SCORE[a.priority||"High"] || 3;
        const bp = PRIORITY_SCORE[b.priority||"High"] || 3;

        if(sort==="priority_desc"){
          if(bp!==ap) return bp-ap;
          if(bNeed!==aNeed) return bNeed-aNeed;
          return (a.name||"").localeCompare(b.name||"");
        }
        if(sort==="missing_desc"){
          if(bNeed!==aNeed) return bNeed-aNeed;
          if(bp!==ap) return bp-ap;
          return (a.name||"").localeCompare(b.name||"");
        }
        if(sort==="name_asc") return (a.name||"").localeCompare(b.name||"");
        if(sort==="category_asc"){
          const c = (a.category||"").localeCompare(b.category||"");
          if(c!==0) return c;
          return (a.name||"").localeCompare(b.name||"");
        }
        return 0;
      });

      const tb = $("tbody");
      tb.innerHTML = "";
      $("emptyNote").style.display = materials.length ? "none" : "block";

      for(const m of list){
        const need = clamp0(m.needed);
        const hv = clamp0(m.have);
        const miss = stillNeed(m);
        const pct = pctHave(m);

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div class="inline">
              <div class="name">${escapeHtml(m.name)}</div>
              ${m.pinned ? `<span class="tag pin">Pinned</span>` : ``}
            </div>
            <div class="muted" style="margin-top:4px;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(m.notes||"")}">
              ${escapeHtml(m.notes||"")}
            </div>
            <div class="bar" style="margin-top:6px"><div style="width:${pct}%"></div></div>
          </td>
          <td><span class="tag">${escapeHtml(m.category||"Basic")}</span></td>
          <td><span class="tag ${rarityClass(m.rarity)}">${escapeHtml(m.rarity||"Common")}</span></td>
          <td>${need}</td>
          <td><input type="number" min="0" value="${hv}" data-sethave="${m.id}" style="max-width:100px"/></td>
          <td class="${miss===0?"need0":"needpos"}">${miss}</td>
          <td>
            <div class="actions">
              <button class="tiny" data-adj="${m.id}" data-delta="-1">-1</button>
              <button class="tiny" data-adj="${m.id}" data-delta="1">+1</button>
              <button class="tiny" data-adj="${m.id}" data-delta="5">+5</button>
              <button class="tiny" data-pin="${m.id}">${m.pinned ? "Unpin" : "Pin"}</button>
              <button class="tiny" data-edit="${m.id}">Edit</button>
            </div>
          </td>
        `;
        tb.appendChild(tr);
      }

      tb.querySelectorAll("[data-adj]").forEach(btn=>{
        btn.addEventListener("click", ()=> adjustHave(btn.dataset.adj, parseInt(btn.dataset.delta,10)));
      });
      tb.querySelectorAll("[data-edit]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const m = materials.find(x=>x.id===btn.dataset.edit);
          if(m) fillForm(m);
          window.scrollTo({top:0,behavior:"smooth"});
        });
      });
      tb.querySelectorAll("[data-sethave]").forEach(inp=>{
        inp.addEventListener("change", ()=> setHave(inp.dataset.sethave, parseInt(inp.value,10)));
      });
      tb.querySelectorAll("[data-pin]").forEach(btn=>{
        btn.addEventListener("click", ()=> togglePin(btn.dataset.pin));
      });
    }

    $("exportJsonBtn").addEventListener("click", ()=>{
      const payload = JSON.stringify(loadMaterials(), null, 2);
      download("arc-raiders-materials.json", payload, "application/json");
      toast("Exported JSON");
    });

    $("exportCsvBtn").addEventListener("click", ()=>{
      const csv = exportMaterialsCSV(loadMaterials());
      download("arc-raiders-materials.csv", csv, "text/csv");
      toast("Exported CSV");
    });

    $("importJsonBtn").addEventListener("click", ()=> $("fileInput").click());
    $("fileInput").addEventListener("change", (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const data = JSON.parse(String(reader.result||"[]"));
          if(!Array.isArray(data)) throw new Error("bad");
          const normalized = data.map(x=>({
            id: String(x.id || uid()),
            name: String(x.name || "Unnamed"),
            category: String(x.category || "Basic"),
            rarity: String(x.rarity || "Common"),
            priority: String(x.priority || "High"),
            pinned: !!x.pinned,
            needed: clamp0(x.needed),
            have: clamp0(x.have),
            notes: String(x.notes || ""),
            updatedAt: Date.now()
          }));
          saveMaterials(normalized);
          materials = normalized;
          render();
          toast("Imported");
        }catch{
          alert("Import failed. Use JSON exported from this tracker.");
        }
      };
      reader.readAsText(file);
      e.target.value="";
    });

    $("wipeBtn").addEventListener("click", ()=>{
      if(!confirm("Wipe ALL materials on this device?")) return;
      localStorage.removeItem(STORE_KEY_MATS);
      localStorage.removeItem(STORE_KEY_LASTSAVED); // NEW (optional cleanup)
      materials = [];
      render();
      resetForm();
      toast("Wiped");
    });

    $("saveBtn").addEventListener("click", upsert);
    $("resetBtn").addEventListener("click", resetForm);
    deleteBtn.addEventListener("click", remove);

    $("search").addEventListener("input", render);
    $("filterCategory").addEventListener("change", render);
    $("sortBy").addEventListener("change", render);

    resetForm();
    render();
  },

  // RECIPES (same as before, just ensures pinned field exists on auto-add)
  initRecipes(){
    setActiveNav();
    initSaveUI(); // NEW
    let recipes = loadRecipes();

    function renderRecipeList(){
      recipes = loadRecipes().map(normalizeRecipe);
      const wrap = $("recipeList");
      wrap.innerHTML = "";

      if(recipes.length === 0){
        wrap.innerHTML = `<div class="muted">No recipes yet. Add one on the left.</div>`;
        return;
      }

      for(const r of recipes){
        const crafts = clamp0(r.planQty);
        const items = (r.inputs||[]).map(i=>`${escapeHtml(i.materialName)} × ${clamp0(i.qtyPerCraft)}`).join(", ");
        const div = document.createElement("div");
        div.style.border = "1px solid rgba(33,48,67,.7)";
        div.style.background = "rgba(9,13,18,.25)";
        div.style.borderRadius = "14px";
        div.style.padding = "12px";
        div.style.marginBottom = "10px";
        div.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <div class="name">${escapeHtml(r.name)}</div>
              <div class="muted" style="margin-top:4px">
                Plan: <b>${crafts}</b> crafts
                ${r.crafts?.itemName ? ` • Output: ${escapeHtml(r.crafts.itemName)} × ${clamp0(r.crafts.qty||1)}` : ""}
              </div>
              <div class="muted" style="margin-top:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(items)}">
                Inputs: ${items || "—"}
              </div>
            </div>
            <div class="actions">
              <button class="tiny" data-edit="${r.id}">Edit</button>
              <button class="tiny danger" data-del="${r.id}">Delete</button>
            </div>
          </div>
        `;
        wrap.appendChild(div);
      }

      wrap.querySelectorAll("[data-edit]").forEach(btn=>{
        btn.addEventListener("click", ()=> loadIntoForm(btn.dataset.edit));
      });
      wrap.querySelectorAll("[data-del]").forEach(btn=>{
        btn.addEventListener("click", ()=> deleteRecipe(btn.dataset.del));
      });
    }

    function resetForm(){
      $("rEditId").value = "";
      $("rFormTitle").textContent = "Add recipe";
      $("rName").value = "";
      $("rOutputName").value = "";
      $("rOutputQty").value = 1;
      $("rPlanQty").value = 0;
      $("rNotes").value = "";
      $("rInputs").value = "";
      $("rDeleteBtn").style.display = "none";
    }

    function loadIntoForm(id){
      const r = recipes.find(x=>x.id===id);
      if(!r) return;
      $("rEditId").value = r.id;
      $("rFormTitle").textContent = "Edit recipe";
      $("rName").value = r.name || "";
      $("rOutputName").value = r.crafts?.itemName || "";
      $("rOutputQty").value = clamp0(r.crafts?.qty || 1);
      $("rPlanQty").value = clamp0(r.planQty || 0);
      $("rNotes").value = r.notes || "";
      $("rInputs").value = (r.inputs||[]).map(i=>`${i.materialName}:${clamp0(i.qtyPerCraft)}`).join("\n");
      $("rDeleteBtn").style.display = "inline-block";
      window.scrollTo({top:0,behavior:"smooth"});
    }

    function parseInputs(text){
      const lines = String(text||"").split("\n").map(x=>x.trim()).filter(Boolean);
      const inputs = [];
      for(const line of lines){
        const parts = line.split(":").map(x=>x.trim());
        if(parts.length < 2) continue;
        const materialName = parts[0];
        const qty = clamp0(parseFloat(parts.slice(1).join(":")));
        if(materialName) inputs.push({materialName, qtyPerCraft: qty});
      }
      return inputs;
    }

    function upsertRecipe(){
      const id = $("rEditId").value || uid();
      const name = $("rName").value.trim();
      if(!name){ toast("Recipe needs a name"); $("rName").focus(); return; }

      const r = normalizeRecipe({
        id,
        name,
        crafts: { itemName: $("rOutputName").value.trim(), qty: clamp0(parseFloat($("rOutputQty").value)) || 1 },
        planQty: clamp0(parseFloat($("rPlanQty").value)),
        notes: $("rNotes").value.trim(),
        inputs: parseInputs($("rInputs").value)
      });

      const list = loadRecipes();
      const idx = list.findIndex(x=>x.id===id);
      if(idx>=0) list[idx]=r; else list.push(r);
      saveRecipes(list);

      recipes = list.map(normalizeRecipe);
      renderRecipeList();
      toast(idx>=0?"Updated recipe":"Saved recipe");
      resetForm();
    }

    function deleteRecipe(id){
      if(!confirm("Delete this recipe?")) return;
      const list = loadRecipes().filter(r=>r.id!==id);
      saveRecipes(list);
      recipes = list.map(normalizeRecipe);
      renderRecipeList();
      toast("Deleted");
      resetForm();
    }

    function applyPlans(){
      let mats = loadMaterials();
      const recs = loadRecipes().map(normalizeRecipe);

      if($("planMode").value === "reset_then_apply"){
        mats = resetAllNeeded(mats);
      }
      for(const r of recs){
        mats = applyRecipePlanToNeeded(mats, r);
      }
      // ensure pinned exists
      for(const m of mats) if(typeof m.pinned !== "boolean") m.pinned = false;

      saveMaterials(mats);
      toast("Applied recipe plans → Needed updated");
    }

    $("rSaveBtn").addEventListener("click", upsertRecipe);
    $("rResetBtn").addEventListener("click", resetForm);
    $("rDeleteBtn").addEventListener("click", ()=> {
      const id = $("rEditId").value;
      if(id) deleteRecipe(id);
    });

    $("applyPlansBtn").addEventListener("click", applyPlans);

    $("exportRecipesBtn").addEventListener("click", ()=>{
      const payload = JSON.stringify(loadRecipes(), null, 2);
      download("arc-raiders-recipes.json", payload, "application/json");
      toast("Exported recipes");
    });
    $("importRecipesBtn").addEventListener("click", ()=> $("recipesFile").click());
    $("recipesFile").addEventListener("change", (e)=>{
      const file = e.target.files && e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const data = JSON.parse(String(reader.result||"[]"));
          if(!Array.isArray(data)) throw new Error("bad");
          saveRecipes(data.map(normalizeRecipe));
          recipes = loadRecipes().map(normalizeRecipe);
          renderRecipeList();
          toast("Imported recipes");
        }catch{
          alert("Import failed. Use JSON exported from this tracker.");
        }
      };
      reader.readAsText(file);
      e.target.value="";
    });

    $("wipeRecipesBtn").addEventListener("click", ()=>{
      if(!confirm("Wipe ALL recipes on this device?")) return;
      localStorage.removeItem(STORE_KEY_RECIPES);
      localStorage.removeItem(STORE_KEY_LASTSAVED); // NEW (optional cleanup)
      recipes = [];
      renderRecipeList();
      resetForm();
      toast("Wiped recipes");
    });

    resetForm();
    renderRecipeList();
  },

  // LOCATIONS (NEW)
  initLocations(){
    setActiveNav();
    initSaveUI(); // NEW
    let locations = loadLocations().map(normalizeLocation);
    let materials = loadMaterials();

    const locFormTitle = $("locFormTitle");
    const locEditId = $("locEditId");
    const locName = $("locName");
    const locNotes = $("locNotes");
    const locDeleteBtn = $("locDeleteBtn");

    function resetForm(){
      locEditId.value = "";
      locFormTitle.textContent = "Add location area";
      locName.value = "";
      locNotes.value = "";
      locDeleteBtn.style.display = "none";
    }

    function fillForm(l){
      locEditId.value = l.id;
      locFormTitle.textContent = "Edit location area";
      locName.value = l.name || "";
      locNotes.value = l.notes || "";
      locDeleteBtn.style.display = "inline-block";
    }

    function upsert(){
      const id = locEditId.value || uid();
      const name = locName.value.trim();
      if(!name){ toast("Area needs a name"); locName.focus(); return; }

      // keep existing assignments if editing
      const existing = locations.find(x=>x.id===id);
      const l = normalizeLocation({
        id,
        name,
        notes: locNotes.value.trim(),
        materialIds: existing?.materialIds || []
      });

      const idx = locations.findIndex(x=>x.id===id);
      if(idx>=0) locations[idx]=l; else locations.push(l);

      saveLocations(locations);
      render();
      toast(idx>=0?"Updated area":"Saved area");
      resetForm();
    }

    function remove(){
      const id = locEditId.value;
      if(!id) return;
      if(!confirm("Delete this area? Assignments will be removed too.")) return;
      locations = locations.filter(l=>l.id!==id);
      saveLocations(locations);
      render();
      toast("Deleted");
      resetForm();
    }

    function toggleAssign(locId, matId){
      const l = locations.find(x=>x.id===locId);
      if(!l) return;
      const set = new Set(l.materialIds || []);
      if(set.has(matId)) set.delete(matId); else set.add(matId);
      l.materialIds = [...set];
      saveLocations(locations);
      toast("Saved assignment");
    }

    function render(){
      locations = loadLocations().map(normalizeLocation);
      materials = loadMaterials();

      const q = $("locSearch").value.trim().toLowerCase();
      const list = q
        ? locations.filter(l => (l.name||"").toLowerCase().includes(q) || (l.notes||"").toLowerCase().includes(q))
        : locations;

      const wrap = $("locList");
      wrap.innerHTML = "";

      if(list.length === 0){
        wrap.innerHTML = `<div class="muted">No areas yet. Add one on the left.</div>`;
        return;
      }

      for(const l of list){
        const card = document.createElement("div");
        card.style.border = "1px solid rgba(33,48,67,.7)";
        card.style.background = "rgba(9,13,18,.25)";
        card.style.borderRadius = "14px";
        card.style.padding = "12px";
        card.style.marginBottom = "10px";

        const assigned = new Set(l.materialIds || []);

        const matsHtml = materials
          .slice()
          .sort((a,b)=>{
            if(!!b.pinned !== !!a.pinned) return (b.pinned?1:0) - (a.pinned?1:0);
            return (a.name||"").localeCompare(b.name||"");
          })
          .map(m=>{
            const checked = assigned.has(m.id) ? "checked" : "";
            return `
              <label class="muted" style="display:flex;gap:10px;align-items:center;margin:6px 0">
                <input type="checkbox" data-assign="${l.id}" data-matid="${m.id}" ${checked} style="width:auto" />
                <span class="inline">
                  <span>${escapeHtml(m.name)}</span>
                  ${m.pinned ? `<span class="tag pin">Pinned</span>` : ``}
                  <span class="tag">${escapeHtml(m.category||"Basic")}</span>
                </span>
              </label>
            `;
          }).join("");

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start">
            <div>
              <div class="name">${escapeHtml(l.name)}</div>
              <div class="muted" style="margin-top:4px">${escapeHtml(l.notes||"")}</div>
            </div>
            <div class="actions">
              <button class="tiny" data-edit="${l.id}">Edit</button>
            </div>
          </div>
          <div class="sep"></div>
          <div class="muted">Assign materials to this area:</div>
          <div style="margin-top:8px;max-height:320px;overflow:auto;padding-right:6px">
            ${matsHtml || `<div class="muted">Add materials first.</div>`}
          </div>
        `;

        wrap.appendChild(card);
      }

      wrap.querySelectorAll("[data-edit]").forEach(btn=>{
        btn.addEventListener("click", ()=>{
          const l = locations.find(x=>x.id===btn.dataset.edit);
          if(l) fillForm(l);
          window.scrollTo({top:0,behavior:"smooth"});
        });
      });

      wrap.querySelectorAll("[data-assign]").forEach(cb=>{
        cb.addEventListener("change", ()=>{
          toggleAssign(cb.dataset.assign, cb.dataset.matid);
        });
      });
    }

    $("locSaveBtn").addEventListener("click", upsert);
    $("locResetBtn").addEventListener("click", resetForm);
    locDeleteBtn.addEventListener("click", remove);
    $("locSearch").addEventListener("input", render);

    resetForm();
    render();
  },

  // CHECKLIST (now supports grouping by locations)
  initChecklist(){
    setActiveNav();
    initSaveUI(); // NEW
    const materials = loadMaterials();
    const locations = loadLocations().map(normalizeLocation);

    const missing = materials
      .map(m=>({m, miss: stillNeed(m)}))
      .filter(x=>x.miss > 0)
      .sort((a,b)=>{
        if(!!b.m.pinned !== !!a.m.pinned) return (b.m.pinned?1:0) - (a.m.pinned?1:0);
        const ap = PRIORITY_SCORE[a.m.priority||"High"]||3;
        const bp = PRIORITY_SCORE[b.m.priority||"High"]||3;
        if(bp!==ap) return bp-ap;
        return b.miss - a.miss;
      });

    $("missingCount").textContent = String(missing.length);
    $("missingTotal").textContent = String(missing.reduce((a,x)=>a+x.miss,0));

    const view = $("checkView") ? $("checkView").value : "category";

    function renderCategory(){
      const byCat = new Map();
      for(const x of missing){
        const cat = x.m.category || "Unsorted";
        if(!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push(x);
      }
      return [...byCat.entries()];
    }

    function renderLocations(){
      // map matId -> missing record
      const missMap = new Map(missing.map(x=>[x.m.id, x]));
      const result = [];

      for(const loc of locations){
        const items = (loc.materialIds||[])
          .map(id=>missMap.get(id))
          .filter(Boolean);

        if(items.length){
          result.push([loc.name, items, loc.notes]);
        }
      }

      // any missing not assigned anywhere
      const assigned = new Set();
      for(const loc of locations) for(const id of (loc.materialIds||[])) assigned.add(id);

      const unassigned = missing.filter(x=>!assigned.has(x.m.id));
      if(unassigned.length) result.push(["Unassigned", unassigned, "Not mapped to a location yet."]);

      return result;
    }

    const wrap = $("checklistWrap");
    wrap.innerHTML = "";

    if(missing.length === 0){
      wrap.innerHTML = `<div class="muted">Checklist is empty — you’re not missing anything (or Needed is 0).</div>`;
    }else{
      const groups = (view === "locations") ? renderLocations().map(x=>({name:x[0], items:x[1], notes:x[2]}))
                                            : renderCategory().map(([name, items])=>({name, items, notes:""}));

      for(const g of groups){
        const card = document.createElement("div");
        card.className = "card";
        card.style.marginBottom = "14px";

        card.innerHTML = `
          <div class="hd">
            <h2>${escapeHtml(g.name)}</h2>
            <div class="badge">${g.items.length} item(s)</div>
          </div>
          <div class="bd">
            ${g.notes ? `<div class="muted" style="margin-bottom:10px">${escapeHtml(g.notes)}</div>` : ``}
            <table>
              <thead>
                <tr>
                  <th style="width:34%">Material</th>
                  <th style="width:14%">Priority</th>
                  <th style="width:14%">Rarity</th>
                  <th style="width:14%">Still need</th>
                  <th style="width:24%">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${g.items.map(x=>`
                  <tr>
                    <td>
                      <div class="inline">
                        <span class="name">${escapeHtml(x.m.name)}</span>
                        ${x.m.pinned ? `<span class="tag pin">Pinned</span>` : ``}
                      </div>
                    </td>
                    <td><span class="tag">${escapeHtml(x.m.priority||"")}</span></td>
                    <td><span class="tag ${rarityClass(x.m.rarity)}">${escapeHtml(x.m.rarity||"")}</span></td>
                    <td class="needpos">${x.miss}</td>
                    <td class="muted">${escapeHtml(x.m.notes||"")}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        `;
        wrap.appendChild(card);
      }
    }

    $("printBtn").addEventListener("click", ()=> window.print());

    $("exportTextBtn").addEventListener("click", ()=>{
      const lines = missing.map(x=>`- ${x.m.name} (${x.m.category||"Unsorted"}) : ${x.miss} remaining [${x.m.priority||"High"}]`);
      const text = `ARC Raiders – Raid Checklist\n\n${lines.join("\n")}\n`;
      download("arc-raiders-checklist.txt", text, "text/plain");
      toast("Exported checklist");
    });

    if($("checkView")){
      $("checkView").addEventListener("change", ()=> window.ARCT.initChecklist());
    }
  }
};
