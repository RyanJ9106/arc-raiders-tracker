// ARC Raiders Material Tracker (multi-page) - localStorage based
const STORE_KEY_MATS = "arc_raiders_materials_v2";
const STORE_KEY_RECIPES = "arc_raiders_recipes_v2";

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
function saveMaterials(list){ saveJSON(STORE_KEY_MATS, list); }

function stillNeed(m){
  return clamp0(clamp0(m.needed) - clamp0(m.have));
}

function exportMaterialsCSV(materials){
  const header = ["name","category","rarity","priority","needed","have","still_need","notes"];
  const clean = (s)=> `"${String(s ?? "").replaceAll('"','""')}"`;
  const rows = materials.map(m=>{
    const needed = clamp0(m.needed);
    const have = clamp0(m.have);
    return [
      clean(m.name),
      clean(m.category),
      clean(m.rarity),
      clean(m.priority),
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
function saveRecipes(list){ saveJSON(STORE_KEY_RECIPES, list); }

// recipe model:
// { id, name, crafts: { itemName, qty }, inputs: [{materialName, qtyPerCraft}], planQty, notes }
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

// Apply recipe plan -> updates materials "needed" totals by adding required amounts
function applyRecipePlanToNeeded(materials, recipe){
  // total crafts = recipe.planQty (number of times crafting this recipe)
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
      // auto-create missing material entry
      const m = {
        id: uid(),
        name: inp.materialName,
        category: "Basic",
        rarity: "Common",
        priority: "High",
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

// Reset needed to 0 for all materials (optional utility)
function resetAllNeeded(materials){
  for(const m of materials){
    m.needed = 0;
  }
  return materials;
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

// ---------- Page initializers ----------
window.ARCT = {
  setActiveNav,

  // HOME
  initHome(){
    setActiveNav();
    const materials = loadMaterials();
    const recipes = loadRecipes();

    const totalHave = materials.reduce((a,m)=>a+clamp0(m.have),0);
    const totalNeed = materials.reduce((a,m)=>a+clamp0(m.needed),0);
    const totalMissing = materials.reduce((a,m)=>a+stillNeed(m),0);

    $("homeMatCount").textContent = String(materials.length);
    $("homeRecCount").textContent = String(recipes.length);
    $("homeHave").textContent = String(totalHave);
    $("homeNeed").textContent = String(totalNeed);
    $("homeMissing").textContent = String(totalMissing);

    // Top 8 missing
    const top = [...materials]
      .map(m=>({m, miss: stillNeed(m)}))
      .filter(x=>x.miss>0)
      .sort((a,b)=>{
        const ap = PRIORITY_SCORE[a.m.priority||"High"]||3;
        const bp = PRIORITY_SCORE[b.m.priority||"High"]||3;
        if(bp!==ap) return bp-ap;
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
            <div class="name">${escapeHtml(x.m.name)}</div>
            <div class="muted">${escapeHtml(x.m.category||"")} • ${escapeHtml(x.m.priority||"")}</div>
          </div>
          <div class="${x.miss===0?"need0":"needpos"}" style="font-size:16px;font-weight:900">${x.miss}</div>
        `;
        list.appendChild(div);
      }
    }

    $("homeExportJson").addEventListener("click", ()=>{
      const payload = JSON.stringify({ materials, recipes }, null, 2);
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
      if(!confirm("Wipe ALL saved materials + recipes on this device?")) return;
      localStorage.removeItem(STORE_KEY_MATS);
      localStorage.removeItem(STORE_KEY_RECIPES);
      toast("Wiped");
      setTimeout(()=> location.reload(), 200);
    });
  },

  // MATERIALS
  initMaterials(){
    setActiveNav();
    let materials = loadMaterials();

    // Form elements
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

    function resetForm(){
      editId.value = "";
      formTitle.textContent = "Add material";
      matName.value = "";
      category.value = "Basic";
      rarity.value = "Common";
      needed.value = 0;
      have.value = 0;
      priority.value = "High";
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

    // KPIs
    function setKPIs(){
      $("kpiCount").textContent = String(materials.length);
      $("kpiNeed").textContent = String(materials.reduce((a,m)=>a+clamp0(m.needed),0));
      $("kpiMissing").textContent = String(materials.reduce((a,m)=>a+stillNeed(m),0));
    }

    function render(){
      materials = loadMaterials(); // refresh
      setKPIs();

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
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>
            <div class="name">${escapeHtml(m.name)}</div>
            <div class="muted" style="margin-top:4px;max-width:340px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${escapeHtml(m.notes||"")}">
              ${escapeHtml(m.notes||"")}
            </div>
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
    }

    // Export/Import
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
          // minimal normalize
          const normalized = data.map(x=>({
            id: String(x.id || uid()),
            name: String(x.name || "Unnamed"),
            category: String(x.category || "Basic"),
            rarity: String(x.rarity || "Common"),
            priority: String(x.priority || "High"),
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

  // RECIPES
  initRecipes(){
    setActiveNav();
    let recipes = loadRecipes();
    let materials = loadMaterials();

    function renderRecipeList(){
      recipes = loadRecipes();
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

    // Form
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
      $("rInputs").value = (r.inputs||[])
        .map(i=>`${i.materialName}:${clamp0(i.qtyPerCraft)}`)
        .join("\n");
      $("rDeleteBtn").style.display = "inline-block";
      window.scrollTo({top:0,behavior:"smooth"});
    }

    // inputs textarea format: "Scrap:10"
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

      recipes = list;
      renderRecipeList();
      toast(idx>=0?"Updated recipe":"Saved recipe");
      resetForm();
    }

    function deleteRecipe(id){
      if(!confirm("Delete this recipe?")) return;
      const list = loadRecipes().filter(r=>r.id!==id);
      saveRecipes(list);
      recipes = list;
      renderRecipeList();
      toast("Deleted");
      resetForm();
    }

    // Planning -> Needed totals
    function applyPlans(){
      let mats = loadMaterials();
      const recs = loadRecipes().map(normalizeRecipe);

      if($("planMode").value === "reset_then_apply"){
        mats = resetAllNeeded(mats);
      }
      for(const r of recs){
        mats = applyRecipePlanToNeeded(mats, r);
      }
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

    // Export/Import recipes
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
          recipes = loadRecipes();
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
      recipes = [];
      renderRecipeList();
      resetForm();
      toast("Wiped recipes");
    });

    resetForm();
    renderRecipeList();
  },

  // CHECKLIST
  initChecklist(){
    setActiveNav();
    const materials = loadMaterials();

    // group missing by category
    const missing = materials
      .map(m=>({m, miss: stillNeed(m)}))
      .filter(x=>x.miss > 0)
      .sort((a,b)=>{
        const ap = PRIORITY_SCORE[a.m.priority||"High"]||3;
        const bp = PRIORITY_SCORE[b.m.priority||"High"]||3;
        if(bp!==ap) return bp-ap;
        return b.miss - a.miss;
      });

    $("missingCount").textContent = String(missing.length);
    $("missingTotal").textContent = String(missing.reduce((a,x)=>a+x.miss,0));

    const byCat = new Map();
    for(const x of missing){
      const cat = x.m.category || "Unsorted";
      if(!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(x);
    }

    const wrap = $("checklistWrap");
    wrap.innerHTML = "";

    if(missing.length === 0){
      wrap.innerHTML = `<div class="muted">Checklist is empty — you’re not missing anything (or Needed is 0).</div>`;
    }else{
      for(const [cat, items] of byCat){
        const card = document.createElement("div");
        card.className = "card";
        card.style.marginBottom = "14px";
        card.innerHTML = `
          <div class="hd"><h2>${escapeHtml(cat)}</h2><div class="badge">${items.length} item(s)</div></div>
          <div class="bd">
            <table>
              <thead>
                <tr>
                  <th style="width:38%">Material</th>
                  <th style="width:14%">Priority</th>
                  <th style="width:14%">Rarity</th>
                  <th style="width:14%">Still need</th>
                  <th style="width:20%">Notes</th>
                </tr>
              </thead>
              <tbody>
                ${items.map(x=>`
                  <tr>
                    <td><span class="name">${escapeHtml(x.m.name)}</span></td>
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
      // plain text export, good for phone notes
      const lines = missing.map(x=>`- ${x.m.name} (${x.m.category||"Unsorted"}) : ${x.miss} remaining [${x.m.priority||"High"}]`);
      const text = `ARC Raiders – Raid Checklist\n\n${lines.join("\n")}\n`;
      download("arc-raiders-checklist.txt", text, "text/plain");
      toast("Exported checklist");
    });
  }
};
